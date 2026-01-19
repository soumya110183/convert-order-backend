/**
 * ORDER CONTROLLER - FIXED VERSION
 * ✅ Fixes:
 * 1. Pack calculation: PACK = Math.ceil(ORDERQTY / BOX PACK)
 * 2. BOX PACK from ProductMaster DB (fixed value)
 * 3. Customer detection and auto-selection
 */

import OrderUpload from "../models/orderUpload.js";
import XLSX from "xlsx-js-style";

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
  cleanInvoiceDesc
} from "../utils/invoiceUtils.js";
import { splitProduct } from "../utils/splitProducts.js";
import { matchCustomerSmart, stringSimilarity } from "../services/customerMatcher.js";

/* =====================================================
   TEMPLATE COLUMNS
===================================================== */
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

    // ✅ CUSTOMER MATCHING WITH AUTO-SELECTION
    const matchResult = matchCustomerSmart(
      extracted.meta?.customerName,
      customers
    );

    console.log('🔍 Customer Match Result:', {
      source: matchResult.source,
      confidence: matchResult.confidence,
      autoSelected: matchResult.auto?.customerName || 'NONE'
    });

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
        console.warn(`❌ No match for: "${cleaned}"`);
        failedMatches.push({ raw: row.ITEMDESC, cleaned });
        continue;
      }

      // ✅ BOX PACK FROM MASTER DB (FIXED VALUE)
      const boxPack = match.boxPack || 0;
      
      // ✅ PACK CALCULATION: ceil(QTY / BOX PACK)
      // Example: QTY=20, BOX PACK=10 → PACK=2
      // Example: QTY=25, BOX PACK=10 → PACK=3
      const pack = boxPack > 0 ? Math.ceil(qty / boxPack) : 0;

      console.log(`✅ Matched: ${match.productCode} | QTY=${qty}, BoxPack=${boxPack}, Pack=${pack}`);

      validRows.push({
        ITEMDESC: cleaned,
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
          confidence: match.confidence,
          pack: pack,           // Calculated
          boxPack: boxPack      // From master DB
        },
        SAPCODE: match.productCode,
        PACK: pack,             // ✅ CALCULATED
        "BOX PACK": boxPack,    // ✅ FROM MASTER DB
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
      failedMatches,
      // ✅ STORE MATCHED CUSTOMER INFO
      customerCode: matchResult.auto?.customerCode || null,
      customerName: matchResult.auto?.customerName || extracted.meta?.customerName || "UNKNOWN"
    });

    // ✅ RETURN CUSTOMER WITH PROPER AUTO-SELECTION
    res.json({
      success: true,
      uploadId: upload._id,
      dataRows: validRows,
      customer: {
        name: matchResult.auto?.customerName || extracted.meta?.customerName || "UNKNOWN",
        code: matchResult.auto?.customerCode || "",
        city: matchResult.auto?.city || "",
        state: matchResult.auto?.state || "",
        source: matchResult.source,
        confidence: matchResult.confidence || 0,
        candidates: matchResult.candidates || [],
        needsConfirmation: matchResult.source === 'MANUAL_REQUIRED',
        // ✅ FULL CUSTOMER OBJECT FOR FRONTEND
        _autoCustomer: matchResult.auto || null,
        // ✅ FLAG TO SHOW IF CUSTOMER WAS AUTO-SELECTED
        autoSelected: matchResult.source === 'EXACT' || matchResult.source === 'FUZZY_AUTO'
      },
      failedCount: failedMatches.length
    });

  } catch (err) {
    console.error("❌ Order extract error:", err);
    next(err);
  }
};
const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: {
    patternType: "solid",
    fgColor: { rgb: "8B0000" } // dark red
  },
  alignment: {
    vertical: "center",
    horizontal: "center"
  },
  border: {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" }
  }
};

const normalCellStyle = {
  border: {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" }
  }
};

const qtyCellStyle = {
  fill: {
    patternType: "solid",
    fgColor: { rgb: "FFFF99" } // light yellow
  },
  alignment: { horizontal: "center" },
  border: {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" }
  }
};

const schemeRowStyle = {
  fill: {
    patternType: "solid",
    fgColor: { rgb: "FFFF00" } // bright yellow
  },
  border: {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" }
  }
};

/* =====================================================
   CONVERT ORDERS
===================================================== */
export const convertOrders = async (req, res, next) => {
  try {
    const { uploadId, customerCode } = req.body;

    if (!customerCode) {
      return res.status(400).json({ 
        success: false, 
        message: "Customer code is required" 
      });
    }
    
    const upload = await OrderUpload.findOne({ 
      _id: uploadId, 
      userId: req.user.id 
    });
    
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    // ✅ FETCH CUSTOMER FROM MASTER
    const customer = await CustomerMaster.findOne({ customerCode }).lean();
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: "Customer not found in master database" 
      });
    }
    
    const sourceRows = upload.extractedData.dataRows;
   const schemes = await SchemeMaster.find({ isActive: true }).lean();
console.log("🔥 SCHEMES FOUND FOR CONVERSION:", schemes.length);

    
    const output = [];
    const errors = [];
    const schemeRows = [];
