import XLSX from "xlsx";
import { extractTextFromPDFAdvanced } from "./pdfParser.js";

/* ===================== HELPERS ===================== */

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

/* ---------- CUSTOMER DETECTION ---------- */
function detectCustomerGeneric(rows) {
  if (!rows || rows.length === 0) return null;

const HEADER_SCAN_LIMIT = 40;

const businessKeywords = [
  "PVT. LTD",
  "PRIVATE LIMITED",
  "ENTERPRISE",
  "ENTERPRISES",
  "ENTERPRAISE",
  "ENTERPRAISES",
  "AGENCIES",
  "DISTRIBUTORS",
  "DRUG HOUSE",
  "PHARMA",
  "MEDICALS"
];

const strongSignals = [
  /GSTIN/i,
  /D\.?L\.?\s*NO/i,
  /DRUG LIC/i
];

const blockedPatterns = [
  /^COMPANY NAME/i,
  /^DIVISION/i,
  /MICRO CARSYON/i,
  /MICRO LABS/i,
  /PAGE \d+ OF \d+/i
];

let collectedText = [];

for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_LIMIT); i++) {
  const raw =
    typeof rows[i] === "string"
      ? rows[i]
      : Object.values(rows[i] || {}).join(" ");

  const text = clean(raw).toUpperCase();
  if (!text) continue;

  if (blockedPatterns.some(r => r.test(text))) continue;

  const hasBusinessKeyword = businessKeywords.some(k => text.includes(k));
  const hasStrongSignal = strongSignals.some(r => r.test(text));

  if (hasBusinessKeyword || hasStrongSignal) {
    collectedText.push(text.replace(/PURCHASE ORDER.*/gi, "").trim());
    
    // Stop if we have both signals
    const combined = collectedText.join(" ");
    const combinedHasKeyword = businessKeywords.some(k => combined.includes(k));
    const combinedHasSignal = strongSignals.some(r => r.test(combined));
    
    if (combinedHasKeyword && combinedHasSignal && collectedText.length >= 1) {
       // We have enough info
       break;
    }
    
    // Safety break
    if (collectedText.length > 3) break;
  }
}

const final = collectedText.join(" ");
return final && final.length > 3 ? final : null;
}


/* ---------- ROW TYPE FILTER ---------- */
function isJunkLine(text) {
  const t = text.toUpperCase();
  return (
    t.includes("GST") ||
    t.includes("DL NO") ||
    t.includes("ADDRESS") ||
    t.includes("PIN") ||
    t.includes("ROAD") ||
    t.includes("FLOOR") ||
    t.includes("PURCHASE ORDER") ||
    t.includes("INVOICE")
  );
}

/* ---------- QUANTITY EXTRACTION ---------- */
function extractQtyLoose(text) {
  if (!text) return null;

  const upper = text.toUpperCase();
  if (isJunkLine(upper)) return null;

  // QTY / QUANTITY / ORDER QTY
  const keywordMatch = upper.match(/(?:QTY|QUANTITY)\D{0,5}(\d+)/);
  if (keywordMatch) return Number(keywordMatch[1]);

  // Fallback: last clean integer (not price, not PIN)
  const tokens = upper.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n > 0 && n < 100000) return n;
    }
  }

  return null;
}

/* ---------- DESCRIPTION EXTRACTION ---------- */
function extractDescLoose(text) {
  if (!text) return "";

  const cleaned = text
    .replace(/(?:QTY|QUANTITY)\D{0,5}\d+/gi, "")
    .replace(/[,.:/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3 || isJunkLine(cleaned)) return "";
  return cleaned;
}

/* ===================== MAIN ===================== */

export async function unifiedExtract(file) {
  const name = file.originalname.toLowerCase();

  if (name.endsWith(".pdf")) return parsePDF(file);
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv"))
    return parseExcel(file);
  if (name.endsWith(".txt")) return parseText(file);

  return { dataRows: [], meta: {} };
}

/* ===================== PDF ===================== */

async function parsePDF(file) {
  const { rows } = await extractTextFromPDFAdvanced(file.buffer);

  // 1. Detect customer from unfiltered rows
  const customerName = detectCustomerGeneric(rows.map(r => r.rawText));

  // 2. Map and filter product rows
  const dataRows = rows.map(r => {
    const text = clean(r.rawText);
    return {
      ITEMDESC: extractDescLoose(text),
      ORDERQTY: extractQtyLoose(text)
    };
  }).filter(r => r.ITEMDESC && r.ORDERQTY);

  return { 
    dataRows, 
    meta: { customerName: customerName || "UNKNOWN" } 
  };
}

/* ===================== EXCEL ===================== */

function parseExcel(file) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // 1. Detect customer from unfiltered raw rows
  const customerName = detectCustomerGeneric(rows);

  let tableStarted = false;
  const dataRows = [];

  for (const row of rows) {
    const text = clean(Object.values(row).join(" "));
    if (!text) continue;

    const qty = extractQtyLoose(text);
    const desc = extractDescLoose(text);

    // Detect table start
    if (!tableStarted && qty && desc) tableStarted = true;
    if (!tableStarted) continue;

    if (qty && desc) {
      dataRows.push({
        ITEMDESC: desc,
        ORDERQTY: qty
      });
    }
  }

  return {
    dataRows,
    meta: {
      customerName: customerName || "UNKNOWN"
    }
  };
}

/* ===================== TEXT ===================== */

function parseText(file) {
  const lines = file.buffer.toString("utf8").split(/\r?\n/);

  // 1. Detect customer from raw lines
  const customerName = detectCustomerGeneric(lines);

  const dataRows = lines.map(line => {
    const text = clean(line);
    return {
      ITEMDESC: extractDescLoose(text),
      ORDERQTY: extractQtyLoose(text)
    };
  }).filter(r => r.ITEMDESC && r.ORDERQTY);

  return { 
    dataRows, 
    meta: { customerName: customerName || "UNKNOWN" } 
  };
}
