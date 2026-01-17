/**
 * ORDER CONTROLLER - FINAL PRODUCTION VERSION
 * Compatible with your ProductMaster schema
 */

import OrderUpload from "../models/orderUpload.js";
import XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { unifiedExtract } from "../services/unifiedParser.js";
import { matchProductSmart } from "../services/productMatcher.js";
import ProductMaster from "../models/productMaster.js";
import CustomerMaster from "../models/customerMaster.js";
import SchemeMaster from "../models/schemeMaster.js";
import { applyScheme } from "../services/schemeMatcher.js";
import {
  stripLeadingCodes,
  cleanInvoiceDesc,
  isJunkLine,
  similarity
} from "../utils/invoiceUtils.js";
import { splitProduct } from "../utils/splitProducts.js";

/* =====================================================
   TEMPLATE COLUMNS
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
function preprocessProducts(products) {
  return products.map(p => {
    if (!p.baseName || !p.dosage) {
      const parts = splitProduct(p.productName);
      return {
        ...p,
        baseName: p.baseName || parts.name,
        dosage: p.dosage || parts.strength,
        variant: p.variant || parts.variant
      };
    }
    return p;
  });
}

function isHardJunkLine(text = "") {
  const t = text.toUpperCase();
  return (
    t.length < 6 ||
    /^APPROX\s*VALUE/.test(t) ||
    /^MICRO\s*\(/.test(t) ||
    /^PRINTED\s+BY/.test(t) ||
    /^SUPPLIER\s*:/.test(t) ||
    /^GSTIN/.test(t) ||
    /^DL\s*NO/.test(t) ||
    /^PAGE\s+\d+/.test(t)
  );
}

function extractPackSize(desc = "") {
  const patterns = [
    /\((\d+)\s*['`"]?\s*S\)/i,
    /\b(\d+)\s*['`"]?\s*S\b/i,
    /\b(\d+)\s*(TAB|TABS)\b/i,
    /\b(\d+)\s*(CAP|CAPS)\b/i,
    /\b(\d+)\s*ML\b/i
  ];
  for (const rx of patterns) {
    const m = desc.match(rx);
    if (m) return Number(m[1]);
  }
  return 0;
}

function normalizePack(n) {
  const v = Number(n);
  if (!v || v <= 0) return 0;
  return Math.round(v);
}

function calcBoxPack(qty, pack) {
  if (!qty || !pack) return 0;
  return Math.ceil(qty / pack);
}

function matchCustomerSmart(invoiceName, customers) {
  if (!invoiceName) return { auto: null, candidates: [] };

  const inv = invoiceName.toUpperCase();

  const matches = customers.filter(c => {
    const name = c.customerName?.toUpperCase();
    return name && (
      inv === name ||
      inv.includes(name) ||
      name.includes(inv)
    );
  });

  // ✅ SAFE AUTO-PICK ONLY IF UNIQUE
  if (matches.length === 1) {
    return { auto: matches[0], candidates: [] };
  }

  // ⚠️ MULTIPLE → USER MUST PICK
  if (matches.length > 1) {
    return {
      auto: null,
      candidates: matches.map(c => ({
        customerCode: c.customerCode,
        customerName: c.customerName,
        city: c.city,
        state: c.state
      }))
    };
  }

  return { auto: null, candidates: [] };
}



/* =====================================================
   EXTRACT ORDER FIELDS
===================================================== */

