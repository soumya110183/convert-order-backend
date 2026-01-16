/**
 * PRODUCTION-GRADE PHARMACEUTICAL PARSER - FINAL VERSION
 * Handles all vendor layouts: PDFs, Excel, Text files
 * Zero-tolerance for data loss, intelligent fallbacks
 */

import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { normalizeKey } from "../utils/normalizeKey.js";
import XLSX from "xlsx";

/* ========================================================================
   CONSTANTS & CONFIGURATION
======================================================================== */

const TEMPLATE_COLUMNS = [
  "CODE", "CUSTOMER NAME", "SAPCODE", "ITEMDESC",
  "ORDERQTY", "BOX PACK", "PACK", "DVN"
];

const QTY_LIMITS = { MIN: 1, MAX: 100000 }; // Increased max for bulk orders

// SAP/Product Code patterns
const CODE_PATTERNS = [
  /^[A-Z]{2,6}\d{3,6}$/i,     // FTINA0939, MICR, DIAPRIDE
  /^\d{4,8}$/,                 // 30049079 (8-digit codes common)
  /^[A-Z]\d{4,6}$/i            // A12345
];

// Pack size extraction patterns (comprehensive)
const PACK_PATTERNS = [
  /\((\d+)['\s]*s\)/gi,                    // (30'S), (15 S)
  /\b(\d+)['\s]*s\b/gi,                    // 15's, 30s
  /\*(\d+)\b/g,                            // *5, *30
  /\bx\s*(\d+)\b/gi,                       // x5, x 30
  /\b(\d+)\s*(?:tabs?|tablets?)\b/gi,     // 10 TABS
  /\b(\d+)\s*(?:caps?|capsules?)\b/gi,    // 10 CAPS
  /\/(\d+)\b/g,                            // 5/25
  /\b(\d+)\s*(?:ml|gm?|mg)\b/gi           // 100ML, 50GM
];

// Noise/Header keywords to exclude
const NOISE_KEYWORDS = [
  "TOTAL", "SUBTOTAL", "GRAND", "NET", "GROSS", "VALUE",
  "INVOICE", "CREDIT", "DEBIT", "PAGE", "CONTINUED",
  "ITEMNAME", "NOMFR", "HSNCODE", "BATCHNO", "BATCH",
  "EXP", "MFG", "MRP", "PTR", "PTS", "RATE", "AMOUNT",
  "TAXABLE", "GST", "CGST", "SGST", "IGST",
  "DISCOUNT", "FREIGHT", "TAX", "DIS",
  "NARRATION", "TERMS", "CONDITIONS", "SIGNATORY",
  "POWERED", "GENERATED", "AUTHORISED", "SEAL",
  "E&OE", "SUBJECT", "REMARK", "NOTE"
];

// Division/Company identifiers
const DIVISION_MARKERS = [
  /^(?:company|division|branch)\s*[:=]\s*(.+)/i,
  /^\[approx\s*value\s*:\s*[\d,.]+\]$/i  // [Approx Value : 13596.400]
];

const CITY_NAMES = [
  "ERNAKULAM", "KOZHIKODE", "THRISSUR", "TRIVANDRUM", "KANNUR",
  "PALAKKAD", "MALAPPURAM", "KOTTAYAM", "KOLLAM", "PATHANAMTHITTA",
  "DELHI", "MUMBAI", "BANGALORE", "CHENNAI", "HYDERABAD", "PUNE"
];

/* ========================================================================
   UTILITY FUNCTIONS
======================================================================== */

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function isNumeric(str) {
  return /^\d+$/.test(str);
}

function validateQty(value) {
  if (!value) return 0;
  
  const str = String(value).toLowerCase()
    .replace(/free|bonus|sch|scheme/gi, "");
  
  const match = str.match(/\d+/);
  if (!match) return 0;
  
  const n = parseInt(match[0], 10);
  return (n >= QTY_LIMITS.MIN && n <= QTY_LIMITS.MAX) ? n : 0;
}

function extractPackSize(itemDesc) {
  if (!itemDesc) return 0;
  
  const matches = [];
  
  for (const pattern of PACK_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(itemDesc)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 2000) {
        matches.push(num);
      }
    }
  }
  
  if (matches.length === 0) return 0;
  
  // Return most common value
  const freq = {};
  matches.forEach(m => freq[m] = (freq[m] || 0) + 1);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  
  return parseInt(sorted[0][0], 10);
}

