import XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * INVOICE PARSER SERVICE
 * Extracts ONLY item identifiers and ORDERQTY from invoices
 * Does NOT create/modify master data
 */

// Extract quantity from text
function extractQty(text) {
  const cleaned = String(text).replace(/free|bonus|sch/gi, "");
  const match = cleaned.match(/\d+/);
  if (!match) return 0;
  
  const qty = parseInt(match[0], 10);
  return (qty > 0 && qty <= 100000) ? qty : 0;
}

// Normalize for matching
function normalize(text) {
  return String(text || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Parse PDF invoice
 * Returns array of { itemIdentifier, sapcode, orderqty }
 */
export async function parsePDFInvoice(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const items = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(" ");
    
    // Simple line-by-line extraction
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    for (const line of lines) {
      const tokens = line.split(/\s+/);
      
      // Find quantity (scan from right)
      let qty = 0;
      for (let j = tokens.length - 1; j >= 0; j--) {
        qty = extractQty(tokens[j]);
        if (qty > 0) break;
      }
      
      if (qty === 0) continue;
      
      // Extract identifier (remaining tokens)
      const itemIdentifier = normalize(tokens.slice(0, -1).join(" "));
      if (itemIdentifier.length < 3) continue;
      
      items.push({
        itemIdentifier,
        sapcode: "", // Extract if pattern found
        orderqty: qty
      });
    }
  }

  await pdf.destroy();
  return items;
}

/**
 * Parse Excel invoice
 */
export async function parseExcelInvoice(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const items = [];

  for (const row of rows) {
    // Find item description (check common column names)
    const itemIdentifier = normalize(
      row.ITEMDESC || row["ITEM DESC"] || row["Item Description"] ||
      row.PRODUCT || row["Product Name"] || ""
    );

    // Find quantity
    const orderqty = extractQty(
      row.ORDERQTY || row["ORDER QTY"] || row.QTY || row.Quantity || 0
    );

    if (!itemIdentifier || orderqty === 0) continue;

    const sapcode = normalize(
      row.SAPCODE || row["SAP CODE"] || row.CODE || ""
    );

    items.push({ itemIdentifier, sapcode, orderqty });
  }

  return items;
}

/**
 * Parse text invoice
 */
export async function parseTextInvoice(buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  const items = [];

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    
    let qty = 0;
    for (let j = tokens.length - 1; j >= 0; j--) {
      qty = extractQty(tokens[j]);
      if (qty > 0) break;
    }
    
    if (qty === 0) continue;
    
    const itemIdentifier = normalize(tokens.slice(0, -1).join(" "));
    if (itemIdentifier.length < 3) continue;
    
    items.push({ itemIdentifier, sapcode: "", orderqty: qty });
  }

  return items;
}

/**
 * Main entry point
 */
export async function parseInvoice(file) {
  const filename = (file.originalname || "").toLowerCase();

  if (filename.endsWith(".pdf")) {
    return parsePDFInvoice(file.buffer);
  }

  if (filename.endsWith(".xls") || filename.endsWith(".xlsx")) {
    return parseExcelInvoice(file.buffer);
  }

  if (filename.endsWith(".txt")) {
    return parseTextInvoice(file.buffer);
  }

  throw new Error("UNSUPPORTED_FILE_FORMAT");
}

export default { parseInvoice };