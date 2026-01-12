/**
 * COMPLETE UNIFIED PARSER
 * Includes: Enhanced PDF parser + Enhanced Excel parser + Text parser
 */

import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { normalizeKey } from "../utils/normalizeKey.js";
import XLSX from "xlsx";

const TEMPLATE_COLUMNS = [
  "CODE",
  "CUSTOMER NAME", 
  "SAPCODE",
  "ITEMDESC",
  "ORDERQTY",
  "BOX PACK",
  "PACK",
  "DVN"
];

const QTY_LIMITS = { MIN: 1, MAX: 10000 };
const SAPCODE_PATTERN = /^\d{4,7}$/;

/* ========================================================================
   UTILITY FUNCTIONS
======================================================================== */

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function safeInt(value, defaultVal = 0) {
  if (value === null || value === undefined) return defaultVal;
  const n = typeof value === "number" ? value : parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isInteger(n) ? n : defaultVal;
}

function validateQty(qty) {
  const n = safeInt(qty, 0);
  return (n >= QTY_LIMITS.MIN && n <= QTY_LIMITS.MAX) ? n : 0;
}

function isSAPCode(token) {
  return SAPCODE_PATTERN.test(String(token).trim());
}

function cleanItemDesc(text) {
  return clean(text)
    .replace(/\[approx\s*value\s*:.*?\]/gi, "")
    .replace(/\b(gm|mg|ml|caps?|tabs?|tablet|capsule|syrup|injection|inj|strip|pack|box|bottle|vial)\b/gi, "")
    .replace(/\d+\s*['"]s?\b/gi, "")
    .replace(/\*\d+/g, "")
    .replace(/\+\d+\s*(free|bonus)/gi, "")
    .replace(/\s+\*+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanCustomerName(text) {
  return clean(text)
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
    .replace(/(address|gstin|gst|pan|dl\s*no|mob|mobile|email|phone|fssai|tin)[\s:].*/gi, "")
    .replace(/[,;:]+$/, "")
    .trim();
}

function isNoiseKeyword(line) {
  const noisePatterns = [
    /^(bills?\s*not\s*paid)/i,
    /^(powered\s*by)/i,
    /^(invoice\s*no|inv\s*no)/i,
    /^(page\s*\d+|continued)/i,
    /(cancel|pending|authorised|authorized|signatory)/i,
    /(note\s*:|remarks?|split\s*details|terms\s*&?\s*conditions)/i,
    /(total\s*value|net\s*value|gross\s*value)/i,
    /due\s*date\s*will\s*attract/i,
    /interest|thank\s*you|signature/i,
  ];
  return noisePatterns.some(pattern => pattern.test(line));
}

function isTableStopLine(line) {
  return /^(grand\s*total|net\s*total|gross\s*total|total\s*order|end\s*of\s*order)/i.test(line);
}

function extractCustomerName(lines) {
  const patterns = [
    /(?:supplier|party\s*name|buyer|customer|bill\s*to|ship\s*to)\s*[:\-]\s*(.+)/i,
    /^([A-Z][A-Z\s&.]+(?:ENTERPRISES|AGENCIES|DISTRIBUTORS|PHARMA|HEALTHCARE|MEDICALS?|LTD|PVT|LIMITED|INC))/i,
  ];

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = clean(lines[i]);
    
    if (/^(gstin|gst|pan|dl|mob|email|phone|address|fssai|tin)/i.test(line)) {
      continue;
    }

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

/* ========================================================================
   PRODUCT LINE PARSER
======================================================================== */

function tokenizeLine(line) {
  return line.split(/\s+/).filter(t => t.length > 0);
}

function parseProductLineTokens(line) {
  const cleanLine = clean(line);
  if (!cleanLine) return null;

  if (isTableStopLine(cleanLine) || isNoiseKeyword(cleanLine)) {
    return null;
  }

  if (!/\d/.test(cleanLine)) {
    return null;
  }

  if (/^(?:company\s*name|comapany\s*name|division\s*name)\s*[:\-]/i.test(cleanLine)) {
    return null;
  }

  if (/^(company|division|comapany)\s*$/i.test(cleanLine)) {
    return null;
  }

  const tokens = tokenizeLine(cleanLine);
  if (tokens.length < 2) return null;

  let sapcode = "";
  let orderqty = 0;
  let itemdesc = "";

  let sapIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isSAPCode(tokens[i])) {
      sapcode = tokens[i];
      sapIndex = i;
      break;
    }
  }

  let qtyIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    
    if (/^(free|bonus|scheme|value|rate|price|amount|mrp|ptr|pts|total)$/i.test(token)) {
      continue;
    }

    const qty = validateQty(token);
    if (qty > 0) {
      orderqty = qty;
      qtyIndex = i;
      break;
    }
  }

  if (sapIndex !== -1 && qtyIndex !== -1 && qtyIndex > sapIndex + 1) {
    const descTokens = tokens.slice(sapIndex + 1, qtyIndex);
    itemdesc = cleanItemDesc(descTokens.join(" "));
  } else if (sapIndex === -1 && qtyIndex !== -1) {
    const descTokens = tokens.slice(0, qtyIndex);
    itemdesc = cleanItemDesc(descTokens.join(" "));
  }

  if (itemdesc) {
    const companyPatterns = [
      /^(?:company\s*name|comapany\s*name|division\s*name)/i,
      /^(?:micro|pharma|labs?|ltd|pvt|limited|inc|corp)/i,
    ];
    
    if (companyPatterns.some(pattern => pattern.test(itemdesc)) && !orderqty) {
      return null;
    }

    if (/^(bills?|powered|invoice|inv|page|continued)/i.test(itemdesc)) {
      return null;
    }

    const alphaChars = itemdesc.replace(/[^a-zA-Z]/g, "");
    if (alphaChars.length < 3) {
      return null;
    }
  }

  if (!itemdesc || itemdesc.length < 2 || !orderqty) {
    return null;
  }

  return { sapcode: sapcode || "", itemdesc, orderqty };
}

/* ========================================================================
   PDF PARSER
======================================================================== */

export async function extractPurchaseOrderPDF(file) {
  try {
    const { lines } = await extractTextFromPDFAdvanced(file.buffer);
    const customerName = extractCustomerName(lines);
    const dataRows = [];

    let state = "OUTSIDE_TABLE";
    let currentDVN = "";
    let pendingSAPCode = null;

    for (let i = 0; i < lines.length; i++) {
      const line = clean(lines[i]);
      if (!line) continue;

      if (isNoiseKeyword(line)) continue;

      if (/^(gstin|gst|mob|mobile|dl\s*no|pan|tin|email|phone|address|fssai)/i.test(line)) {
        continue;
      }

      const companyMatch = line.match(/(?:company|division)\s*[:\-]\s*(.+)/i);
      if (companyMatch) {
        let dvn = clean(companyMatch[1]);
        dvn = dvn.replace(/\[approx\s*value\s*:.*?\]/gi, "").trim();
        currentDVN = dvn;
        
        if (state === "OUTSIDE_TABLE") {
          state = "INSIDE_TABLE";
        }
        pendingSAPCode = null;
        continue;
      }

      if (/^(?:company\s*name|comapany\s*name)\s*[:\-]/i.test(line)) {
        const nameMatch = line.match(/^(?:company\s*name|comapany\s*name)\s*[:\-]\s*(.+)/i);
        if (nameMatch) {
          let dvn = clean(nameMatch[1]);
          dvn = dvn.replace(/\[approx\s*value\s*:.*?\]/gi, "").trim();
          currentDVN = dvn;
          pendingSAPCode = null;
          continue;
        }
      }

      if (/^(company|division|comapany)\s*$/i.test(line)) continue;

      if (state === "OUTSIDE_TABLE") {
        const isHeader = /(sl\s*no|s\.no|sr\s*no).*(code|item|product)/i.test(line) ||
                        /(item|product).*(qty|quantity|order)/i.test(line) ||
                        /(code).*(qty|quantity)/i.test(line);
        
        const startsWithSAP = /^\d{4,7}\s/.test(line);
        
        if (isHeader || startsWithSAP) {
          state = "INSIDE_TABLE";
          pendingSAPCode = null;
          continue;
        }
      }

      if (state !== "INSIDE_TABLE") continue;

      if (isTableStopLine(line)) {
        state = "OUTSIDE_TABLE";
        pendingSAPCode = null;
        continue;
      }

      const product = parseProductLineTokens(line);

      if (product) {
        const isCompanyName = /^(?:micro|pharma|carsyon|labs?|division|company)/i.test(product.itemdesc) &&
                              product.itemdesc.split(/\s+/).length <= 3 &&
                              !product.sapcode;

        if (isCompanyName) {
          pendingSAPCode = null;
          continue;
        }

        if (pendingSAPCode && !product.sapcode && product.itemdesc && product.orderqty) {
          dataRows.push([customerName, pendingSAPCode, product.itemdesc, product.orderqty, currentDVN]);
          pendingSAPCode = null;
          continue;
        }

        if (product.itemdesc && product.orderqty) {
          dataRows.push([customerName, product.sapcode, product.itemdesc, product.orderqty, currentDVN]);
          pendingSAPCode = null;
          continue;
        }

        if (product.sapcode && !product.itemdesc) {
          pendingSAPCode = product.sapcode;
        }
      } else {
        if (isSAPCode(line)) {
          pendingSAPCode = line;
        }
      }
    }

    const validRows = dataRows.filter(row => {
      const [customer, sapcode, itemdesc, orderqty, dvn] = row;
      
      if (!itemdesc || itemdesc.length < 2) return false;
      if (orderqty < QTY_LIMITS.MIN || orderqty > QTY_LIMITS.MAX) return false;
      if (/^(bills?|powered|invoice|inv\s*no)/i.test(itemdesc)) return false;
      
      return true;
    });

    console.log(`📊 PDF: ${lines.length} lines → ${dataRows.length} raw → ${validRows.length} valid`);

    return createTemplateOutput(validRows, customerName);

  } catch (err) {
    console.error("❌ PDF extraction failed:", err);
    return createEmptyResult("PDF_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   EXCEL PARSER
======================================================================== */

export async function extractInvoiceExcel(file) {
  try {
    const workbook = XLSX.read(file.buffer, {
      type: "buffer",
      cellText: false,
      raw: false
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false
    });

    if (!rows || rows.length === 0) {
      return createEmptyResult("EMPTY_FILE");
    }

    const headerIndex = findHeaderRow(rows);
    if (headerIndex === -1) {
      return createEmptyResult("TABLE_HEADER_NOT_FOUND");
    }

    const metaRows = rows.slice(0, headerIndex);
    const headers = rows[headerIndex].map((h, i) => 
      normalizeKey(h) || `column_${i + 1}`
    );

    const dataRows = rows
      .slice(headerIndex + 1)
      .filter(row => row.some(cell => String(cell || "").trim() !== ""));

    if (!dataRows.length) {
      return createEmptyResult("NO_DATA_ROWS");
    }

    const customerName = extractCustomerName(metaRows.map(r => r.join(" ")));
    const mapping = createColumnMapping(headers);

    const transformedRows = dataRows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });

      return [
        customerName,
        String(obj[mapping.sapcode] || "").trim(),
        cleanItemDesc(String(obj[mapping.itemdesc] || "")),
        validateQty(obj[mapping.orderqty]),
        String(obj[mapping.dvn] || "").trim()
      ];
    }).filter(row => {
      const [, , itemdesc, orderqty] = row;
      return itemdesc && itemdesc.length >= 2 && orderqty > 0;
    });

    return createTemplateOutput(transformedRows, customerName);

  } catch (err) {
    console.error("❌ Excel extraction failed:", err);
    return createEmptyResult("EXCEL_EXTRACTION_FAILED");
  }
}

function findHeaderRow(rows) {
  const keywords = ["item", "product", "qty", "quantity", "code", "sap", "order", "name"];

  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i].map(c => normalizeKey(c || ""));
    
    if (row.every(cell => !cell)) continue;

    if (row.some(c => c === "product") && row.some(c => c.includes("quantity"))) {
      return i;
    }

    const hasCompany = row.some(c => c.includes("company"));
    const hasDivision = row.some(c => c.includes("division"));
    const hasItemOrQty = row.some(c => c.includes("item") || c.includes("qty"));
    
    if (hasCompany && hasDivision && hasItemOrQty) {
      return i;
    }

    const matches = row.filter(cell => 
      keywords.some(kw => cell.includes(kw))
    );
    
    if (matches.length >= 3) {
      return i;
    }

    if (matches.length >= 2) {
      const hasCore = row.some(c => c.includes("itemdesc") || c.includes("orderqty"));
      if (hasCore) return i;
    }

    if (row.length <= 3 && 
        row.some(c => c.includes("item") || c.includes("product")) &&
        row.some(c => c.includes("qty") || c.includes("quantity"))) {
      return i;
    }
  }

  return -1;
}

