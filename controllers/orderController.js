/**
 * PRODUCTION CONTROLLER v3.0 - BUSINESS RULES ALIGNED
 * - Customer Aggregation
 * - Box Pack Rounding
 * - No MasterOrder Persistence
 */

import OrderUpload from "../models/orderUpload.js";
import CustomerMaster from "../models/customerMaster.js"; // Updated import
import XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { unifiedExtract } from "../services/unifiedParser.js";

const TEMPLATE_COLUMNS = [
  "CODE", "CUSTOMER NAME", "SAPCODE", "ITEMDESC",
  "ORDERQTY", "BOX PACK", "PACK", "DVN"
];

/* ========================================================================
   ENHANCED UTILITIES
======================================================================== */

function extractPackSize(desc) {
  if (!desc) return 0;
  
  const patterns = [
    { regex: /\((\d+)['"`\s]*(?:S|TAB|CAP|ML|GM|MG)\)/gi, priority: 10 },
    { regex: /\b(\d+)['"`\s]*S\b/gi, priority: 9 },
    { regex: /\bX\s*(\d+)\b/gi, priority: 8 },
    { regex: /\*(\d+)\b/g, priority: 7 },
    { regex: /\b(\d+)\s*(?:TABS?|TABLETS?)\b/gi, priority: 6 },
    { regex: /\b(\d+)\s*(?:CAPS?|CAPSULES?)\b/gi, priority: 6 },
    { regex: /\/(\d+)\b/g, priority: 5 },
    { regex: /\b(\d+)\s*(?:ML|GM?|MG|MCG)\b/gi, priority: 4 },
  ];
  
  const matches = [];
  
  for (const { regex, priority } of patterns) {
    const pattern = new RegExp(regex.source, regex.flags);
    let match;
    
    while ((match = pattern.exec(desc)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 2000) {
        matches.push({ value: num, priority });
      }
    }
  }
  
  if (!matches.length) return 0;
  
  // Sort by priority
  matches.sort((a, b) => b.priority - a.priority);
  
  const topPriority = matches[0].priority;
  const topMatches = matches.filter(m => m.priority === topPriority);
  
  // Get most frequent
  const freq = {};
  topMatches.forEach(m => freq[m.value] = (freq[m.value] || 0) + 1);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  
  return parseInt(sorted[0][0], 10);
}

function calcBoxPack(qty, pack) {
  if (!qty || !pack || pack === 0) return 0;
  // RULE 4: Always round to nearest integer using Math.round()
  return Math.round(qty / pack);
}

function validateRow(row, idx) {
  const errors = [];
  const warnings = [];
  
  // Validate ITEMDESC
  if (!row.ITEMDESC || row.ITEMDESC.length < 2) {
    errors.push({
      row: idx + 2,
      field: "ITEMDESC",
      message: "Missing or invalid item description"
    });
    return { row, errors, warnings };
  }
  
  // Validate ORDERQTY
  const qty = Number(row.ORDERQTY);
  if (!qty || qty <= 0 || qty > 100000) {
    errors.push({
      row: idx + 2,
      field: "ORDERQTY",
      message: `Invalid quantity: ${row.ORDERQTY}`
    });
    return { row, errors, warnings };
  }
  
  // Extract/validate PACK
  let pack = Number(row.PACK) || 0;
  if (pack === 0) {
    pack = extractPackSize(row.ITEMDESC);
    if (pack > 0) {
      row.PACK = pack;
      warnings.push({
        row: idx + 2,
        field: "PACK",
        message: `Auto-extracted pack size: ${pack}`
      });
    } else {
      warnings.push({
        row: idx + 2,
        field: "PACK",
        message: "Could not determine pack size"
      });
    }
  }
  
  // Validate/calculate BOX PACK
  let box = Number(row["BOX PACK"]) || 0;
  if (pack > 0 && qty > 0) {
    const expected = calcBoxPack(qty, pack);
    if (box !== expected) {
      const oldBox = box;
      row["BOX PACK"] = expected;
      
      if (oldBox > 0 && Math.abs(oldBox - expected) > 1) {
        warnings.push({
          row: idx + 2,
          field: "BOX PACK",
          message: `Corrected: ${expected} (was ${oldBox})`
        });
      } else if (oldBox === 0) {
        warnings.push({
          row: idx + 2,
          field: "BOX PACK",
          message: `Calculated: ${expected}`
        });
      }
    }
  }
  
  // Validate CUSTOMER NAME
  if (!row["CUSTOMER NAME"] || row["CUSTOMER NAME"] === "UNKNOWN CUSTOMER") {
    warnings.push({
      row: idx + 2,
      field: "CUSTOMER NAME",
      message: "Customer name not identified"
    });
  }
  
  // Validate CODE and SAPCODE (shouldn't be identical)
  if (row.CODE && row.SAPCODE && row.CODE === row.SAPCODE) {
    warnings.push({
      row: idx + 2,
      field: "SAPCODE",
      message: "SAP code same as item code - check if correct"
    });
  }
  
  return { row, errors, warnings };
}

function styleExcelSheet(sheet) {
  sheet["!cols"] = [
    { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 50 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
  ];
  
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  
  const headerStyle = {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1F4E79" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "medium" },
      bottom: { style: "medium" },
      left: { style: "thin" },
      right: { style: "thin" }
    }
  };
  
  const cellStyle = {
    font: { sz: 11 },
    alignment: { vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } },
      right: { style: "thin", color: { rgb: "CCCCCC" } }
    }
  };
  
  const altStyle = {
    ...cellStyle,
    fill: { fgColor: { rgb: "F2F2F2" } }
  };
  
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!sheet[ref]) continue;
      
      sheet[ref].s = R === 0 ? headerStyle : (R % 2 === 0 ? cellStyle : altStyle);
    }
  }
  
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  sheet["!autofilter"] = { ref: `A1:H1` };
  sheet["!rows"] = [{ hpt: 25 }];
}

