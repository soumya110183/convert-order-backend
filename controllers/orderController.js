/**
 * USER ORDER CONTROLLER – PRODUCTION SAFE
 * ---------------------------------------
 * RULES:
 * - NO admin/master DB updates
 * - ONLY generate Order Training file
 * - Admin DB is READ-ONLY
 */

import OrderUpload from "../models/orderUpload.js";
import XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { unifiedExtract } from "../services/unifiedParser.js";
import { matchProductLoose } from "../services/productMatcher.js";
import ProductMaster from "../models/productMaster.js";
import CustomerMaster from "../models/customerMaster.js";

import SchemeMaster from "../models/schemeMaster.js";
import { applyScheme } from "../services/schemeMatcher.js";


function detectCustomerName(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const text = Object.values(rows[i] || {}).join(" ").toUpperCase();

    if (
      text.includes("BILL TO") ||
      text.includes("BUYER") ||
      text.includes("CONSIGNEE")
    ) {
      return text
        .replace(/.*?(BILL TO|BUYER|CONSIGNEE)[:\s-]*/i, "")
        .replace(/PURCHASE ORDER.*/gi, "")
        .trim();
    }

    // fallback enterprise detection
    if (
      /(PHARMA|AGENCIES|ENTERPRISES|DISTRIBUTORS|MEDICAL)/i.test(text)
    ) {
      return text.trim();
    }
  }
  return null;
}



function matchCustomerLoose(text, customers) {
  if (!text || !customers?.length) return null;

  const norm = text.toUpperCase();

  // 1. Try GSTIN Exact Match
  const gstinMatch = norm.match(/\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/);
  if (gstinMatch) {
    const gstin = gstinMatch[0];
    const found = customers.find(c => c.gstNo?.toUpperCase() === gstin);
    if (found) return found;
  }

  // 2. Try Drug License Match
  const dlMatch = norm.match(/(?:\bDL\s*NO[:\s]*)?([A-Z0-9/-]{10,})/i);
  if (dlMatch) {
    const dl = dlMatch[1].toUpperCase();
    const found = customers.find(c => 
      c.drugLicNo?.toUpperCase() === dl || 
      c.drugLicNo1?.toUpperCase() === dl
    );
    if (found) return found;
  }

  // 3. Normalized Name Matching
  const cleanNorm = norm.replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleanNorm.split(" ").filter(t => t.length > 2);
  if (tokens.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const c of customers) {
    if (!c.customerName) continue;
    
    const cname = c.customerName.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    
    let currentScore = 0;

    // A. Exact Match
    if (cleanNorm === cname) {
      currentScore = 2.0; 
    } 
    // B. Substring Match
    else if (cleanNorm.includes(cname) || cname.includes(cleanNorm)) {
      currentScore = 1.0 + (Math.min(cname.length, cleanNorm.length) / Math.max(cname.length, cleanNorm.length));
    }

    // C. Token Overlap
    const cTokens = cname.split(" ").filter(t => t.length > 2);
    if (cTokens.length > 0) {
      const common = cTokens.filter(t => tokens.includes(t));
      const overlapScore = common.length / cTokens.length;
      if (overlapScore >= 0.5) {
        currentScore = Math.max(currentScore, overlapScore);
      }
    }

    if (currentScore > bestScore && currentScore >= 0.5) {
      bestScore = currentScore;
      best = c;
    }
  }
  
  return best;
}

/* =====================================================
   CONSTANTS
===================================================== */

const TEMPLATE_COLUMNS = [
  "CODE",
  "CUSTOMER NAME",
  "SAPCODE",
  "ITEMDESC",
  "ORDERQTY",
  "FREE_QTY",
  "SCHEME_CODE",
  "SCHEME_NAME",
  "BOX PACK",
  "PACK",
  "DVN"
];


/* =====================================================
   UTILITIES
===================================================== */