function calculateBoxPack(qty, pack) {
  if (!qty || !pack || pack === 0) return 0;
  return Math.floor(qty / pack);
}

function normalizeItemDescWithPack(desc, pack) {
  if (!desc || !pack) return desc;

  const packRegex = new RegExp(`\\b${pack}\\s*['"\`]?(?:s)?\\b`, "gi");

  let cleaned = desc.replace(packRegex, "").trim();
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned;
}

function cleanItemDesc(text) {
  let cleaned = clean(text)
    .replace(/\[approx\s*value[^\]]*\]/gi, "")
    .replace(/\+\d+\s*(?:free|bonus)/gi, "")
    .replace(/\*+/g, " ")
    .toUpperCase();



  
  // Remove noise keywords
  NOISE_KEYWORDS.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "gi");
    cleaned = cleaned.replace(regex, "");
  });
  
  // Remove trailing codes (8 digits at end)
  cleaned = cleaned.replace(/\b\d{8}\b\s*$/g, "");
  
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function cleanCustomerName(text) {
  return clean(text)
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
    .replace(/(gstin|gst|pan|dl|mob|phone|email|fssai)[\s:].*/gi, "")
    .toUpperCase();
}

/* ========================================================================
   CONTEXT EXTRACTION
======================================================================== */

function extractCustomerName(lines) {
  const patterns = [
    /(?:supplier|customer|buyer|bill\s*to|ship\s*to)\s*[:=]\s*(.+)/i,
    /^([A-Z][A-Z\s&.]+(?:ENTERPRISES|AGENCIES|DISTRIBUTORS|PHARMA|MEDICALS?|LTD))/i
  ];
  
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = clean(lines[i]);
    
    // Skip metadata lines
    if (/^(gstin|gst|pan|dl|mob|phone|address|fssai)/i.test(line)) continue;
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const name = cleanCustomerName(match[1]);
        if (name.length > 3 && !/\d{10}/.test(name)) {
          return name;
        }
      }
    }
  }
  
  return "UNKNOWN CUSTOMER";
}