/* ========================================================================
   EXTRACT ENDPOINT
======================================================================== */

export const extractOrderFields = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }
    
    const file = req.file;
    console.log(`📦 Processing: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
    
    const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    
    // Extract data
    let result;
    try {
      result = await unifiedExtract(file);
    } catch (err) {
      console.error("❌ Parser error:", err);
      return res.status(422).json({
        success: false,
        message: "Failed to parse file. Please check file format and try again.",
        error: "PARSER_ERROR",
        details: err.message
      });
    }
    
    if (!result || result.error) {
      const errorMsgs = {
        PDF_EXTRACTION_FAILED: "Failed to extract text from PDF. File may be corrupted or image-based.",
        EXCEL_EXTRACTION_FAILED: "Failed to read Excel file. Check if file is valid .xls/.xlsx format.",
        TXT_EXTRACTION_FAILED: "Failed to read text file. Check file encoding.",
        EMPTY_FILE: "File contains no data or is empty.",
        UNSUPPORTED_FORMAT: "File format not supported. Please upload PDF, Excel, or Text files."
      };
      
      return res.status(422).json({
        success: false,
        message: errorMsgs[result.error] || "Extraction failed",
        error: result.error
      });
    }
    
    if (!result.dataRows || result.dataRows.length === 0) {
      return res.status(422).json({
        success: false,
        message: "No order data found in file. Please check if file contains valid order information.",
        error: "NO_DATA"
      });
    }
    
    // Save or update upload record
    let upload = await OrderUpload.findOne({ fileHash, userId: req.user.id });
    
    if (!upload) {
      upload = await OrderUpload.create({
        userId: req.user.id,
        userEmail: req.user.email,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileHash,
        status: "EXTRACTED",
        extractedData: result
      });
      console.log(`✅ New upload created: ${upload._id}`);
    } else {
      upload.status = "EXTRACTED";
      upload.extractedData = result;
      upload.recordsProcessed = 0;
      upload.recordsFailed = 0;
      upload.outputFile = null;
      upload.rowErrors = [];
      upload.rowWarnings = [];
      await upload.save();
      console.log(`✅ Upload updated: ${upload._id}`);
    }
    
    console.log(`✅ Extracted ${result.dataRows.length} rows from ${file.originalname}`);
    
    res.json({
      success: true,
      uploadId: upload._id,
      extractedFields: result.extractedFields,
      dataRows: result.dataRows,
      rowCount: result.dataRows.length,
      customerName: result.meta?.customerName || "UNKNOWN"
    });
    
  } catch (err) {
    console.error("❌ Extract endpoint error:", err);
    next(err);
  }
};

/* ========================================================================
   CONVERT ENDPOINT
   ======================================================================== */

export const convertOrders = async (req, res, next) => {
  const { uploadId, editedRows } = req.body;
  const start = Date.now();
  
  try {
    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: "uploadId is required"
      });
    }
    
    const upload = await OrderUpload.findOne({
      _id: uploadId,
      userId: req.user.id
    });
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found or you don't have permission to access it"
      });
    }
    
    const { meta } = upload.extractedData;
    const sourceRows = Array.isArray(editedRows) && editedRows.length > 0
      ? editedRows
      : upload.extractedData.dataRows;
    
    console.log(`🔄 Converting ${sourceRows.length} rows for upload ${uploadId}...`);
    
    const output = [];
    const allErrors = [];
    const allWarnings = [];
    
    // Aggregation Map: CustomerName -> { code, quantity }
    const customerAggregation = new Map();

    // Validate and enrich each row
    const fallbackCustomerName = meta?.customerName || "UNKNOWN CUSTOMER";

    for (let idx = 0; idx < sourceRows.length; idx++) {
      const row = sourceRows[idx];
      const { row: validated, errors, warnings } = validateRow(row, idx);
      
      if (errors.length > 0) {
        allErrors.push(...errors);
        console.log(`❌ Row ${idx + 2} validation failed:`, errors[0].message);
        continue; // Skip validation failed rows
      }
      
      if (warnings.length > 0) {
        allWarnings.push(...warnings);
      }
      
      // Effective Customer Name
      const custName = validated["CUSTOMER NAME"] || fallbackCustomerName;
      const custCode = validated.CODE || "";

      // Aggregate Logic
      const orderQty = Number(validated.ORDERQTY);
      if (customerAggregation.has(custName)) {
        const entry = customerAggregation.get(custName);
        entry.quantity += orderQty;
        if (!entry.code && custCode) entry.code = custCode; // Capture code if missing
      } else {
        customerAggregation.set(custName, {
          code: custCode,
          quantity: orderQty
        });
      }
      
      output.push({
        "CODE": custCode,
        "CUSTOMER NAME": custName,
        "SAPCODE": validated.SAPCODE || "",
        "ITEMDESC": validated.ITEMDESC,
        "ORDERQTY": orderQty,
        "BOX PACK": Number(validated["BOX PACK"]) || 0,
        "PACK": Number(validated.PACK) || 0,
        "DVN": validated.DVN || ""
      });
    }
    
    console.log(`📊 Validation complete: ${output.length} valid, ${allErrors.length} errors, ${allWarnings.length} warnings`);
    
    if (output.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid rows after validation. Please check errors and try again.",
        errors: allErrors
      });
    }
    
    // ---------------------------------------------------------
    // RULE 3 & 5: AGGREGATE UPDATE to CustomerMaster
    // ---------------------------------------------------------
    const bulkOps = [];
    for (const [name, data] of customerAggregation) {
      // If code is missing, we use name as fallback for search, but creation requires code?
      // Rule says: "Order quantity must be added to the correct customer using: customerCode (preferred), fallback to customerName"
      // "If customer does not exist: auto-create customer with available data."

      // If we don't have a code, we can't strictly enforce unique customerCode efficiently without generating one.
      // Assuming for now if code is missing, we skip or use a placeholder? 
      // Actually, let's try to find by Name if Code is missing.
      
      const filter = {};
      if (data.code) {
        filter.customerCode = data.code;
      } else {
        filter.customerName = name;
      }

      const update = { 
        $inc: { totalOrderQty: data.quantity },
        $setOnInsert: { 
          customerName: name,
          // If creating new and we have a code, use it. If not, we might fail/warn?
          // Let's assume we use what we have. If code is missing, it might violate unique constraint if we use empty string.
          // We will set customerCode to Name if missing to prevent error, or generate a hash.
          customerCode: data.code || `AUTO-${crypto.randomBytes(4).toString('hex').toUpperCase()}` 
        }
      };
      
      // If we found by code, we might want to ensure name is set if missing in DB? Not strictly required by update logic.
      
      bulkOps.push({
        updateOne: {
          filter,
          update,
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      console.log(`💾 Updating ${bulkOps.length} customers in Master...`);
      await CustomerMaster.bulkWrite(bulkOps);
    }

    // ---------------------------------------------------------
    // EXCEL GENERATION (Display Logic)
    // ---------------------------------------------------------
    const wb = XLSX.utils.book_new();
    const excelRows = output.map(r => [
      r.CODE, r["CUSTOMER NAME"], r.SAPCODE, r.ITEMDESC,
      r.ORDERQTY, r["BOX PACK"], r.PACK, r.DVN
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, ...excelRows]);
    styleExcelSheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Order Training");
    
    // Save file
    fs.mkdirSync("uploads", { recursive: true });
    const fileName = `order-${upload._id}-${Date.now()}.xlsx`;
    const filePath = path.join("uploads", fileName);
    XLSX.writeFile(wb, filePath);
    
    console.log(`💾 Excel file saved: ${fileName}`);
    
    // Update upload record
    upload.status = "CONVERTED";
    upload.recordsProcessed = output.length;
    upload.recordsFailed = allErrors.length;
    upload.outputFile = fileName;
    upload.convertedData = { headers: TEMPLATE_COLUMNS, rows: output };
    upload.rowErrors = allErrors;
    upload.rowWarnings = allWarnings;
    upload.processingTimeMs = Date.now() - start;
    await upload.save();
    
    console.log(`✅ Conversion complete in ${upload.processingTimeMs}ms`);
    
    res.json({
      success: true,
      uploadId: upload._id,
      recordsProcessed: output.length,
      recordsFailed: allErrors.length,
      warnings: allWarnings.length,
      processingTime: upload.processingTimeMs
    });
    
  } catch (err) {
    console.error("❌ Convert endpoint error:", err);
    next(err);
  }
};

/* ========================================================================
   MASTER DATABASE UPDATE (Atomic, Deduplicated)
======================================================================== */


/* ========================================================================
   EXPORT ALL DATA (Admin) - DELETED (Moved to adminController or removed if deprecated)
   ======================================================================== */
// function exportAllConvertedData removed as it relied on MasterOrder.
// New export logic for CustomerMaster should be in adminController.

/* ========================================================================
   OTHER ENDPOINTS
======================================================================== */

export const getOrderHistory = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = { userId: req.user.id };
    
    if (status && status !== "all") query.status = status;
    if (search) query.fileName = { $regex: search, $options: "i" };
    
    const history = await OrderUpload.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    res.json({
      success: true,
      history: history.map(h => ({
        id: h._id.toString(),
        fileName: h.fileName,
        uploadDate: h.createdAt,
        status: h.status,
        recordsProcessed: h.recordsProcessed || 0,
        recordsFailed: h.recordsFailed || 0,
        outputFile: h.outputFile,
        processingTime: h.processingTimeMs
      }))
    });
  } catch (err) {
    console.error("❌ History error:", err);
    res.status(500).json({ success: false, message: "Failed to load history" });
  }
};

export const downloadConvertedFile = async (req, res, next) => {
  try {
    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }
    
    if (upload.status !== "CONVERTED") {
      return res.status(400).json({ message: `File not ready. Status: ${upload.status}` });
    }
    
    // Try to serve existing file
    if (upload.outputFile) {
      const fp = path.join("uploads", upload.outputFile);
      
      if (fs.existsSync(fp)) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${upload.fileName.replace(/\.[^.]+$/, "")}-converted.xlsx"`);
        return res.sendFile(path.resolve(fp));
      }
    }
    
    // Fallback: regenerate from stored data
    if (!upload.convertedData?.rows) {
      return res.status(404).json({ message: "No converted data available" });
    }
    
    const wb = XLSX.utils.book_new();
    const rows = upload.convertedData.rows;
    const excelRows = rows.map(r => [
      r.CODE, r["CUSTOMER NAME"], r.SAPCODE, r.ITEMDESC,
      r.ORDERQTY, r["BOX PACK"], r.PACK, r.DVN
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, ...excelRows]);
    styleExcelSheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Order Training");
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${upload.fileName.replace(/\.[^.]+$/, "")}-converted.xlsx"`);
    
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.send(buf);
    
  } catch (err) {
    console.error("❌ Download error:", err);
    next(err);
  }
};