function extractPackSize(desc = "") {
  if (!desc) return 0;

  const patterns = [
    /\b(\d+)\s*['`"]?\s*S\b/i,       // 15'S, 15S
    /\b(\d+)\s*(TAB|TABS)\b/i,
    /\b(\d+)\s*(CAP|CAPS)\b/i,
    /\b(\d+)\s*ML\b/i,
    /\b(\d+)\s*GM\b/i,
    /\b(\d+)\s*MG\b/i
  ];

  for (const rx of patterns) {
    const m = desc.match(rx);
    if (m) return Number(m[1]);
  }

  return 0;
}


function calcBoxPack(qty, pack) {
  if (!qty || !pack) return 0;
  return Math.ceil(qty / pack); // 🚨 ALWAYS CEIL
}

function normalizePack(rawPack) {
  const n = Number(rawPack);
  if (!n || n <= 0) return 0;

  // Conversion ratio → integer pack
  if (n > 0 && n < 1) {
    return Math.round(1 / n);
  }

  return Math.round(n);
}

function validateRow(row, index) {
  const errors = [];
  const warnings = [];

  const qty = Number(row.ORDERQTY);
  if (isNaN(qty) || qty <= 0) {
    errors.push({
      rowNumber: index + 2,
      field: "ORDERQTY",
      error: "Invalid order quantity",
      originalValue: row.ORDERQTY
    });
  }

  if (!row.ITEMDESC) {
    errors.push({
      rowNumber: index + 2,
      field: "ITEMDESC",
      error: "Missing item description",
      originalValue: row.ITEMDESC
    });
  }

  let pack = Number(row.PACK) || extractPackSize(row.ITEMDESC || "");
  if (!pack) {
    warnings.push({ 
      rowNumber: index + 2, 
      field: "PACK", 
      warning: "Pack not detected",
      originalValue: row.PACK 
    });
  }

  row.PACK = pack || 0;
  row["BOX PACK"] = calcBoxPack(qty, pack);

  return { row, errors, warnings };
}

/* =====================================================
   EXTRACT FILE
===================================================== */

export const extractOrderFields = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    /* =====================================================
       1️⃣ Extract loose rows from invoice
    ===================================================== */
    const extracted = await unifiedExtract(req.file);

    if (!extracted?.dataRows?.length) {
      return res.status(422).json({ success: false, message: "No data extracted" });
    }

    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    /* =====================================================
       2️⃣ Load ADMIN masters (READ ONLY)
    ===================================================== */
    const products = await ProductMaster.find({}).lean();
    if (!products.length) {
      return res.status(500).json({ message: "Admin product master missing" });
    }

    const customers = await CustomerMaster.find({}).lean();
    if (!customers.length) {
      return res.status(500).json({ message: "Admin customer master missing" });
    }

    /* =====================================================
       3️⃣ Detect & match CUSTOMER (ONCE per order)
    ===================================================== */
    const detectedCustomerText =
      extracted.meta?.customerName ||
      detectCustomerName(extracted.dataRows);

    const matchedCustomer = matchCustomerLoose(detectedCustomerText, customers);

    const CUSTOMER_NAME = matchedCustomer?.customerName || "UNKNOWN";
    const CUSTOMER_CODE = matchedCustomer?.customerCode || "";

    console.log("🏷️ Customer Detected:", CUSTOMER_NAME, CUSTOMER_CODE);

    /* =====================================================
       4️⃣ Filter & map ONLY valid product rows
    ===================================================== */
    const validRows = [];

    for (const row of extracted.dataRows) {
      const qty = Number(row.ORDERQTY);
      if (!qty || qty <= 0) continue;

      const match = matchProductLoose(row.ITEMDESC, products);

      console.log(
        `🔍 [MATCH] "${row.ITEMDESC?.slice(0, 30)}..." →`,
        match ? "✅" : "❌"
      );

      if (!match) continue;

      const p = match.product;

      /* =====================================================
         ✅ PACK RESOLUTION (INVOICE FIRST — FIXED)
      ===================================================== */

      // 1️⃣ INVOICE is source of truth
      let pack = extractPackSize(row.ITEMDESC);

      // 2️⃣ Fallback to DB (normalize ratios like 0.1 → 10)
      if (!pack) {
        pack = normalizePack(p.pack);
      }

      // 3️⃣ Fallback to product name
      if (!pack) {
        pack = extractPackSize(p.productName);
      }

      // 4️⃣ Absolute safety
      if (!pack) {
        console.warn(`🚩 Pack unresolved for ${p.productName}, defaulting to 1`);
        pack = 1;
      }

      /* =====================================================
         ✅ BOX PACK — ALWAYS CALCULATED
      ===================================================== */
      const boxPack = Math.ceil(qty / pack);

      validRows.push({
        CODE: CUSTOMER_CODE,
        "CUSTOMER NAME": CUSTOMER_NAME,
        SAPCODE: p.sapCode || p.productCode || "",
        ITEMDESC: p.productName || "UNKNOWN PRODUCT",
        ORDERQTY: qty,
        PACK: pack,           // ✅ INVOICE-DRIVEN
        "BOX PACK": boxPack,  // ✅ ALWAYS DERIVED
        DVN: p.division || ""
      });
    }

    if (!validRows.length) {
      return res.status(422).json({
        success: false,
        message: "No valid product rows found"
      });
    }

    /* =====================================================
       5️⃣ Save upload (NO admin DB update)
    ===================================================== */
    const upload = await OrderUpload.create({
      userId: req.user.id,
      userEmail: req.user.email,
      fileName: req.file.originalname,
      fileHash,
      status: "EXTRACTED",
      extractedData: { dataRows: validRows }
    });

    /* =====================================================
       6️⃣ Respond
    ===================================================== */
    res.json({
      success: true,
      uploadId: upload._id,
      dataRows: validRows,
      rowCount: validRows.length,
      customer: {
        code: CUSTOMER_CODE,
        name: CUSTOMER_NAME
      }
    });

  } catch (err) {
    next(err);
  }
};



