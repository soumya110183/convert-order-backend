import XLSX from "xlsx-js-style";

import { extractTextFromPDFAdvanced } from "./pdfParser.js";

/* =====================================================
   CRITICAL FIX: Separate Product Name from Quantity
===================================================== */

/**
 * Parse individual product line - FIXED VERSION
 * Correctly separates: Product | Pack | Quantity
 */
function parseProductLine(line) {
  if (!line || line.length < 10) return null;
  
  // Remove leading/trailing whitespace
  const cleaned = line.trim();
  
  // CRITICAL: Extract quantity FIRST (from the end)
  // Patterns: "50 +10FREE", "600", "7000 +", "30"
  const qtyPattern = /(\d+)\s*(?:\+(\d*)FREE)?$/i;
  const qtyMatch = cleaned.match(qtyPattern);
  
  if (!qtyMatch) return null;
  
  const orderQty = parseInt(qtyMatch[1], 10);
  const freeQty = qtyMatch[2] ? parseInt(qtyMatch[2], 10) : 0;
  
  // Remove quantity from end to get product + pack
  const withoutQty = cleaned.replace(qtyPattern, '').trim();
  
  // Extract pack info (10's *5, 15's *30, etc.)
  const packPattern = /(\d+'?s?\s*(?:\*\s*\d+)?)\s*$/i;
  const packMatch = withoutQty.match(packPattern);
  
  let packInfo = "";
  let productName = withoutQty;
  
  if (packMatch) {
    packInfo = packMatch[1].trim();
    productName = withoutQty.replace(packPattern, '').trim();
  }
  
  // Clean product name (remove ** markers, extra spaces)
  productName = productName
    .replace(/\*\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Validate
  if (!productName || productName.length < 3 || orderQty <= 0) {
    return null;
  }
  
  return {
    ITEMDESC: productName,  // Just the product name, no pack or qty
    ORDERQTY: orderQty,
    FREE_QTY: freeQty,
    PACK_INFO: packInfo,
    _rawLine: line
  };
}

/**
 * Parse tabular invoice format
 */
function parseTabularFormat(text) {
  if (!text) return [];
  
  const lines = text.split(/\r?\n/);
  const products = [];
  
  let inDataSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Detect table header
    if (/Code\s+Product\s+Pack\s+Order/i.test(line)) {
      inDataSection = true;
      continue;
    }
    
    // Detect table end
    if (/TOTAL\s+VALUE|Despatch\s+Date|Authorised/i.test(line)) {
      break;
    }
    
    // Skip separator lines
    if (/^-+$/.test(line)) continue;
    
    // Only process data section
    if (!inDataSection) continue;
    
    // Parse product line
    const parsed = parseProductLine(line);
    if (parsed) {
      products.push(parsed);
      console.log(`✓ Parsed: "${parsed.ITEMDESC}" | Qty: ${parsed.ORDERQTY}${parsed.FREE_QTY ? ` +${parsed.FREE_QTY}` : ''}`);
    }
  }
  
  return products;
}

/**
 * Enhanced customer detection
 */
function detectCustomerGeneric(lines) {
  if (!lines || lines.length === 0) return null;
  
  const businessKeywords = [
    "ENTERPRISES", "ENTERPRISE",
    "PVT. LTD", "PRIVATE LIMITED", "PVT LTD",
    "AGENCIES", "AGENCY",
    "DISTRIBUTORS", "DISTRIBUTOR",
    "DRUG HOUSE", "PHARMA", "MEDICALS"
  ];
  
  const strongSignals = [
    /GSTIN/i,
    /FSSAI/i,
    /D\.?\s*L\.?\s*NO/i,
    /DRUG\s*LIC/i
  ];
  
  const blockedPatterns = [
    /MICRO LABS/i,
    /RAJ DISTRIBUTORS/i, // This is the seller, not buyer
    /PAGE \d+ OF \d+/i,
    /^CODE\s+PRODUCT/i,
    /Order Form/i
  ];
  
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].trim().toUpperCase();
    if (!line || line.length < 5) continue;
    
    // Skip blocked
    if (blockedPatterns.some(r => r.test(line))) continue;
    
    const hasKeyword = businessKeywords.some(k => line.includes(k));
    const hasSignal = strongSignals.some(r => r.test(line));
    
    if (hasKeyword || hasSignal) {
      // Extract customer name (just the business entity)
      const words = line.split(/\s+/);
      const keywordIndex = words.findIndex(w => 
        businessKeywords.some(k => w.includes(k))
      );
      
      if (keywordIndex >= 0) {
        // Take words up to and including the keyword
        const customerName = words.slice(0, keywordIndex + 1).join(' ');
        if (customerName.length > 3) {
          return customerName;
        }
      }
      
      // Fallback: first meaningful part
      const firstPart = line.split(/\s{2,}|,/)[0];
      if (firstPart && firstPart.length > 3) {
        return firstPart;
      }
    }
  }
  
  return null;
}

