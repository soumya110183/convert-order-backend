/**
 * UNIVERSAL INVOICE PARSER v5.0
 * ✅ Handles ALL pharma invoice formats
 * ✅ Multiple extraction strategies with fallbacks
 * ✅ Aggressive product detection
 * ✅ Debug mode for troubleshooting
 */

import XLSX from "xlsx-js-style";
import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { detectCustomerFromInvoice } from "./customerDetector.js";

/* =====================================================
   CONFIGURATION
===================================================== */

const DEBUG_MODE = true; // Set to false in production
const MIN_PRODUCT_LENGTH = 3;
const MIN_QTY = 1;
const MAX_QTY = 999999;

function debug(...args) {
  if (DEBUG_MODE) console.log(...args);
}
function isPackToken(token = "") {
  // Matches: 10S, 10'S, 30S, 30'S
  return /^\d+['`"]?S$/i.test(token);
}

function detectExcelStructure(rows) {
  let numericHeavyRows = 0;
  let textHeavyRows = 0;

  for (const row of rows.slice(0, 20)) {
    const text = Array.isArray(row) ? row.join(" ") : String(row);
    const numbers = (text.match(/\d+/g) || []).length;
    const letters = (text.match(/[A-Z]/gi) || []).length;

    if (numbers >= 3 && letters <= 10) numericHeavyRows++;
    if (letters >= 10) textHeavyRows++;
  }

  // If many numeric-heavy rows → PDF-style dump
  if (numericHeavyRows >= 5) return "PDF_LIKE";

  return "TABLE";
}
function mergeLooseRows(lines) {
  const merged = [];
  let buffer = "";

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;

    // Flush on approx value / totals
    if (/APPROX|TOTAL|COMPANY\s*:/i.test(text)) {
      if (buffer) merged.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += " " + text;

    // Flush when quantity + price detected
    const qty = extractQuantity(buffer);
    if (qty) {
      merged.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) merged.push(buffer.trim());

  return merged;
}

/* =====================================================
   JUNK DETECTION - Strict but not too strict
===================================================== */

const HARD_JUNK_PATTERNS = [
  // Only absolute junk - be conservative
  /^(PAGE|PRINTED\s*BY|SIGNATURE|PREPARED\s*BY|CHECKED\s*BY)/i,
  /^(GSTIN|DL\s*NO|FSSAI|LICENSE\s*NO)/i,
  /^(PIN\s*CODE|PHONE|EMAIL|FAX)/i,
  /^-+$/,
  /^_+$/,
  /^=+$/,
];

function isHardJunk(text) {
  const upper = text.toUpperCase();
  return HARD_JUNK_PATTERNS.some(p => p.test(upper));
}

/* =====================================================
   INVALID PRODUCT NAME PATTERNS (CRITICAL SAFETY)
===================================================== */

const INVALID_PRODUCT_PATTERNS = [
  /^TAB\s*\d+$/i,        // "TAB 10", "TAB 20"
  /^CAP\s*\d+$/i,        // "CAP 10", "CAP 20"
  /^SYP\s*\d+$/i,        // "SYP 100"
  /^\d+\s*TAB$/i,        // "10 TAB", "20 TAB"
  /^\d+\s*CAP$/i,        // "10 CAP"
  /^[A-Z]{1,2}\s*\d+$/,  // "M 500", "A 25" (too generic)
  /^\d+$/,               // Just numbers
];

/**
 * CRITICAL: Check if text is an invalid/generic product name
 */
function isInvalidProductName(text) {
  if (!text) return true;
  
  const cleaned = text.trim().toUpperCase();
  
  // Check against invalid patterns
  for (const pattern of INVALID_PRODUCT_PATTERNS) {
    if (pattern.test(cleaned)) {
      return true;
    }
  }
  
  return false;
}

/* =====================================================
   PRODUCT DETECTION - Multiple Strategies
===================================================== */

// Strategy 1: Medicine indicators
const MEDICINE_PATTERNS = [
  /\b\d+\s*(MG|ML|MCG|IU|GM|KG|G)\b/i,
  /\b(TAB|TABLET|CAP|CAPSULE|SYP|SYRUP|INJ|INJECTION)\b/i,
  /\b(DROPS?|CREAM|OINTMENT|GEL|LOTION|POWDER)\b/i,
  /\d+['`"]S\b/i,
];

// Strategy 2: Common pharma brand patterns
const BRAND_PATTERNS = [
  /\b(DOLO|EBAST|MICR|PULMUCUS|SILYBON|CETRIZ|CLAV|AMOX|AZITH)/i,
  /\b\w+\s*-\s*(DC|DS|TH|LBX|NS|XL|SR|MR)\b/i,
];

// Strategy 3: Product name structure (name + number/variant)
const STRUCTURE_PATTERNS = [
  /^[A-Z][A-Z\s\-]{2,}\s+\d+/i,  // "DOLO 650"
  /^[A-Z][A-Z\s\-]{2,}\s*-\s*[A-Z]{2}/i,  // "EBAST-DC"
];

// Blacklist: Things that are definitely NOT products
const NOT_PRODUCT_PATTERNS = [
  /^(TOTAL|SUBTOTAL|GRAND\s*TOTAL|NET\s*AMOUNT)/i,
  /^(CGST|SGST|IGST|GST|TAX)/i,
  /^(DISCOUNT|LESS|ADD|BALANCE)/i,
  /^(THANK\s*YOU|REGARDS|SIGNATURE)/i,
  /^(CONTINUED|CARRIED\s*FORWARD)/i,
  /^\d+\s*$/, // Only numbers
];

/**
 * Determine if text looks like a product name
 * ULTRA PERMISSIVE: accept almost anything that looks like it could be a product
 * BUT: Reject known invalid patterns
 */
function looksLikeProduct(text) {
  if (!text || text.length < MIN_PRODUCT_LENGTH) return false;
  
  // CRITICAL: Reject invalid/generic names first
  if (isInvalidProductName(text)) return false;
  
  // Must have at least 3 letters (not just numbers)
  const letters = (text.match(/[A-Z]/gi) || []).length;
  if (letters < 3) return false;
  
  // Reject if matches blacklist
  if (NOT_PRODUCT_PATTERNS.some(p => p.test(text))) return false;
  
  // Accept if matches any positive indicator (medicine, brand, structure)
  const hasMedicine = MEDICINE_PATTERNS.some(p => p.test(text));
  const hasBrand = BRAND_PATTERNS.some(p => p.test(text));
  const hasStructure = STRUCTURE_PATTERNS.some(p => p.test(text));
  
  if (hasMedicine || hasBrand || hasStructure) return true;
  
  // ULTRA PERMISSIVE FALLBACK: Accept if it has reasonable letter content
  // This catches products that don't match specific patterns
  const totalChars = text.replace(/\s/g, '').length;
  
  // Accept if:
  // - At least 8 characters total (increased from 5)
  // - At least 40% letters (to allow for numbers in product names)
  if (totalChars >= 8 && letters >= totalChars * 0.4) {
    return true;
  }
  
  return false;
}

/* =====================================================
   QUANTITY EXTRACTION - PRODUCTION GRADE
===================================================== */

/**
 * PRODUCTION-GRADE: Extract ONLY the order quantity from invoice line
 * CRITICAL: Ignore ALL decimal numbers (prices, amounts, totals)
 * Focus ONLY on finding the actual order quantity integer
 */
function extractQuantity(text) {
  if (!text) return null;

  const upper = text.toUpperCase();

  // Strategy 1: Explicit QTY label (highest confidence)
  const qtyPrefixMatch = upper.match(/\b(?:QTY|QUANTITY|ORD\s*QTY)[:\s]+(\d+)/i);
  if (qtyPrefixMatch) {
    const qty = Number(qtyPrefixMatch[1]);
    if (qty >= MIN_QTY && qty <= MAX_QTY) return qty;
  }

  // Strategy 2: Smart integer detection
  // Remove ALL codes and clean the text
  let cleaned = text
    .replace(/\b\d{6,}\b/g, " ")  // Remove 6+ digit codes
    .replace(/\d+\.\d+/g, " ")     // Remove ALL decimal numbers (prices/amounts)
    .replace(/\+\s*\d*\s*(FREE|F)\s*$/i, ''); // Remove free qty indicators
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(/\s+/);

  // Find ALL valid integers (potential order quantities)
  const candidates = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1] || "";
    const next = tokens[i + 1] || "";
    
    // Must be a pure integer
    if (!/^\d+$/.test(token)) continue;
    
    const val = Number(token);
    
    // FILTER 1: Skip if it's a dosage (500MG, 10ML)
    if (/^(MG|ML|MCG|GM|G|IU|KG)$/i.test(next)) continue;
    
    // FILTER 2: Skip if it's part of a pack size (30'S, 15S)
    if (isPackToken(token)) continue;
    if (isPackToken(token + next)) continue;
    if (/^['\`]S$/i.test(next)) continue;
    
    // FILTER 3: Skip serial numbers (position 0, value < 10)
    if (i === 0 && val < 10) continue;
    
    // FILTER 4: Skip very large numbers (likely item codes without decimal)
    if (val > 10000) continue;
    
    // FILTER 5: Skip if it's clearly part of product name
    // (appears very early AND preceded by letters)
    if (i <= 2 && /^[A-Z]+$/i.test(prev)) {
      // This might be dosage in product name (DAJIO M 500)
      // Only skip if it's a common dosage value
      if (val === 500 || val === 250 || val === 1000 || val === 125) {
        continue;
      }
    }
    
    // FILTER 6: Must be in valid range
    if (val < MIN_QTY || val > MAX_QTY) continue;
    
    // This is a valid order quantity candidate!
    candidates.push({
      value: val,
      pos: i,
      // Prefer numbers in middle-to-end positions
      score: i > 2 ? 2 : 1
    });
  }

  // Strategy 3: Select best candidate
  if (candidates.length === 0) return null;
  
  if (candidates.length === 1) {
    return candidates[0].value;
  }
  
  // Multiple candidates - use heuristics
  // Prefer candidates with higher scores (better positions)
  candidates.sort((a, b) => {
    // First by score
    if (b.score !== a.score) return b.score - a.score;
    // Then by position (later is better for order qty)
    return b.pos - a.pos;
  });
  
  return candidates[0].value;
}


/* =====================================================
   PRODUCT NAME EXTRACTION - PRODUCTION GRADE
===================================================== */

/**
 * Extract product name preserving strength, dosage, and variants
 * Handles: "DOLO 650MG", "AMOXYCLAV 500/125", "EBAST-DC", "PARACETAMOL 30'S"
 */
function extractProductName(text) {
  if (!text) return "";

  let cleaned = text.toUpperCase();

  // Remove prices (decimal numbers)
  cleaned = cleaned.replace(/\b\d+\.\d+\b/g, " ");

  // Remove HSN codes (8 digits) and item codes (6+ digits) but NOT dosages
  cleaned = cleaned.replace(/\b\d{6,}\b/g, " ");

  // Remove leading serial numbers ONLY (1-3 digits at start)
  cleaned = cleaned.replace(/^\s*\d{1,3}\s+/, "");

  // Preserve important symbols temporarily
  cleaned = cleaned.replace(/\//g, "§SLASH§");  // For combo dosage: 500/125
  cleaned = cleaned.replace(/-/g, "§DASH§");    // For variants: EBAST-DC
  cleaned = cleaned.replace(/\+/g, "§PLUS§");   // For variants: DOLO+

  // Remove other symbols
  cleaned = cleaned.replace(/[^A-Z0-9§\s]/g, " ");
  
  // Restore preserved symbols
  cleaned = cleaned.replace(/§SLASH§/g, "/");
  cleaned = cleaned.replace(/§DASH§/g, "-");
  cleaned = cleaned.replace(/§PLUS§/g, "+");
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const tokens = cleaned.split(" ");
  const result = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1] || "";
    const next = tokens[i + 1] || "";

    // Keep if it's alphabetic
    if (/^[A-Z]+$/.test(t)) {
      result.push(t);
      continue;
    }

    // Keep if it's a dosage pattern (number + unit)
    if (/^\d+(?:MG|ML|MCG|GM|G|IU)$/i.test(t)) {
      result.push(t);
      continue;
    }

    // Keep if it's a combo dosage (500/125)
    if (/^\d+\/\d+$/.test(t)) {
      result.push(t);
      continue;
    }

    // Keep if it's a pack size (30'S, 10S)
    if (isPackToken(t)) {
      result.push(t);
      continue;
    }

    // Keep if it's a variant with dash/plus (EBAST-DC, DOLO+)
    if (/[A-Z]+-[A-Z]+/.test(t) || /[A-Z]+\+[A-Z]*/.test(t)) {
      result.push(t);
      continue;
    }

    // Keep standalone numbers if they're part of product name (DOLO 650)
    // But only if previous token was alphabetic and next isn't a price indicator
    if (/^\d+$/.test(t)) {
      const isPartOfName = /^[A-Z]+$/.test(prev) && 
                          !/^\d+$/.test(next) && 
                          result.length > 0;
      
      if (isPartOfName) {
        result.push(t);
        continue;
      }
      
      // This is likely start of quantity column - stop here
      break;
    }

    // If we reach here, it's an unknown pattern - stop to be safe
    if (result.length > 0) break;
  }

  return result.join(" ").trim();
}





/* =====================================================
   PDF PARSING - Aggressive Mode
===================================================== */

async function parsePDF(file) {
  const { rows } = await extractTextFromPDFAdvanced(file.buffer);
  
  debug(`\n📄 PDF: ${rows.length} rows extracted`);
  
  const textLines = rows.map(r => r.rawText || "");
  const customerName = detectCustomerFromInvoice(textLines);
  
  const dataRows = [];
  const failed = [];
  
  // Don't be too strict about sections - scan everything
  for (let i = 0; i < rows.length; i++) {
    const text = rows[i].rawText?.trim();
    
    if (!text || text.length < MIN_PRODUCT_LENGTH) continue;
    
    // Skip only hard junk
    if (isHardJunk(text)) {
      debug(`  ⊘ Row ${i + 1}: Hard junk - "${text}"`);
      continue;
    }
    
    // Skip obvious totals
    if (/^(TOTAL|GRAND\s*TOTAL|SUB-TOTAL|APPROXIMATE\s*VALUE)[\s:]/i.test(text)) {
      debug(`  ⊘ Row ${i + 1}: Total line - "${text}"`);
      continue;
    }
    
    // Try to extract qty first
// 1️⃣ Extract quantity FIRST
const qty = extractQuantity(text);

if (!qty) {
  if (looksLikeProduct(text)) {
    failed.push({ row: i + 1, text, reason: 'Looks like product but no qty' });
  }
  continue;
}

// 2️⃣ Extract product name NEXT
const itemDesc = extractProductName(text);

if (!itemDesc || itemDesc.length < MIN_PRODUCT_LENGTH) {
  failed.push({ row: i + 1, text, qty, reason: 'No valid product name' });
  continue;
}

// 3️⃣ Validate USING CLEANED NAME (NOT raw text)
if (!looksLikeProduct(itemDesc)) {
  failed.push({ row: i + 1, text, qty, reason: 'Not product-like' });
  continue;
}

// 4️⃣ SUCCESS
debug(`  ✅ Row ${i + 1}: "${itemDesc}" | Qty: ${qty}`);

dataRows.push({
  ITEMDESC: itemDesc,
  ORDERQTY: qty,
  _rawText: text,
  _sourceRow: i + 1
});

  }
  
  console.log(`\n📄 PDF SUMMARY:`);
  console.log(`   Total rows: ${rows.length}`);
  console.log(`   ✅ Extracted: ${dataRows.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  
  // Show samples
  if (dataRows.length > 0) {
    console.log(`\n   Sample extractions:`);
    dataRows.slice(0, 3).forEach(r => {
      console.log(`   • "${r.ITEMDESC}" → Qty: ${r.ORDERQTY}`);
    });
  }
  
  if (dataRows.length === 0 && failed.length > 0) {
    console.log(`\n   ⚠️  All rows failed. First 5 failures:`);
    failed.slice(0, 5).forEach(f => {
      console.log(`   ${f.row}. [${f.reason}] "${f.text}"`);
    });
  }
  
  return {
    dataRows,
    meta: { 
      customerName: customerName || "UNKNOWN",
      totalRows: rows.length,
      extracted: dataRows.length,
      failed: failed.length
    }
  };
}

/* =====================================================
   EXCEL COLUMN DETECTION
===================================================== */

function detectExcelColumns(rows) {
  console.log("🔍 Detecting Excel column structure...");
  
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    
    let itemNameCol = -1;
    let qtyCol = -1;
    
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || "").toUpperCase().trim();
      
      if (/ITEM\s*NAME|PRODUCT\s*NAME|DESCRIPTION/i.test(cell)) {
        itemNameCol = j;
      }
      
      if (/^QTY$|^QUANTITY$|^ORD\s*QTY$/i.test(cell)) {
        qtyCol = j;
      }
    }
    
    if (itemNameCol >= 0 && qtyCol >= 0) {
      console.log(`✅ Found columns: Item Name (col ${itemNameCol}), Qty (col ${qtyCol})`);
      return {
        headerRow: i,
        itemNameCol,
        qtyCol,
        dataStartRow: i + 1
      };
    }
  }
  
  console.log("⚠️ Could not detect columns");
  return null;
}

function extractFromExcelColumns(rows, columnMap) {
  const { dataStartRow, itemNameCol, qtyCol } = columnMap;
  const products = [];
  
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    
    const itemName = String(row[itemNameCol] || "").trim();
    const qty = parseInt(row[qtyCol]);
    
    if (!itemName || !qty || qty <= 0) continue;
    if (/^item|^product/i.test(itemName)) continue;
    if (itemName.length < MIN_PRODUCT_LENGTH) continue;
    
    console.log(`  ✅ Row ${i + 1}: "${itemName}" | Qty: ${qty}`);
    
    products.push({
      ITEMDESC: itemName,
      ORDERQTY: qty,
      _rawText: itemName,
      _sourceRow: i + 1
    });
  }
  
  return products;
}

/* =====================================================
   EXCEL PARSING
===================================================== */

function parseExcel(file) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1, raw: false });

  console.log(`📊 Excel: ${rows.length} raw rows`);

  // Try column-based extraction
  const columnMap = detectExcelColumns(rows);
  
  if (columnMap) {
    console.log("✅ Using COLUMN-BASED extraction");
    const products = extractFromExcelColumns(rows, columnMap);
    
    const customerName = detectCustomerFromInvoice(
      rows.slice(0, 20).map(r => Array.isArray(r) ? r.join(" ") : String(r))
    );
    
    return {
      dataRows: products,
      meta: {
        customerName: customerName || "UNKNOWN",
        totalRows: rows.length,
        extracted: products.length,
        failed: 0,
        structure: "COLUMN_BASED"
      }
    };
  }
  
  // Fallback to text-based
  console.log("⚠️ Using TEXT-BASED extraction");
  const textLines = rows.map(r =>
    Array.isArray(r) ? r.join(" ").replace(/\s+/g, " ").trim() : String(r)
  );

  const customerName = detectCustomerFromInvoice(textLines);
  const structure = detectExcelStructure(rows);

  console.log(`📊 Excel structure detected: ${structure}`);

  const dataRows = [];
  const failed = [];

  let workingLines = [];

  if (structure === "PDF_LIKE") {
    console.log("📊 Applying PDF-style row merging for Excel");
    workingLines = mergeLooseRows(textLines);
  } else {
    console.log("📊 Using table-style Excel parsing");
    workingLines = textLines;
  }

  for (let i = 0; i < workingLines.length; i++) {
    const text = workingLines[i];
    if (!text || text.length < MIN_PRODUCT_LENGTH) continue;
    if (isHardJunk(text)) continue;

    const qty = extractQuantity(text);
    if (!qty) {
      if (looksLikeProduct(text)) {
        failed.push({ row: i + 1, text, reason: "No qty" });
      }
      continue;
    }

     const itemDesc = extractProductName(text);

    if (!itemDesc || itemDesc.length < MIN_PRODUCT_LENGTH) {
      failed.push({ row: i + 1, text, qty, reason: "No name" });
      continue;
    }



// validate USING CLEANED NAME
if (!looksLikeProduct(itemDesc)) {
  failed.push({ row: i + 1, text, qty, reason: "Not product-like" });
  continue;
}


    console.log(`✅ Excel Product: "${itemDesc}" | Qty: ${qty}`);

    dataRows.push({
      ITEMDESC: itemDesc,
      ORDERQTY: qty,
      _rawText: text,
      _sourceRow: i + 1
    });
  }

  console.log(`📊 Excel Result: ${dataRows.length} products, ${failed.length} failed`);

  return {
    dataRows,
    meta: {
      customerName: customerName || "UNKNOWN",
      totalRows: rows.length,
      extracted: dataRows.length,
      failed: failed.length,
      structure
    }
  };
}

/* =====================================================
   TEXT PARSING
===================================================== */

function parseText(file) {
  const text = file.buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  
  debug(`\n📝 Text: ${lines.length} lines`);
  
  const customerName = detectCustomerFromInvoice(lines);
  const dataRows = [];
  const failed = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ").trim();
    
    if (!line || line.length < MIN_PRODUCT_LENGTH) continue;
    if (isHardJunk(line)) continue;
    if (/^(TOTAL|APPROXIMATE\s*VALUE)[\s:]/i.test(line)) continue;
    
    const qty = extractQuantity(line);
    if (!qty) {
      // Only check if looks like product after we have the description
      const tempDesc = extractProductName(line);
      if (tempDesc && looksLikeProduct(tempDesc)) {
        failed.push({ row: i + 1, text: line, reason: 'No qty' });
      }
      continue;
    }
    
    const itemDesc = extractProductName(line);
    if (!itemDesc || itemDesc.length < MIN_PRODUCT_LENGTH) {
      failed.push({ row: i + 1, text: line, qty, reason: 'No name' });
      continue;
    }
    
    if (!looksLikeProduct(itemDesc)) {
      failed.push({ row: i + 1, text: line, qty, reason: 'Not product-like' });
      continue;
    }
    
    debug(`  ✅ Row ${i + 1}: "${itemDesc}" | Qty: ${qty}`);
    
    dataRows.push({
      ITEMDESC: itemDesc,
      ORDERQTY: qty,
      _rawText: line,
      _sourceRow: i + 1
    });
  }
  
  console.log(`\n📝 TEXT SUMMARY: ${dataRows.length} extracted, ${failed.length} failed`);
  
  return {
    dataRows,
    meta: { 
      customerName: customerName || "UNKNOWN",
      totalRows: lines.length,
      extracted: dataRows.length,
      failed: failed.length
    }
  };
}

/* =====================================================
   MAIN EXPORT
===================================================== */

export async function unifiedExtract(file) {
  const name = file.originalname.toLowerCase();
  
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🚀 EXTRACTION: ${file.originalname}`);
  console.log(`${"=".repeat(70)}`);
  
  try {
    let result;
    
    if (name.endsWith(".pdf")) {
      result = await parsePDF(file);
    } else if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
      result = parseExcel(file);
    } else if (name.endsWith(".txt")) {
      result = parseText(file);
    } else {
      throw new Error(`Unsupported file format: ${name}`);
    }
    
    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ EXTRACTION COMPLETE`);
    console.log(`   Extracted: ${result.dataRows.length} products`);
    console.log(`   Customer: ${result.meta.customerName}`);
    console.log(`${"=".repeat(70)}\n`);
    
    return result;
    
  } catch (error) {
    console.error("❌ Extraction error:", error);
    throw error;
  }
}

export default { unifiedExtract };