export const extractOrderFields = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const extracted = await unifiedExtract(req.file);
    if (!extracted?.dataRows?.length) {
      return res.status(422).json({ success: false, message: "No product rows found" });
    }

    const products = preprocessProducts(
      await ProductMaster.find({}).lean()
    );
    const customers = await CustomerMaster.find({}).lean();

  const matchedCustomer = matchCustomerSmart(
  extracted.meta?.customerName,
  customers
);

    const CUSTOMER_NAME = matchedCustomer?.customerName || extracted.meta?.customerName || "UNKNOWN";
    const CUSTOMER_CODE = matchedCustomer?.customerCode || "";

    const validRows = [];
    const failedMatches = [];

    for (const row of extracted.dataRows) {
  const qty = Number(row.ORDERQTY);
  if (!qty || qty <= 0) continue;

  let raw = stripLeadingCodes(row.ITEMDESC || "");
  let cleaned = cleanInvoiceDesc(raw);

  if (!cleaned || cleaned.length < 3) continue;
  if (isHardJunkLine(cleaned)) continue;

  const match = matchProductSmart(cleaned, products);

  if (!match) {
    failedMatches.push({ raw: row.ITEMDESC, cleaned });
    continue;
  }

  // ---------------- PACK RESOLUTION ----------------
  let pack = extractPackSize(row.ITEMDESC);

  if (!pack && match?.productName) {
    pack = extractPackSize(match.productName);
  }

  if (!pack && match?.pack) {
    pack = normalizePack(match.pack);
  }

  if (!pack || pack <= 0) {
    pack = 1;
  }

  // ---------------- PUSH ROW ----------------
  validRows.push({
    ITEMDESC: cleaned,          // invoice text
    ORDERQTY: qty,
    matchedProduct: {
      _id: match._id,
      productCode: match.productCode,
      productName: match.productName,
      cleanedProductName: match.cleanedProductName,
      baseName: match.baseName,
      dosage: match.dosage,
      variant: match.variant,
      division: match.division,
      confidence: match.confidence
    },
    SAPCODE: match.productCode,
    PACK: pack,
    "BOX PACK": calcBoxPack(qty, pack),
    DVN: match.division || ""
  });
}


    if (!validRows.length) {
      return res.status(422).json({
        success: false,
        message: "No products matched",
        failedMatches
      });
    }

    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const upload = await OrderUpload.create({
      userId: req.user.id,
      userEmail: req.user.email,
      fileName: req.file.originalname,
      fileHash,
      status: "EXTRACTED",
      extractedData: { dataRows: validRows },
      failedMatches
    });

    res.json({
      success: true,
      uploadId: upload._id,
      dataRows: validRows,
   customer: {
  name: matchedCustomer?.customerName || extracted.meta?.customerName,
  code: matchedCustomer?.customerCode || "",
  confidence: matchedCustomer?.confidence || 0,
  needsConfirmation: matchedCustomer?.confidence < 0.85
},
      failedCount: failedMatches.length
    });

  } catch (err) {
    console.error("❌ Order extract error:", err);
    next(err);
  }
};
/* =====================================================
   CONVERT ORDERS
===================================================== */

export const convertOrders = async (req, res, next) => {
  try {
    const { uploadId } = req.body;
    
    const upload = await OrderUpload.findOne({ 
      _id: uploadId, 
      userId: req.user.id 
    });
    
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }
    
    const sourceRows = upload.extractedData.dataRows;
    const schemes = await SchemeMaster.find({ isActive: true }).lean();
    
    const output = [];
    const errors = [];
    
    sourceRows.forEach((row, idx) => {
      const qty = Number(row.ORDERQTY);
      if (isNaN(qty) || qty <= 0) {
        errors.push({
          rowNumber: idx + 2,
          field: "ORDERQTY",
          error: "Invalid quantity"
        });
        return;
      }
      
      // Apply schemes (if configured)
      const schemeResult = applyScheme({
        productCode: row.SAPCODE,
        customerCode: row.CODE,
        orderQty: qty,
        schemes
      });
      
      output.push({
        CODE: row.CODE || "",
        "CUSTOMER NAME": row["CUSTOMER NAME"] || "UNKNOWN",
        SAPCODE: row.SAPCODE || "",
        ITEMDESC: row.ITEMDESC,
        ORDERQTY: qty,
        "BOX PACK": row["BOX PACK"],
        PACK: row.PACK,
        DVN: row.DVN || ""
      });
    });
    
    if (!output.length) {
      return res.status(400).json({ 
        message: "No valid rows", 
        errors 
      });
    }
    
    // Generate Excel
    fs.mkdirSync("uploads", { recursive: true });
    const fileName = `order-training-${upload._id}.xlsx`;
    const filePath = path.join("uploads", fileName);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(output, { header: TEMPLATE_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, "Order Training");
    XLSX.writeFile(wb, filePath);
    
    // Update upload
    upload.status = "CONVERTED";
    upload.outputFile = fileName;
    upload.recordsProcessed = output.length;
    upload.recordsFailed = errors.length;
    upload.convertedData = { rows: output };
    await upload.save();
    
    console.log(`✅ Converted: ${output.length} rows`);
    
    res.json({
      success: true,
      status: "CONVERTED",
      uploadId: upload._id,
      recordsProcessed: output.length,
      errors: errors.length,
      convertedData: output
    });
    
  } catch (err) {
    console.error('❌ Conversion Error:', err);
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
        message: "Order not found"
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
      processed: h.recordsProcessed || 0,
      createdAt: h.createdAt
    }))
  });
};

// Add to orderController.js
export const processBatchOrders = async (req, res, next) => {
  try {
    const BATCH_SIZE = 100;
    const { uploadId } = req.body;
    
    const upload = await OrderUpload.findById(uploadId);
    const rows = upload.extractedData.dataRows;
    
    const results = [];
    
    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchResults = await processOrderBatch(batch);
      results.push(...batchResults);
      
      // Update progress
      upload.progress = Math.round((i / rows.length) * 100);
      await upload.save();
    }
    
    // Generate final output
    const output = generateOrderOutput(results);
    
    res.json({
      success: true,
      processed: results.length,
      output
    });
    
  } catch (err) {
    next(err);
  }
};