/**
 * Fallback: Line-by-line extraction
 */
function extractLineByLine(lines) {
  const products = [];
  
  for (const line of lines) {
    const parsed = parseProductLine(line);
    if (parsed) {
      products.push(parsed);
    }
  }
  
  return products;
}

/* =====================================================
   MAIN PARSERS
===================================================== */

async function parsePDF(file) {
  const { rows, lines } = await extractTextFromPDFAdvanced(file.buffer);
  
  const customerName = detectCustomerGeneric(lines);
  const fullText = lines.join('\n');
  let dataRows = parseTabularFormat(fullText);
  
  if (dataRows.length === 0) {
    dataRows = extractLineByLine(lines);
  }
  
  console.log(`📄 PDF: ${dataRows.length} items | Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

function parseText(file) {
  const text = file.buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  
  const customerName = detectCustomerGeneric(lines);
  let dataRows = parseTabularFormat(text);
  
  if (dataRows.length === 0) {
    dataRows = extractLineByLine(lines);
  }
  
  console.log(`📝 TXT: ${dataRows.length} items | Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

function parseExcel(file) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
  
  const customerName = detectCustomerGeneric(rows.map(r => r.join(' ')));
  const text = rows.map(r => r.join('    ')).join('\n');
  let dataRows = parseTabularFormat(text);
  
  if (dataRows.length === 0) {
    dataRows = extractLineByLine(rows.map(r => r.join(' ')));
  }
  
  console.log(`📊 EXCEL: ${dataRows.length} items | Customer: ${customerName || 'UNKNOWN'}`);
  
  return {
    dataRows,
    meta: { customerName: customerName || "UNKNOWN" }
  };
}

/* =====================================================
   MAIN EXPORT
===================================================== */

export async function unifiedExtract(file) {
  const name = file.originalname.toLowerCase();
  
  if (name.endsWith(".pdf")) return parsePDF(file);
  if (name.endsWith(".txt")) return parseText(file);
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv"))
    return parseExcel(file);
  
  throw new Error("Unsupported file format");
}

export default { unifiedExtract };

/* =====================================================
   TEST FUNCTION
===================================================== */

export function testInvoice() {
  const sampleInvoice = `
         DOLO 1000                                10's *5             50 +10FREE    
         DOLO 500  **                             15's *30           600            
         DOLO 650  **                             15's *30          7000 +FREE      
         DOLO-TH 4                                10's *3             50 +10FREE    
         EBAST-10                                 15's *15           200 +40FREE    
         EBAST-DC                                 10's *30           200 +40FREE    
         MICRODOX- LBX                            10's *5            200 +40FREE    
         MICRONASE-NS  Spray                      1's                 30            
         PULMUCUS-600                             10''s               50 +10FREE    
         SILYBON-70                               10's *30           200 +40FREE    
  `;
  
  const products = parseTabularFormat(sampleInvoice);
  
  console.log('\n=== EXTRACTED PRODUCTS ===\n');
  products.forEach((p, i) => {
    console.log(`${i + 1}. Product: "${p.ITEMDESC}"`);
    console.log(`   Qty: ${p.ORDERQTY}${p.FREE_QTY ? ` +${p.FREE_QTY} FREE` : ''}`);
    console.log(`   Pack: ${p.PACK_INFO || 'N/A'}`);
    console.log('');
  });
  
  return products;
}

// testInvoice();