function extractDivision(line) {
  const cleaned = clean(line);
  
  // Explicit division markers
  for (const pattern of DIVISION_MARKERS) {
    const match = cleaned.match(pattern);
    if (match) {
      if (match[1]) {
        return match[1].replace(/[^\w\s\-]/g, "").trim().toUpperCase();
      }
      // Extract from approx value format
      const prevMatch = cleaned.match(/company\s*:\s*(\d+)\s*\(/i);
      if (prevMatch) return `DIV-${prevMatch[1]}`;
    }
  }
  
  // Short codes (CAR1, KER1)
  if (/^[A-Z]{2,6}\d{0,2}$/.test(cleaned) && cleaned.length >= 3 && cleaned.length <= 10) {
    return cleaned.toUpperCase();
  }
  
  // Uppercase text without prices/quantities
  if (/^[A-Z][A-Z\s\-()]{5,60}$/.test(cleaned)) {
    const tokens = cleaned.split(/\s+/);
    const hasNum = tokens.some(t => isNumeric(t));
    const hasPrice = tokens.some(t => /^\d+\.\d+$/.test(t));
    
    if (!hasNum && !hasPrice && !CITY_NAMES.includes(cleaned)) {
      return cleaned;
    }
  }
  
  // Handle "DIV NAME APPROX VALUE 12345"
  if (cleaned.includes("APPROX VALUE")) {
    const parts = cleaned.split("APPROX VALUE");
    if (parts[0] && parts[0].length > 2) {
      return parts[0].trim().toUpperCase();
    }
  }

  return "";
}

function cleanDVN(text) {
  if (!text) return "";
  return text.split(/approx\s*value/i)[0].trim().toUpperCase();
}

function isTableStop(line) {
  const patterns = [
    /^(?:grand|net|sub|page)\s*total/i,
    /^total\s*(?:order|value|amount)/i,
    /^(?:split|note|narration|terms)/i,
    /^authorised\s*signatory/i,
    /^powered\s*by/i,
    /^for,?\s+[A-Z]/i  // "For, AYYAPPA ENTERPRISES"
  ];
  
  return patterns.some(p => p.test(line));
}

/* ========================================================================
   ROW PARSING - MULTI-STRATEGY
======================================================================== */

function tokenizeLine(line) {
  return line.split(/\s+/).filter(t => t.length > 0);
}

function isProductCode(token) {
  if (!token || token.length < 3) return false;
  return CODE_PATTERNS.some(p => p.test(token));
}

function parseRow(line, lineIdx = 0) {
  const cleaned = clean(line);
  if (!cleaned || cleaned.length < 5) return null;
  
  // Stop at table end
  if (isTableStop(cleaned)) return null;
  
  const tokens = tokenizeLine(cleaned);
  if (tokens.length < 2) return null;
  
  const result = {
    sapcode: "",
    itemdesc: "",
    qty: 0,
    pack: 0
  };
  
  let startIdx = 0;
  
  // Skip serial number (1-3 digits at start)
  if (tokens.length > 2 && /^\d{1,3}$/.test(tokens[0])) {
    startIdx = 1;
  }
  
  // Extract product code (if present)
  for (let i = startIdx; i < Math.min(startIdx + 3, tokens.length); i++) {
    if (isProductCode(tokens[i])) {
      result.sapcode = tokens[i].toUpperCase();
      startIdx = i + 1;
      break;
    }
  }
  
  // Find quantity (scan from right, skip prices/years)
  let qtyIdx = -1;
  for (let i = tokens.length - 1; i >= startIdx; i--) {
    const token = tokens[i];
    
    // Skip prices
    if (token.includes(".")) continue;
    
    // Skip non-numeric
    if (!isNumeric(token)) continue;
    
    // Skip "FREE" quantities
    if (i > 0 && /free|bonus|sch/i.test(tokens[i - 1])) continue;
    
    // Skip years
    const num = parseInt(token, 10);
    if (num >= 2020 && num <= 2030) continue;
    
    // Skip large codes (8 digits likely HSN)
    if (token.length === 8 && num > 10000000) continue;
    
    const qty = validateQty(token);
    if (qty > 0) {
      result.qty = qty;
      qtyIdx = i;
      break;
    }
  }
  
  if (result.qty === 0) return null;
  
  // Extract description
  let endIdx = qtyIdx !== -1 ? qtyIdx : tokens.length;
  

  // Refine end: stop at prices, dates, or metadata
  for (let i = startIdx; i < endIdx; i++) {
    const token = tokens[i];
    
    // Stop at prices
    if (token.includes(".") && /\d/.test(token)) {
      endIdx = i;
      break;
    }
    
    // Stop at dates
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(token)) {
      endIdx = i;
      break;
    }
    
    // Stop at metadata columns
    if (/^(exp|mfg|batch|mrp|ptr)$/i.test(token)) {
      endIdx = i;
      break;
    }
  }
  
  if (endIdx > startIdx) {
    result.itemdesc = cleanItemDesc(tokens.slice(startIdx, endIdx).join(" "));
  }
  
  // Validate
  if (!result.itemdesc || result.itemdesc.length < 2) return null;
  
  // Check for noise in description
  const upper = result.itemdesc.toUpperCase();
  if (NOISE_KEYWORDS.some(kw => upper === kw || upper.startsWith(kw + " "))) {
    return null;
  }
  
  // Extract pack size
  result.pack = extractPackSize(result.itemdesc);
result.itemdesc = normalizeItemDescWithPack(result.itemdesc, result.pack);
  
  return result;
}

/* ========================================================================
   PDF EXTRACTION
======================================================================== */