let totalFreeQty = 0;

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
      
      // ✅ GET BOX PACK FROM MATCHED PRODUCT (FROM MASTER DB)
      const boxPack = row["BOX PACK"] || 0;
      
      // ✅ RECALCULATE PACK: ceil(QTY / BOX PACK)
      const pack = boxPack > 0 ? Math.ceil(qty / boxPack) : 0;
      
      // ✅ APPLY SCHEME (internal only)
     const schemeResult = applyScheme({
  productCode: row.SAPCODE,
  orderQty: qty,
  itemDesc: row.ITEMDESC,
  division: row.DVN,
  schemes
});

      if (schemeResult.schemeApplied) {
  console.log("✅ SCHEME APPLIED", {
    product: row.SAPCODE,
    qty,
    freeQty: schemeResult.freeQty,
    division: row.DVN
  });
}

      console.log(`📦 Row ${idx + 1}: QTY=${qty}, BoxPack=${boxPack}, Pack=${pack}`);
      
      if (schemeResult.schemeApplied) {
  schemeRows.push({
    productCode: row.SAPCODE,
    productName: row.ITEMDESC,
    orderQty: qty,
    freeQty: schemeResult.freeQty || 0,
    schemePercent: schemeResult.schemePercent || 0,
    division: row.DVN || ""
  });

  totalFreeQty += schemeResult.freeQty || 0;
}

output.push({
  CODE: customer.customerCode,
  "CUSTOMER NAME": customer.customerName,
  SAPCODE: row.SAPCODE || "",
  ITEMDESC: row.ITEMDESC,
  ORDERQTY: qty,
  "BOX PACK": boxPack,
  PACK: pack,
  DVN: row.DVN || "",
  _hasScheme: schemeResult.schemeApplied || false
});

    });
    
    if (!output.length) {
      return res.status(400).json({ 
        message: "No valid rows", 
        errors 
      });
    }
    
    // ✅ GENERATE EXCEL
    fs.mkdirSync("uploads", { recursive: true });
    const fileName = `order-training-${upload._id}.xlsx`;
    const filePath = path.join("uploads", fileName);
    
    const wb = XLSX.utils.book_new();
    
    const wsData = output.map(row => {
      const { _hasScheme, ...cleanRow } = row;
      return cleanRow;
    });
    
    const ws = XLSX.utils.json_to_sheet(wsData, { header: TEMPLATE_COLUMNS });
    TEMPLATE_COLUMNS.forEach((_, colIdx) => {
  const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
  if (ws[cellRef]) {
    ws[cellRef].s = headerStyle;
  }
});

    // ✅ YELLOW HIGHLIGHTING FOR SCHEMES
    if (!ws['!rows']) ws['!rows'] = [];
    
output.forEach((row, idx) => {
  const excelRow = idx + 1;

  TEMPLATE_COLUMNS.forEach((col, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({
      r: excelRow,
      c: colIdx
    });

    if (!ws[cellRef]) ws[cellRef] = { v: "" };

    // BASE STYLE
    let style = normalCellStyle;

    // ORDERQTY column always yellow
    if (col === "ORDERQTY") {
      style = qtyCellStyle;
    }

    // SCHEME ROW overrides background but keeps borders
    if (row._hasScheme) {
      style = {
        ...style,
        fill: schemeRowStyle.fill
      };
    }

    ws[cellRef].s = style;
  });
});


    ws["!cols"] = [
  { wch: 14 }, // CODE
  { wch: 28 }, // CUSTOMER NAME
  { wch: 14 }, // SAPCODE
  { wch: 40 }, // ITEMDESC
  { wch: 10 }, // ORDERQTY
  { wch: 10 }, // BOX PACK
  { wch: 10 }, // PACK
  { wch: 10 }  // DVN
];

    XLSX.utils.book_append_sheet(wb, ws, "Order Training");
    XLSX.writeFile(wb, filePath);
    
    // ✅ UPDATE RECORD
    upload.status = "CONVERTED";
    upload.outputFile = fileName;
    upload.recordsProcessed = output.length;
    upload.recordsFailed = errors.length;
   upload.convertedData = {
  rows: output.map(row => ({
    ...row,
    hasScheme: row._hasScheme === true
  }))
};

    upload.customerCode = customer.customerCode;
    upload.customerName = customer.customerName;

    upload.schemeSummary = {
  count: schemeRows.length,
  totalFreeQty
};
console.log("🟡 TOTAL SCHEME ROWS:", schemeRows.length);
console.log("🟡 SCHEME ROWS:", schemeRows);

upload.schemeDetails = schemeRows;

    await upload.save();
    
    console.log(`✅ Converted: ${output.length} rows for ${customer.customerName}`);
    
   res.json({
  success: true,
  status: "CONVERTED",
  uploadId: upload._id,
  recordsProcessed: output.length,
  errors: errors.length,

  schemeSummary: {
    count: schemeRows.length,
    totalFreeQty
  },

  convertedData: output.map(({ _hasScheme, ...row }) => row)
});


    
  } catch (err) {
    console.error('❌ Conversion Error:', err);
    next(err);
  }
};

/* =====================================================
   OTHER ENDPOINTS
===================================================== */
export const getOrderById = async (req, res, next) => {
  try {
    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const schemeDetails = upload.schemeDetails || [];

    const schemeSummary = {
      count: schemeDetails.length,
      totalFreeQty: schemeDetails.reduce(
        (sum, s) => sum + (s.freeQty || 0),
        0
      )
    };

    res.json({
      success: true,
      status: upload.status,
      recordsProcessed: upload.recordsProcessed || 0,
      recordsFailed: upload.recordsFailed || 0,

      errors: upload.rowErrors || [],
      warnings: upload.rowWarnings || [],

      convertedData: upload.convertedData || null,

      // ✅ ALWAYS RETURN
      schemeSummary,
      schemeDetails,

      fileName: upload.fileName,
      outputFile: upload.outputFile,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      _id: upload._id
    });

  } catch (err) {
    next(err);
  }
};



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
