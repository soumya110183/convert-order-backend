/**
 * PRODUCTION-GRADE UNIFIED PARSER
 * Strategy: Hybrid Rule-Based Pipeline
 * 1. Normalization -> 2. Context Analysis -> 3. Multi-Strategy Row Extraction -> 4. Validation
 */

import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { normalizeKey } from "../utils/normalizeKey.js";
import XLSX from "xlsx";

/* ========================================================================
   CONSTANTS & CONFIG
   ======================================================================== */

const TEMPLATE_COLUMNS = [
  "CODE", "CUSTOMER NAME", "SAPCODE", "ITEMDESC",
  "ORDERQTY", "BOX PACK", "PACK", "DVN"
];

const QTY_LIMITS = { MIN: 1, MAX: 10000 };
const SAPCODE_REGEX = /^\d{4,7}$/; // Strict 4-7 digit check
const HSN_REGEX = /^\d{8}$/;       // HSN is usually 8 digits

// Banned words for Item Description
const BANNED_ITEM_KEYWORDS = [
  "TOTAL", "SUBTOTAL", "GRAND TOTAL", "NET VALUE", "GROSS VALUE",
  "PAGE", "INVOICE", "CONTINUED", "NOTE", "REMARKS", "AUTHORISED",
  "SIGNATORY", "POWERED BY", "AMOUNT", "TAXABLE", "GSTIN"
];

const CITY_BLOCKLIST = [
  "ERNAKULAM", "KOZHIKODE", "THRISSUR", "TRIVANDRUM", "KANNUR", 
  "WAYANAD", "PALAKKAD", "MALAPPURAM", "IDUKKI", "KOTTAYAM", 
  "ALAPPUZHA", "KOLLAM", "PATHANAMTHITTA", "KASARAGOD", "COCHIN",
  "CALICUT", "TRICHUR"
];

/* ========================================================================
   1. UTILITY LAYER (Helpers)
   ======================================================================== */

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * Validates integer quantity within business limits
 */
function validateQty(value) {
  if (value === null || value === undefined) return 0;
  // Remove commas, spaces
  const cleanVal = String(value).replace(/[,\s]/g, "");
  // Check if it's a number
  if (!/^\d+$/.test(cleanVal)) return 0;
  
  const n = parseInt(cleanVal, 10);
  return (n >= QTY_LIMITS.MIN && n <= QTY_LIMITS.MAX) ? n : 0;
}

/**
 * Cleans extracted item description
 */
function cleanItemDesc(text) {
  return clean(text)
    .replace(/\[approx\s*value\s*:.*?\]/gi, "")
    // Fix common OCR/Typo for pack sizes e.g. "10''s" or "10's"
    .replace(/\b\d+\s*['"]+\s*s\b/gi, "")
    .replace(/\b\d+\s+(strip|pack|box|bottle|vial|tube)\b/gi, "")
    // Remove known noise
    .replace(/\*\d+/g, "")
    .replace(/\+\d+\s*(free|bonus)/gi, "")
    .replace(/^[\s*]+|[\s*]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Clean customer name extraction
 */
function cleanCustomerName(text) {
  return clean(text)
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "") // Dates
    .replace(/(address|gstin|gst|pan|dl\s*no|mob|mobile|email|phone|fssai|tin)[\s:].*/gi, "")
    .replace(/[,;:]+$/, "")
    .trim();
}

/* ========================================================================
   2. CONTEXT ANALYSIS LAYER (Customer, Headers)
   ======================================================================== */

function extractCustomerName(lines) {
  // ... (keep existing implementation or ensure check)
  const patterns = [
    /(?:supplier|party\s*name|buyer|customer|bill\s*to|ship\s*to)\s*[:\-]\s*(.+)/i,
    /^([A-Z][A-Z\s&.]+(?:ENTERPRISES|AGENCIES|DISTRIBUTORS|PHARMA|HEALTHCARE|MEDICALS?|LTD|PVT|LIMITED|INC))/i,
  ];

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = clean(lines[i]);
    if (/^(gstin|gst|pan|dl|mob|email|phone|address|fssai|tin)/i.test(line)) continue;

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const customer = cleanCustomerName(match[1]);
        if (customer.length > 3 && !/\d{10}/.test(customer)) {
          return customer;
        }
      }
    }
  }
  return "UNKNOWN CUSTOMER";
}

/**
 * Strict Division Line Detection
 */