export const getOrderResult = async (req, res) => {
  try {
    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();
    
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }
    
    res.json({
      success: true,
      status: upload.status,
      recordsProcessed: upload.recordsProcessed || 0,
      recordsFailed: upload.recordsFailed || 0,
      warnings: upload.rowWarnings || [],
      errors: upload.rowErrors || [],
      outputFile: upload.outputFile,
      processingTime: upload.processingTimeMs
    });
  } catch (err) {
    console.error("❌ Result error:", err);
    res.status(500).json({ message: "Failed to fetch result" });
  }
};

export const getOrderTemplate = async (_req, res) => {
  try {
    res.json({ success: true, columns: TEMPLATE_COLUMNS });
  } catch (err) {
    console.error("❌ Template error:", err);
    res.status(500).json({ message: "Failed to get template" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    res.json({
      success: true,
      id: order._id,
      status: order.status,
      recordsProcessed: order.recordsProcessed || 0,
      recordsFailed: order.recordsFailed || 0,
      rowErrors: order.rowErrors || [],
      rowWarnings: order.rowWarnings || [],
      processingTime: order.processingTimeMs,
      outputFile: order.outputFile
    });
  } catch (err) {
    console.error("❌ Get order error:", err);
    res.status(500).json({ message: "Failed to get order details" });
  }
};

export const getMasterStats = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    // Using new models for stats
    const [totalCustomers, totalProducts] = await Promise.all([
      CustomerMaster.countDocuments(),
      // Assuming product master is populated. If not, this might be 0 initially.
      // If we want stats from audit logs, we'd query OrderUpload, but requirement implies looking at Masters.
      mongoose.models.ProductMaster ? mongoose.models.ProductMaster.countDocuments() : 0
    ]);
    
    // Total Quantity from Customer Master aggregation
    const qtyResult = await CustomerMaster.aggregate([
      { $group: { _id: null, total: { $sum: "$totalOrderQty" } } }
    ]);
    const totalQuantity = qtyResult[0]?.total || 0;

    res.json({
      success: true,
      stats: { 
        totalCustomers, 
        totalProducts, 
        totalQuantity 
      }
    });
  } catch (err) {
    console.error("❌ Stats error:", err);
    res.status(500).json({ message: "Failed to get statistics" });
  }
};