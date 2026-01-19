/**
 * UNIFIED PARSER - FIXED VERSION
 * Fixes: Quantity extraction, customer detection, line parsing
 */
import XLSX from "xlsx-js-style";

import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { detectCustomerFromInvoice } from "./customerDetector.js";

/* =====================================================
   ENHANCED QUANTITY EXTRACTION
   ===================================================== */
function extractQtyFromLine(text) {
  if (!text) return null;
  
  const upper = text.toUpperCase();
  
  // Skip header/junk lines
  if (/GST|DL NO|ADDRESS|PIN|ROAD|FLOOR|PURCHASE ORDER|INVOICE|SUBTOTAL|TOTAL|AMOUNT|PAGE|PRINTED BY|SUPPLIER/i.test(upper)) {
    return null;
  }
  
  // ✅ CRITICAL FIX: Extract quantity BEFORE price/amount
  // Typical format: "PRODUCT NAME PACK QTY PRICE"
  // Example: "ARBITEL TRIO 50MG 15'S 10 1677.20"
  //          → QTY = 10 (before the price 1677.20)
  
  // Remove leading serial numbers
  let cleaned = text.replace(/^\d+\s+/, '').trim();
  
  // Split into tokens
  const tokens = cleaned.split(/\s+/);
  
  // ✅ STRATEGY: Find the last 2 numbers - typically [QTY, PRICE]
  const numbers = [];
  for (let i = tokens.length - 1; i >= 0 && numbers.length < 3; i--) {
    const token = tokens[i].replace(/[^\d]/g, '');
    if (/^\d+$/.test(token)) {
      numbers.unshift({
        value: Number(token),
        position: i
      });
    }
  }
  
  if (numbers.length >= 2) {
    // Last number is usually price (has decimals or is large)
    // Second-to-last is usually quantity
    const lastNum = numbers[numbers.length - 1].value;
    const secondLastNum = numbers[numbers.length - 2].value;
    
    // If last number looks like price (>1000 or has cents pattern)
    if (lastNum > 1000 || text.includes('.')) {
      // Use second-to-last as quantity
      if (secondLastNum > 0 && secondLastNum < 10000) {
        return secondLastNum;
      }
    }
    
    // Otherwise, last number might be quantity
    if (lastNum > 0 && lastNum < 10000) {
      return lastNum;
    }
  }
  
  // ✅ FALLBACK: Look for "QTY" keyword pattern
  const qtyMatch = upper.match(/\bQTY[:\s]*(\d+)/i);
  if (qtyMatch) {
    return Number(qtyMatch[1]);
  }
  
  // ✅ FALLBACK: Look for number after packing info
  // Pattern: "15'S 10 1677.20" → 10 is qty
  const packQtyMatch = text.match(/['`"]S\s+(\d+)\s+\d+\.\d+/i);
  if (packQtyMatch) {
    return Number(packQtyMatch[1]);
  }
  
  return null;
}

/* =====================================================
   ENHANCED DESCRIPTION EXTRACTION
   ===================================================== */
function extractDescriptionSmart(text) {
  if (!text) return "";
  
  // Remove serial number at start
  let cleaned = text.replace(/^\d+\s+/, '');
  
  // Remove quantity and price at end
  // Pattern: remove last 1-3 numbers (qty + price)
  cleaned = cleaned.replace(/\s+\d+\.\d+\s*$/, '');
  
  // Remove promotional text
  cleaned = cleaned
    .replace(/\b(?:FREE|BONUS|SCHEME|SCH)\b/gi, '')
    .replace(/\bMICR\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
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
  
  // ✅ 1. Detect customer from raw rows (NOT filename)
  const customerName = detectCustomerFromInvoice(rows);
  const dataRows = [];
  
  console.log('📄 PDF Processing started...');
  
  for (const row of rows) {
    const text = row.rawText?.trim() || row.text?.trim() || '';
    if (!text || text.length < 5) continue;
    
    // Skip obvious header/footer lines
    if (/GSTIN|PHONE|APPROX VALUE|PRINTED BY|PAGE \d+|SOFTWARE @/i.test(text)) {
      continue;
    }
    
    const qty = extractQtyFromLine(text);
    if (qty === null) continue;

    
    const desc = extractDescriptionSmart(text);
    if (!desc || desc.length < 3) continue;
    
    console.log(`✓ Parsed: "${desc}" | Qty: ${qty}`);
    
    dataRows.push({
      ITEMDESC: desc,
      ORDERQTY: qty,
      _rawText: text
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
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
  
  // ✅ 1. Detect customer from content (NOT filename)
  const textRows = rows.map(r => Array.isArray(r) ? r.join(' ') : String(r));
  const customerName = detectCustomerFromInvoice(textRows);
  
  // ✅ 2. Extract product rows
  const dataRows = [];
  
  console.log('📊 Excel Processing started...');
  
  for (const row of rows) {
    const text = Array.isArray(row) ? row.join(' ') : String(row);
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    if (!cleaned || cleaned.length < 5) continue;
    
    // Skip headers
    if (/GSTIN|PHONE|APPROX VALUE|CODE|PRODUCT NAME/i.test(cleaned)) {
      continue;
    }
    
    const qty = extractQtyFromLine(cleaned);
    const desc = extractDescriptionSmart(cleaned);
    
    if (qty && desc && desc.length >= 3) {
      console.log(`✓ Parsed: "${desc}" | Qty: ${qty}`);
      
      dataRows.push({
        ITEMDESC: desc,
        ORDERQTY: qty,
        _rawText: cleaned
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
  
  // ✅ 1. Detect customer from content
  const customerName = detectCustomerFromInvoice(lines);
  
  // ✅ 2. Extract product rows
  const dataRows = [];
  
  console.log('📝 Text Processing started...');
  
  for (const line of lines) {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 5) continue;
    
    // Skip headers
    if (/GSTIN|PHONE|APPROX VALUE|CODE|PRODUCT NAME/i.test(text)) {
      continue;
    }
    
    const qty = extractQtyFromLine(text);
    const desc = extractDescriptionSmart(text);
    
    if (qty && desc && desc.length >= 3) {
      console.log(`✓ Parsed: "${desc}" | Qty: ${qty}`);
      
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