function isDivisionLine(line) {
  // 1. Exclude known customer entity keywords
  if (/DISTRIBUTORS|AGENCIES|ENTERPRISES|TRADERS|PHARMA|HEALTHCARE|MEDICALS?|LTD|PVT|LIMITED|INC|CORP/i.test(line)) {
    if (!/^(division|company)/i.test(line)) {
        return false;
    }
  }
  
  // 2. Exclude Cities (False Positives)
  const upperLine = line.toUpperCase();
  if (CITY_BLOCKLIST.some(city => upperLine.includes(city))) {
      // If it's JUST the city name (or very short), reject it
      if (line.length < 20 || /^[A-Z\s]+$/.test(line)) {
          return false;
      }
  }

  // 3. Exclude totals and noise
  if (/TOTAL|ORDER|PURCHASE|INVOICE|SUMMARY|ABSTRACT/i.test(line)) {
    return false;
  }

  // 4. Explicit "Company: ..." or "Division: ..." pattern
  if (/^(company|division)\s*[:\-]\s*/i.test(line)) {
    return true;
  }

  // 5. Fallback: Must be mostly uppercase and have semantic length
  return /^[A-Z][A-Z0-9\- ()\.]{5,}$/.test(line);
}

function isTableStopLine(line) {
  return /^(grand\s*total|net\s*total|gross\s*total|total\s*order|end\s*of\s*order|page\s*total|approx\s*value)/i.test(line);
}

/* ========================================================================
   3. SEMANTIC ROW EXTRACTION LAYER (The Core Logic)
   ======================================================================== */

function tokenizeLine(line) {
  return line.split(/\s+/).filter(t => t.length > 0);
}