function createColumnMapping(headers) {
  const mapping = {
    sapcode: "",
    itemdesc: "",
    orderqty: "",
    dvn: ""
  };

  const aliases = {
    sapcode: ["sapcode", "sap", "code", "itemcode", "item code", "product code"],
    itemdesc: ["itemdesc", "item name", "product name", "product", "description", "desc", "medicine", "name"],
    orderqty: ["orderqty", "order qty", "qty", "quantity"],
    dvn: ["dvn", "division", "div", "company"]
  };

  headers.forEach((header, index) => {
    const normalized = normalizeKey(header);
    
    Object.entries(aliases).forEach(([target, keywords]) => {
      if (keywords.some(kw => normalized === kw || normalized.includes(kw))) {
        if (!mapping[target]) {
          mapping[target] = header;
        }
      }
    });
  });

  return mapping;
}

/* ========================================================================
   TEXT PARSER
======================================================================== */

export async function extractOrderText(file) {
  try {
    if (!file?.buffer) {
      return createEmptyResult("EMPTY_FILE");
    }

    const text = file.buffer.toString("utf8");
    const lines = text.split(/\r?\n/).map(l => clean(l)).filter(Boolean);

    const customerName = extractCustomerName(lines);
    const dataRows = [];

    let state = "OUTSIDE_TABLE";

    for (const line of lines) {
      if (state === "OUTSIDE_TABLE") {
        if (/(item|product).*(qty|quantity|order)/i.test(line) ||
            /(code).*(qty|quantity)/i.test(line)) {
          state = "INSIDE_TABLE";
          continue;
        }
      }

      if (state !== "INSIDE_TABLE") continue;

      if (/(total\s*value|net\s*value|despatch|dispatch|authorised|authorized|signatory)/i.test(line)) {
        break;
      }

      if (isNoiseKeyword(line)) continue;

      const product = parseProductLineTokens(line);

      if (product && product.itemdesc && product.orderqty) {
        const cleanDesc = product.itemdesc.replace(/[*\s-]/g, "");
        if (cleanDesc.length >= 3) {
          dataRows.push([customerName, product.sapcode, product.itemdesc, product.orderqty, ""]);
        }
      }
    }

    return createTemplateOutput(dataRows, customerName);

  } catch (err) {
    console.error("❌ TXT extraction failed:", err);
    return createEmptyResult("TXT_EXTRACTION_FAILED");
  }
}

