import XLSX from "xlsx";
import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { detectCustomerFromInvoice } from "./customerDetector.js";

/* =====================================================
   ENHANCED DESCRIPTION EXTRACTION
   Preserves: Dosage, Strength, Formulation, Pack Size
===================================================== */

function extractDescriptionSmart(text) {
  if (!text) return "";
  
  // Remove ONLY order-related noise, preserve medical info
  const cleaned = text
    .replace(/\b(?:QTY|QUANTITY|ORDER\s*QTY)[:\s]*\d+/gi, '')  // Remove qty labels
    .replace(/\b(?:FREE|BONUS|SCHEME|SCH)\b/gi, '')             // Remove promotional text
    .replace(/\bMICR\b/gi, '')                                   // Remove distributor name
    .replace(/^\d+\s+/, '')                                      // Remove leading numbers (S.No)
    .trim();
  
  // Normalize spaces but keep structure
  const normalized = cleaned
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

/**
 * Extract quantity with validation
 */
function extractQtyLoose(text) {
  if (!text) return null;
  
  const upper = text.toUpperCase();
  
  // Skip header/junk lines
  if (/GST|DL NO|ADDRESS|PIN|ROAD|FLOOR|PURCHASE ORDER|INVOICE|SUBTOTAL|TOTAL|AMOUNT/i.test(upper)) {
    return null;
  }
  
  // Try keyword-based extraction first
  const keywordMatch = upper.match(/(?:QTY|QUANTITY|ORDER\s*QTY)[:\s]*(\d+)/i);
  if (keywordMatch) {
    return Number(keywordMatch[1]);
  }
  
  // Fallback: find last reasonable number
  const tokens = text.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].replace(/[^\d]/g, '');
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n > 0 && n < 100000) return n;
    }
  }
  
  return null;
}






/* =====================================================
   MAIN EXTRACTION FUNCTIONS
===================================================== */

export async function unifiedExtract(file) {
  const name = file.originalname.toLowerCase();
  
  if (name.endsWith(".pdf")) return parsePDF(file);
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv"))
    return parseExcel(file);
  if (name.endsWith(".txt")) return parseText(file);
  
  throw new Error("Unsupported file format");
}

/* =====================================================
   PDF PARSER
===================================================== */

async function parsePDF(file) {
const { rows } = await extractTextFromPDFAdvanced(file.buffer);
  
  // 1. Detect customer from raw rows
const customerName = detectCustomerFromInvoice(rows);
  const dataRows = [];
  
  for (const row of rows) {
    const text = row.rawText.trim();
    if (!text || text.length < 5) continue;
    
    const qty = extractQtyLoose(text);
    if (!qty) continue;
    
    const desc = extractDescriptionSmart(text);
    if (!desc || desc.length < 3) continue;
    
    dataRows.push({
      ITEMDESC: desc,
      ORDERQTY: qty,
      _rawText: text  // Keep original for debugging
    });
  }
  
  console.log(`📄 PDF Extracted: ${dataRows.length} items, Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

/* =====================================================
   EXCEL PARSER
===================================================== */

function parseExcel(file) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  
  // 1. Detect customer
  const customerName = detectCustomerGeneric(rows);
  
  // 2. Extract product rows
  const dataRows = [];
  let tableStarted = false;
  
  for (const row of rows) {
    const text = Object.values(row).join(" ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) continue;
    
    const qty = extractQtyLoose(text);
    const desc = extractDescriptionSmart(text);
    
    // Detect table start
    if (!tableStarted && qty && desc) {
      tableStarted = true;
    }
    
    if (!tableStarted) continue;
    
    if (qty && desc && desc.length >= 3) {
      dataRows.push({
        ITEMDESC: desc,
        ORDERQTY: qty,
        _rawText: text
      });
    }
  }
  
  console.log(`📊 Excel Extracted: ${dataRows.length} items, Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

/* =====================================================
   TEXT PARSER
===================================================== */

function parseText(file) {
  const lines = file.buffer.toString("utf8").split(/\r?\n/);
  
  // 1. Detect customer
  const customerName = detectCustomerGeneric(lines);
  
  // 2. Extract product rows
  const dataRows = [];
  
  for (const line of lines) {
    const text = line.replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) continue;
    
    const qty = extractQtyLoose(text);
    const desc = extractDescriptionSmart(text);
    
    if (qty && desc && desc.length >= 3) {
      dataRows.push({
        ITEMDESC: desc,
        ORDERQTY: qty,
        _rawText: text
      });
    }
  }
  
  console.log(`📝 Text Extracted: ${dataRows.length} items, Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

export default { unifiedExtract };