function parseRowFormatted(line) {
  const cleanLine = clean(line);
  if (!cleanLine) return null;

  if (isTableStopLine(cleanLine)) return null;
  if (!/\d/.test(cleanLine)) return null;
  
  const isNoise = BANNED_ITEM_KEYWORDS.some(kw => cleanLine.toUpperCase().includes(kw));
  if (isNoise) return null;

  const tokens = tokenizeLine(cleanLine);
  if (tokens.length < 2) return null;

  // --- ANALYSIS PHASE ---
  let sapIndex = -1;
  let qtyIndex = -1;
  let hsnIndex = -1;
  let matches = { sap: null, qty: 0, item: null };

  tokens.forEach((token, i) => {
    // Check SAP (4-7 digits)
    if (SAPCODE_REGEX.test(token)) {
      // Ambiguity Check: Dosage vs SAP
      // If the number is a common dosage (250, 500, 650, 1000) AND it's not the very first token
      // we assume it's part of the name unless we are very sure.
      const num = parseInt(token);
      const isDosageLike = [250, 500, 650, 1000].includes(num);
      
      if (isDosageLike && i > 0) {
          // Ignore as SAP candidate
      } else if (sapIndex === -1) {
          sapIndex = i;
      }
    }
    // Check HSN (8 digits)
    if (HSN_REGEX.test(token)) {
      hsnIndex = i;
    }
  });

  // Backward search for Quantity (usually towards the end, but before prices)
  // We look for the last valid integer that is NOT a price (no decimal)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    // Skip prices (anything with dot)
    if (token.includes(".")) continue;
    // Skip strict exclusions
    if (/^(free|bonus|sch|total)$/i.test(token)) continue;
    
    // If it's the SAP code found earlier, stop looking rightwards for QTY? 
    // Actually QTY usually comes AFTER SAP or AFTER Item.
    
    // Check validation
    const val = validateQty(token);
    if (val > 0) {
      qtyIndex = i;
      matches.qty = val;
      break; // Found the right-most valid quantity
    }
  }

  // If we found HSN but no SAP, ensure we don't treat HSN as SAP
  if (sapIndex !== -1 && tokens[sapIndex].length === 8) {
    // It's actually HSN, not SAP (if strict 4-7 rule didn't catch it)
    sapIndex = -1; 
  }

  // --- STRATEGY A: COMPOSITE PHARMA FORMAT ---
  // Format: [Serial] [MFR] [ITEM NAME] [PACK] [HSN/SAP] [QTY] ...
  // This is the most complex one. We expect Item Name to be to the left of Pack/HSN/Qty.
  
  if (matches.qty > 0) {
    let startIndex = 0;
    
    // Skip Serial Number (1-3 digits at start)
    if (/^\d{1,3}$/.test(tokens[0]) && tokens.length > 2) {
      startIndex = 1;
    }

    // Determine End of Description
    // The description ends when we hit:
    // 1. Pack Size (10's, 15 S, etc.)
    // 2. HSN or SAP Code
    // 3. The Quantity itself
    // 4. A Price (decimal)
    
    let endIndex = tokens.length; // Fallback

    // --- STRATEGY B: SAP CODE FIRST ---
    // Format: [Serial] [SAP 6-7 digits] [ITEM NAME] [PACK] [QTY] ...
    // E.g. "1 203034 ANORELIEF CREAM 30 GM 10"
    
    // Check if the token at startIndex is a valid SAP code (6-7 digits usually here)
    if (tokens[startIndex] && /^\d{6,7}$/.test(tokens[startIndex])) {
        // We found SAP at start. Update sapIndex if not strict
        sapIndex = startIndex;
        startIndex++; // Move description start forward
    }

    for (let i = startIndex; i < tokens.length; i++) {
        const t = tokens[i];
        const nextT = tokens[i+1];

        // Stop at SAP (if we found another one, though unlikely if Strategy B matched)
        if (i === sapIndex && i > startIndex) { endIndex = i; break; }
        
        // Stop at HSN
        if (i === hsnIndex) { endIndex = i; break; }

        // Stop at QTY
        if (i === qtyIndex) { endIndex = i; break; }

        // Stop at Price
        if (t.includes(".") && /\d/.test(t)) { endIndex = i; break; }

        // Stop at Pack Size Pattern
        // "10 S", "10'S", "10 TAB", "1X10", "30 GM"
        const isPackPattern = 
            (/^\d+['"]?s?$/i.test(t) && (!nextT || /^[a-z]+$/i.test(nextT) === false)) || // 10s
            (/^\d+$/.test(t) && nextT && /^(s|gm|ml|kg|tab|cap|tube)$/i.test(nextT)) || // 10 s, 30 gm
            (/^\d+[xX]\d+$/.test(t)); // 1x10
        
        if (isPackPattern) { endIndex = i; break; }
    }

    // Extract Description
    if (endIndex > startIndex) {
        const rawDesc = tokens.slice(startIndex, endIndex).join(" ");
        matches.item = cleanItemDesc(rawDesc);
    }
  }

  matches.sap = (sapIndex !== -1) ? tokens[sapIndex] : "";

  // Helper validation
  if (isValidExtraction(matches)) {
    return {
        sapcode: matches.sap,
        itemdesc: matches.item,
        orderqty: matches.qty
    };
  }

  return null;
}

function isValidExtraction(m) {
  if (!m.item || m.item.length < 3) return false;
  if (!m.qty || m.qty <= 0) return false;
  
  // Re-check for keywords in extracted description
  const upperDesc = m.item.toUpperCase();
  if (BANNED_ITEM_KEYWORDS.some(kw => upperDesc.includes(kw))) return false;

  return true;
}

/* ========================================================================
   4. FILE-TYPE HANDLERS
   ======================================================================== */

// --- PDF HANDLER ---
export async function extractPurchaseOrderPDF(file) {
  try {
    const { lines } = await extractTextFromPDFAdvanced(file.buffer);
    const customerName = extractCustomerName(lines);
    const dataRows = [];

    // State Machine
    let currentDVN = "";
    
    // Multi-line context (unlikely needed with robust row parsing, but kept for PDF split lines)
    // For deterministic behavior, we will strictly process line-by-line first.
    // Enhanced PDF parser usually merges rows, so we assume 1 line = 1 row mostly.

    for (const line of lines) {
      const cleanLine = clean(line);
      if (!cleanLine) continue;

      // 1. Division Check
      if (isDivisionLine(cleanLine)) {
        currentDVN = cleanLine;
        continue;
      }

      // 2. Row Extraction
      const row = parseRowFormatted(cleanLine);
      if (row) {
        dataRows.push([
            customerName,
            row.sapcode,
            row.itemdesc,
            row.orderqty,
            currentDVN
        ]);
      }
    }

    return createTemplateOutput(dataRows, customerName);

  } catch (err) {
    console.error("❌ PDF extraction failed:", err);
    return createEmptyResult("PDF_EXTRACTION_FAILED");
  }
}

// --- EXCEL HANDLER ---
export async function extractInvoiceExcel(file) {
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellText: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!rows.length) return createEmptyResult("EMPTY_FILE");

    // Try to find customer name from top rows
    const topText = rows.slice(0, 10).map(r => r.join(" ")).join("\n");
    const customerName = extractCustomerName(topText.split("\n"));

    // Find Header Row
    // We look for [Product/Item] AND [Qty]
    let headerIdx = -1;
    let colMap = { item: -1, qty: -1, sap: -1, code: -1 };
    
    // Scan deeper for headers (up to 50 rows)
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const row = rows[i].map(c => normalizeKey(String(c)));
        
        // Skip obvious data rows that might look like headers if we're not careful
        // (but usually headers don't have quantities)
        
        // Find columns with fuzzy matching
        const descIdx = row.findIndex(c => 
            (c.includes("item") || c.includes("product") || c.includes("desc") || c.includes("particular") || c.includes("material")) && 
            !c.includes("total")
        );
        
        const qtyIdx = row.findIndex(c => 
            (c.includes("qty") || c.includes("quantity") || c.includes("order") || c.includes("bil")) && 
            !c.includes("free") && !c.includes("sch")
        );
        
        if (descIdx !== -1 && qtyIdx !== -1) {
            headerIdx = i;
            colMap.item = descIdx;
            colMap.qty = qtyIdx;
            // SAP/Code is optional but helpful
            colMap.sap = row.findIndex(c => c.includes("sap") || c.includes("code") || c.includes("hsn"));
            break;
        }
    }

    const dataRows = [];
    let currentDVN = "";

    // Process Data
    const startRow = headerIdx !== -1 ? headerIdx + 1 : 0;
    
    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        
        // Division Check (if it's a single cell row usually)
        const filledCells = row.filter(c => c && String(c).trim());
        if (filledCells.length === 1) {
            const cellVal = String(filledCells[0]).trim();
            if (isDivisionLine(cellVal)) {
                currentDVN = cellVal;
                continue;
            }
        }

        // Extraction Strategy
        let item = "";
        let qty = 0;
        let sap = "";
        let usedStrategy = "none";

        // Strategy 1: Column Mapping (if headers found)
        if (headerIdx !== -1) {
            item = String(row[colMap.item] || "");
            qty = validateQty(row[colMap.qty]);
            if (colMap.sap !== -1) sap = String(row[colMap.sap] || "");
            
            if (isValidExtraction({ item, qty })) {
                usedStrategy = "column";
            }
        } 
        
        // Strategy 2: Semantic Row Parsing (Fallback or Primary if no headers)
        // If Strategy 1 failed or headers weren't found, try parsing the whole row text
        if (usedStrategy === "none") {
            const line = row.join(" "); // Join with space to simulate text line
            // We use the same powerful logic used for PDFs
            const parsed = parseRowFormatted(line);
            if (parsed) {
                item = parsed.itemdesc;
                qty = parsed.orderqty;
                sap = parsed.sapcode;
                usedStrategy = "semantic";
            }
        }

        // Post-processing
        item = cleanItemDesc(item);

        if (isValidExtraction({ item, qty })) {
            dataRows.push([
                customerName,
                sap,
                item,
                qty,
                currentDVN
            ]);
        }
    }

    return createTemplateOutput(dataRows, customerName);

  } catch (err) {
    console.error("❌ Excel extraction failed:", err);
    return createEmptyResult("EXCEL_EXTRACTION_FAILED");
  }
}