/* ========================================================================
   TEMPLATE OUTPUT
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

  return [
    { id: "code", fieldName: "Code", sampleValue: sample["CODE"] || "", autoMapped: "CODE", confidence: "high" },
    { id: "customer", fieldName: "Customer Name", sampleValue: sample["CUSTOMER NAME"] || "", autoMapped: "CUSTOMER NAME", confidence: "high" },
    { id: "sapcode", fieldName: "SAP Code", sampleValue: sample["SAPCODE"] || "", autoMapped: "SAPCODE", confidence: sample["SAPCODE"] ? "high" : "medium" },
    { id: "itemdesc", fieldName: "Item Description", sampleValue: sample["ITEMDESC"] || "", autoMapped: "ITEMDESC", confidence: "high" },
    { id: "orderqty", fieldName: "Order Quantity", sampleValue: String(sample["ORDERQTY"] || 0), autoMapped: "ORDERQTY", confidence: "high" },
    { id: "boxpack", fieldName: "Box Pack", sampleValue: String(sample["BOX PACK"] || 0), autoMapped: "BOX PACK", confidence: "medium" },
    { id: "pack", fieldName: "Pack", sampleValue: String(sample["PACK"] || 0), autoMapped: "PACK", confidence: "medium" },
    { id: "dvn", fieldName: "Division", sampleValue: sample["DVN"] || "", autoMapped: "DVN", confidence: "medium" }
  ];
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
   UNIFIED ENTRY POINT
======================================================================== */

export async function unifiedExtract(file) {
  if (!file?.buffer) return createEmptyResult("EMPTY_FILE");

  const name = (file.originalname || "").toLowerCase();

  if (name.endsWith(".pdf")) return extractPurchaseOrderPDF(file);
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return extractInvoiceExcel(file);
  if (name.endsWith(".txt")) return extractOrderText(file);

  return createEmptyResult("UNSUPPORTED_FORMAT");
}