export async function extractPurchaseOrderPDF(file) {
  try {
    const { lines } = await extractTextFromPDFAdvanced(file.buffer);
    const customerName = extractCustomerName(lines);
    
    console.log(`📄 PDF: ${lines.length} lines`);
    
    const dataRows = [];
    let currentDiv = "";
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleaned = clean(line);
      
      if (!cleaned) continue;
      
      // Check table stop
      if (isTableStop(cleaned)) {
        console.log(`✓ Stop at line ${i + 1}: ${cleaned.substring(0, 40)}`);
        break;
      }
      
      // Check division
   // Check division ONLY after table starts
if (inTable) {
  const div = extractDivision(cleaned);
  if (div) {
    currentDiv = cleanDVN(div);
    continue;
  }
}

      
      // Try parsing as data
      const row = parseRow(cleaned, i);
      if (row) {
        if (!inTable) {
          console.log(`✓ Data starts at line ${i + 1}`);
          inTable = true;
        }
        
        const pack = row.pack;
        const boxPack = calculateBoxPack(row.qty, pack);
        
        dataRows.push([
          row.productcode || "",       
          customerName,         // CUSTOMER NAME
          row.sapcode,          // SAPCODE
          row.itemdesc,         // ITEMDESC
          row.qty,              // ORDERQTY
          boxPack,
          pack,
          currentDiv
        ]);
      }
    }
    
    console.log(`✅ PDF: ${dataRows.length} rows extracted`);
    return createOutput(dataRows, customerName);
    
  } catch (err) {
    console.error("❌ PDF failed:", err);
    return createOutput([], "UNKNOWN CUSTOMER", "PDF_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   EXCEL EXTRACTION
======================================================================== */

export async function extractInvoiceExcel(file) {
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    
    if (!rows.length) return createOutput([], "UNKNOWN CUSTOMER", "EMPTY_FILE");
    
    console.log(`📊 Excel: ${rows.length} rows`);
    
    const topText = rows.slice(0, 15).map(r => r.join(" ")).join("\n");
    const customerName = extractCustomerName(topText.split("\n"));
    
    // Find header row (flexible)
    let headerIdx = -1;
    let colMap = { item: -1, qty: -1, code: -1, pack: -1 };
    
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const row = rows[i].map(c => normalizeKey(String(c)));
      
      // Skip obvious non-headers
      if (row.some(c => c.includes("invoice") || c.includes("credit"))) continue;
      
      const itemIdx = row.findIndex(c => 
        /item|product|desc|name|particular|material/i.test(c) && 
        !/total/i.test(c)
      );
      
      const qtyIdx = row.findIndex(c => 
        /(?:ord|order|qty|quantity|bil)/i.test(c) && 
        !/free|sch/i.test(c)
      );
      
      if (itemIdx !== -1 && qtyIdx !== -1) {
        // Verify it's a header (no actual data)
        const origRow = rows[i];
        const hasQty = origRow.some(c => validateQty(c) > 0);
        const hasCode = origRow.some(c => isProductCode(String(c)));
        
        if (hasQty || hasCode) {
          // This is data, not header
          headerIdx = i - 1;
          break;
        }
        
        headerIdx = i;
        colMap.item = itemIdx;
        colMap.qty = qtyIdx;
        colMap.code = row.findIndex(c => /code|sap|mat|hsn/i.test(c));
        colMap.pack = row.findIndex(c => /pack/i.test(c) && !/box/i.test(c));
        
        console.log(`✓ Header at row ${i + 1}`);
        break;
      }
    }
    
    const dataRows = [];
    let currentDiv = "";
    const startRow = Math.max(0, headerIdx + 1);
    
    console.log(`📊 Starting from row ${startRow + 1}`);
     let inTable = false;
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
     

      // Check division (single filled cell)
      // Check division ONLY after table starts
if (inTable) {
  const filled = row.filter(c => c && String(c).trim());
  if (filled.length === 1) {
    const div = extractDivision(String(filled[0]));
    if (div) {
      currentDiv = cleanDVN(div);
      continue;
    }
  }
}

      
      // Check stop
      const lineText = row.join(" ");
      if (isTableStop(lineText)) break;
      
      // Strategy 1: Column mapping
      let item = "";
      let qty = 0;
      let code = "";
      let pack = 0;
      
      if (headerIdx !== -1 && colMap.item !== -1) {
        item = cleanItemDesc(String(row[colMap.item] || ""));
        qty = validateQty(row[colMap.qty]);
        
        if (colMap.code !== -1) {
          code = String(row[colMap.code] || "").toUpperCase();
        }
        
        if (colMap.pack !== -1) {
          pack = validateQty(row[colMap.pack]);
        }
        
        if (!pack && item) {
          pack = extractPackSize(item);
        }
        
        if (item && qty > 0) {
          const boxPack = calculateBoxPack(qty, pack);
          dataRows.push(["", customerName, code, item, qty, boxPack, pack, currentDiv]);
          continue;
        }
      }
      
      // Strategy 2: Semantic parsing
      const parsed = parseRow(lineText, i);
      if (parsed) {
        const boxPack = calculateBoxPack(parsed.qty, parsed.pack);
        dataRows.push([
          customerName,
          parsed.code || "",
          parsed.sapcode,
          parsed.itemdesc,
          parsed.qty,
          boxPack,
          parsed.pack,
          currentDiv
        ]);
      }
    }
    
    console.log(`✅ Excel: ${dataRows.length} rows extracted`);
    return createOutput(dataRows, customerName);
    
  } catch (err) {
    console.error("❌ Excel failed:", err);
    return createOutput([], "UNKNOWN CUSTOMER", "EXCEL_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   TEXT EXTRACTION
======================================================================== */

export async function extractOrderText(file) {
  try {
    const text = file.buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    console.log(`📝 Text: ${lines.length} lines`);
    
    const customerName = extractCustomerName(lines);
    const dataRows = [];
    let currentDiv = "";
   
    let inTable = false;   // ✅ FIX

    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleaned = clean(line);
      
      if (!cleaned) continue;
      
      // Check stop
      if (isTableStop(cleaned)) break;
      
      // Check division
  if (inTable) {
        const div = extractDivision(cleaned);
        if (div) {
          currentDiv = cleanDVN(div);
          continue;
        }
      }

      
      // Parse data
      const row = parseRow(cleaned, i);
      if (row) {
        if (!inTable) inTable = true;   // ✅ FIX

        const boxPack = calculateBoxPack(row.qty, row.pack);
        dataRows.push([
          row.code || "",
          customerName,
          row.sapcode,
          row.itemdesc,
          row.qty,
          boxPack,
          row.pack,
          currentDiv
        ]);
      }
    }
    
    console.log(`✅ Text: ${dataRows.length} rows extracted`);
    return createOutput(dataRows, customerName);
    
  } catch (err) {
    console.error("❌ Text failed:", err);
    return createOutput([], "UNKNOWN CUSTOMER", "TXT_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   OUTPUT GENERATOR
======================================================================== */

function createOutput(dataRows, customerName, error = null) {
  const templateRows = dataRows.map(row => {
    const [code, customer, sapcode, itemdesc, qty, boxpack, pack, dvn] = row;
    
    return {
      "CODE": code || "",
      "CUSTOMER NAME": customer || customerName,
      "SAPCODE": sapcode || "",
      "ITEMDESC": itemdesc || "",
      "ORDERQTY": qty || 0,
      "BOX PACK": boxpack || 0,
      "PACK": pack || 0,
      "DVN": dvn || ""
    };
  });
  
  return {
    meta: { customerName },
    headers: TEMPLATE_COLUMNS,
    dataRows: templateRows,
    extractedFields: createFieldMetadata(templateRows),
    error
  };
}

function createFieldMetadata(rows) {
  if (!rows.length) return [];
  
  const sample = rows[0];
  
  return Object.keys(sample).map(key => ({
    id: key.toLowerCase().replace(/\s+/g, "_"),
    fieldName: key,
    sampleValue: String(sample[key] || ""),
    autoMapped: key,
    confidence: ["ITEMDESC", "ORDERQTY"].includes(key) ? "high" : "medium"
  }));
}

/* ========================================================================
   MAIN ENTRY
======================================================================== */

export async function unifiedExtract(file) {
  if (!file?.buffer) {
    return createOutput([], "UNKNOWN CUSTOMER", "EMPTY_FILE");
  }
  
  const name = (file.originalname || "").toLowerCase();
  
  try {
    if (name.endsWith(".pdf")) {
      return await extractPurchaseOrderPDF(file);
    }
    
    if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
      return await extractInvoiceExcel(file);
    }
    
    if (name.endsWith(".txt")) {
      return await extractOrderText(file);
    }
    
    return createOutput([], "UNKNOWN CUSTOMER", "UNSUPPORTED_FORMAT");
    
  } catch (err) {
    console.error("❌ Fatal extraction error:", err);
    return createOutput([], "UNKNOWN CUSTOMER", "EXTRACTION_FAILED");
  }
}