// --- TEXT HANDLER ---
export async function extractOrderText(file) {
  try {
     const text = file.buffer.toString("utf8");
     const lines = text.split(/\r?\n/);
     const customerName = extractCustomerName(lines);
     
     const dataRows = [];
     let currentDVN = "";

     for (const line of lines) {
        const cleanLine = clean(line);
        if (!cleanLine) continue;

        if (isDivisionLine(cleanLine)) {
            currentDVN = cleanLine;
            continue;
        }

        const row = parseRowFormatted(cleanLine);
        if (row) {
            dataRows.push([
                customerName,
                row.sapcode,
                row.itemdesc,
                row.orderqty,
                currentDVN
            ]);
        }
     }
     
     return createTemplateOutput(dataRows, customerName);

  } catch (err) {
      return createEmptyResult("TXT_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   5. OUTPUT GENERATOR
   ======================================================================== */

function createTemplateOutput(dataRows, customerName) {
  const templateRows = dataRows.map(row => {
    const [customer, sapcode, itemdesc, orderqty, dvn] = row;

    return {
      "CODE": "",
      "CUSTOMER NAME": customer || customerName,
      "SAPCODE": sapcode || "",
      "ITEMDESC": itemdesc || "",
      "ORDERQTY": orderqty || 0,
      "BOX PACK": 0,
      "PACK": 0,
      "DVN": dvn || ""
    };
  });

  return {
    meta: { customerName },
    headers: TEMPLATE_COLUMNS,
    dataRows: templateRows,
    extractedFields: createExtractedFieldsMetadata(templateRows)
  };
}

function createExtractedFieldsMetadata(dataRows) {
  if (!dataRows.length) return [];
  const sample = dataRows[0];
  // Basic metadata generation
  return Object.keys(sample).map(key => ({
    id: key.toLowerCase(),
    fieldName: key,
    sampleValue: String(sample[key] || ""),
    autoMapped: key,
    confidence: "high"
  }));
}

function createEmptyResult(error = null) {
  return {
    meta: { customerName: "UNKNOWN CUSTOMER" },
    headers: TEMPLATE_COLUMNS,
    dataRows: [],
    extractedFields: [],
    error
  };
}

/* ========================================================================
   MAIN ENTRY POINT
   ======================================================================== */

export async function unifiedExtract(file) {
  if (!file?.buffer) return createEmptyResult("EMPTY_FILE");

  const name = (file.originalname || "").toLowerCase();

  if (name.endsWith(".pdf")) return extractPurchaseOrderPDF(file);
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return extractInvoiceExcel(file);
  if (name.endsWith(".txt")) return extractOrderText(file);

  return createEmptyResult("UNSUPPORTED_FORMAT");
}