/* =====================================================
   CONVERT → GENERATE EXCEL (NO DB UPDATE)
===================================================== */

export const convertOrders = async (req, res, next) => {
  try {
    const { uploadId } = req.body;

    const upload = await OrderUpload.findOne({ _id: uploadId, userId: req.user.id });
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    const sourceRows = upload.extractedData.dataRows;
    const output = [];
    const errors = [];
    const warnings = [];
const schemes = await SchemeMaster.find({ isActive: true }).lean();

    sourceRows.forEach((row, idx) => {
      const result = validateRow(row, idx);
      if (result.errors.length) {
        console.error(`❌ Validation Error at row ${idx + 2}:`, result.errors);
        errors.push(...result.errors);
        return;
      }
      if (result.warnings.length) {
        console.warn(`⚠️ Validation Warning at row ${idx + 2}:`, result.warnings);
        warnings.push(...result.warnings);
      }

      const schemeResult = applyScheme({
  productCode: row.SAPCODE,
  customerCode: row.CODE,
  orderQty: Number(row.ORDERQTY),
  schemes
});

output.push({
  CODE: row.CODE || "",
  "CUSTOMER NAME": row["CUSTOMER NAME"] || "UNKNOWN",
  SAPCODE: row.SAPCODE || "",
  ITEMDESC: row.ITEMDESC,
  ORDERQTY: Number(row.ORDERQTY),

  FREE_QTY: schemeResult.freeQty || 0,
  SCHEME_CODE: schemeResult.schemeCode || "",
  SCHEME_NAME: schemeResult.schemeName || "",

  "BOX PACK": calcBoxPack(row.ORDERQTY, row.PACK),
  PACK: row.PACK,
  DVN: row.DVN || ""
});

    });

    if (!output.length) {
      return res.status(400).json({ message: "No valid rows", errors });
    }
    upload.convertedData = {
  rows: output
};


    /* ---------- Generate Excel ---------- */
    fs.mkdirSync("uploads", { recursive: true });
    const fileName = `order-training-${upload._id}.xlsx`;
    const filePath = path.join("uploads", fileName);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(output, { header: TEMPLATE_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, "Order Training");
    XLSX.writeFile(wb, filePath);

    upload.status = "CONVERTED";
    upload.outputFile = fileName;
    upload.recordsProcessed = output.length;
    upload.recordsFailed = errors.length;
    upload.rowErrors = errors;
    upload.rowWarnings = warnings;
    upload.convertedData = { rows: output };
    await upload.save();

    console.log(`✅ Conversion Finished: ${output.length} processed, ${errors.length} errors, ${warnings.length} warnings`);

    res.json({
      status:"CONVERTED",
      success: true,
      uploadId: upload._id,
      recordsProcessed: output.length,
      warnings: warnings.length,
      errors: errors.length,
      convertedData: output
    });

  } catch (err) {
    next(err);
  }
};

 
 /* =====================================================
   GET ORDER BY ID
===================================================== */

export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const upload = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    }).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Order upload not found"
      });
    }

    res.json({
      success: true,
      ...upload
    });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   HISTORY
===================================================== */

export const getOrderHistory = async (req, res) => {
  const history = await OrderUpload.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({
    success: true,
    history: history.map(h => ({
      id: h._id,
      fileName: h.fileName,
      status: h.status,
      processed: h.recordsProcessed || 0
    }))
  });
};
