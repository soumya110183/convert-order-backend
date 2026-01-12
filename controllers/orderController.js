/**
 * PRODUCTION CONTROLLER - PHARMA ORDER PROCESSING
 * Enforces strict 8-column template compliance
 */

import OrderUpload from "../models/orderUpload.js";

import XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import fs from "fs";
;
import { getTrainingColumns } from "../services/trainingTemplate.js";
import { normalizeKey } from "../utils/normalizeKey.js";
import { unifiedExtract } from "../services/unifiedParser.js";

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

/* ========================================================================
   EXTRACT ENDPOINT - Always Re-extracts
======================================================================== */

export const extractOrderFields = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded"
      });
    }

    const file = req.file;

    console.log("📦 Processing file:", {
      name: file.originalname,
      type: file.mimetype,
      size: file.size
    });

    const fileHash = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");

    // Extract using unified parser
    const extractionResult = await unifiedExtract(file);

    if (!extractionResult) {
      return res.status(400).json({
        success: false,
        message: "Unsupported file format"
      });
    }

    if (extractionResult.error) {
      return res.status(422).json({
        success: false,
        code: extractionResult.error,
        message: "Extraction failed",
        extractedFields: []
      });
    }

    if (!Array.isArray(extractionResult.dataRows) || 
        extractionResult.dataRows.length === 0) {
      return res.status(422).json({
        success: false,
        code: "EMPTY_EXTRACTION",
        message: "No valid data extracted from file",
        extractedFields: []
      });
    }

    // Find or create upload record
    let upload = await OrderUpload.findOne({
      fileHash,
      userId: req.user.id
    });

    if (!upload) {
      upload = await OrderUpload.create({
        userId: req.user.id,
        userEmail: req.user.email,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileHash,
        status: "EXTRACTED",
        extractedData: extractionResult
      });
    } else {
      // Same file - overwrite
      upload.status = "EXTRACTED";
      upload.extractedData = extractionResult;
      upload.recordsProcessed = 0;
      upload.recordsFailed = 0;
      upload.outputFile = null;
      await upload.save();
    }

    console.log("✅ Extraction successful:", {
      uploadId: upload._id,
      rows: extractionResult.dataRows.length
    });

    res.json({
      success: true,
      uploadId: upload._id,
      extractedFields: extractionResult.extractedFields
    });

  } catch (err) {
    console.error("❌ Extraction error:", err);
    next(err);
  }
};

/* ========================================================================
   CONVERT ENDPOINT - Template Enforcement
======================================================================== */

export const convertOrders = async (req, res, next) => {
  const startTime = Date.now();

  try {
 const { uploadId } = req.body;

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
        message: "Upload not found"
      });
    }

    // Allow re-conversion
    if (upload.status === "CONVERTED") {
      upload.status = "EXTRACTED";
    }

    const { dataRows, meta } = upload.extractedData;

    console.log("🔄 Conversion started:", {
      uploadId,
      rowCount: dataRows.length
    });

    const outputRows = [];
    const rowErrors = [];
    const rowWarnings = [];

    // Process each row - data is already in template format
    dataRows.forEach((row, rowIndex) => {
      // Validate required fields
      if (!row["ITEMDESC"] || row["ITEMDESC"].length < 2) {
        rowErrors.push({
          rowNumber: rowIndex + 2,
          field: "ITEMDESC",
          error: "Missing or invalid item description"
        });
        return;
      }

      if (!row["ORDERQTY"] || row["ORDERQTY"] <= 0 || row["ORDERQTY"] > 10000) {
        rowErrors.push({
          rowNumber: rowIndex + 2,
          field: "ORDERQTY",
          error: "Invalid quantity (must be 1-10000)"
        });
        return;
      }

      // Auto-calculate BOX PACK if possible
      if (!row["BOX PACK"] && row["PACK"] && row["ORDERQTY"]) {
        const calculated = Math.floor(row["ORDERQTY"] / row["PACK"]);
        if (calculated > 0) {
          row["BOX PACK"] = calculated;
          rowWarnings.push({
            rowNumber: rowIndex + 2,
            field: "BOX PACK",
            warning: `Auto-calculated as ${calculated}`,
            newValue: calculated
          });
        }
      }

      // Add validated row
      outputRows.push({
        "CODE": row["CODE"] || "",
        "CUSTOMER NAME": row["CUSTOMER NAME"] || meta.customerName || "UNKNOWN CUSTOMER",
        "SAPCODE": row["SAPCODE"] || "",
        "ITEMDESC": row["ITEMDESC"],
        "ORDERQTY": Number(row["ORDERQTY"]),
        "BOX PACK": Number(row["BOX PACK"]) || 0,
        "PACK": Number(row["PACK"]) || 0,
        "DVN": row["DVN"] || ""
      });
    });

    console.log("📊 Conversion Summary:", {
      totalRows: dataRows.length,
      successfulRows: outputRows.length,
      failedRows: rowErrors.length,
      warnings: rowWarnings.length
    });

    if (!outputRows.length) {
      return res.status(400).json({
        success: false,
        message: "No valid rows after conversion",
        errors: rowErrors
      });
    }

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Convert to array format for Excel
    const excelRows = outputRows.map(row => [
      row["CODE"],
      row["CUSTOMER NAME"],
      row["SAPCODE"],
      row["ITEMDESC"],
      row["ORDERQTY"],
      row["BOX PACK"],
      row["PACK"],
      row["DVN"]
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLUMNS,
      ...excelRows
    ]);

    // Apply professional styling
    styleSheet(sheet, excelRows.length);

    XLSX.utils.book_append_sheet(workbook, sheet, "Order Training");

    // Save file
    fs.mkdirSync("uploads", { recursive: true });
    const fileName = `order-${upload._id}-${Date.now()}.xlsx`;
    const outputPath = path.join("uploads", fileName);
    XLSX.writeFile(workbook, outputPath);

    // Update upload record
    upload.status = "CONVERTED";
    upload.recordsProcessed = outputRows.length;
    upload.recordsFailed = rowErrors.length;
    upload.outputFile = fileName;
    upload.convertedData = {
      headers: TEMPLATE_COLUMNS,
      rows: outputRows
    };
    upload.rowErrors = rowErrors;
    upload.rowWarnings = rowWarnings;
    upload.processingTime = Date.now() - startTime;

    await upload.save();

    console.log("✅ Conversion completed successfully");

    res.json({
      success: true,
      uploadId: upload._id,
      recordsProcessed: outputRows.length,
      recordsFailed: rowErrors.length,
      warnings: rowWarnings.length
    });

  } catch (err) {
    console.error("❌ Conversion error:", err);
    next(err);
  }
};

/* ========================================================================
   EXCEL STYLING - Professional Pharma Format
======================================================================== */

function styleSheet(sheet, dataRowCount) {
  // Set column widths
  sheet["!cols"] = [
    { wch: 10 },  // CODE
    { wch: 30 },  // CUSTOMER NAME
    { wch: 12 },  // SAPCODE
    { wch: 50 },  // ITEMDESC
    { wch: 12 },  // ORDERQTY
    { wch: 12 },  // BOX PACK
    { wch: 10 },  // PACK
    { wch: 15 }   // DVN
  ];

  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Header style
  const headerStyle = {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1F4E79" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "000000" } },
      bottom: { style: "medium", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    }
  };

  // Data cell style
  const cellStyle = {
    font: { sz: 11 },
    alignment: { vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } },
      right: { style: "thin", color: { rgb: "CCCCCC" } }
    }
  };

  // Alternate row style
  const altRowStyle = {
    ...cellStyle,
    fill: { fgColor: { rgb: "F2F2F2" } }
  };

  // Apply styles
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!sheet[ref]) continue;

      if (R === 0) {
        // Header row
        sheet[ref].s = headerStyle;
      } else {
        // Data rows - alternate colors
        sheet[ref].s = (R % 2 === 0) ? cellStyle : altRowStyle;
      }
    }
  }

  // Freeze header row
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Add autofilter
  sheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(range.e.c)}1`
  };

  // Set row heights
  sheet["!rows"] = [{ hpt: 25 }]; // Header row height
}

/* ========================================================================
   OTHER ENDPOINTS
======================================================================== */

export const getOrderHistory = async (req, res) => {
  const { search, status } = req.query;

  const query = { userId: req.user.id };

  if (status && status !== "all") {
    query.status = status;
  }

  if (search) {
    query.fileName = { $regex: search, $options: "i" };
  }

  const history = await OrderUpload.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    success: true,
    history: history.map(item => ({
      id: item._id.toString(), // ✅ Convert ObjectId to string
      fileName: item.fileName,
      uploadDate: new Date(item.createdAt).toLocaleString(), // ✅ Format date
      status: item.status,
      recordsProcessed: item.recordsProcessed || 0,
      recordsFailed: item.recordsFailed || 0,
      outputFile: item.outputFile || null,
      processingTime: item.processingTime || "-"
    }))
  });
};

export const downloadConvertedFile = async (req, res, next) => {
  try {
    console.log("📥 Download request for ID:", req.params.id);
    console.log("👤 User ID:", req.user.id);

    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!upload) {
      console.log("❌ Upload not found");
      return res.status(404).json({
        success: false,
        message: "Order not found or unauthorized",
      });
    }

    console.log("✅ Upload found, status:", upload.status);

    if (upload.status !== "CONVERTED") {
      return res.status(400).json({
        success: false,
        message: `File is not ready for download. Current status: ${upload.status}`,
      });
    }

    // Try to serve the saved file from disk first
    if (upload.outputFile) {
      const filePath = path.join("uploads", upload.outputFile);
      
      if (fs.existsSync(filePath)) {
        console.log("📂 Serving file from disk:", filePath);
        
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${upload.fileName.replace(/\.[^/.]+$/, "")}-converted.xlsx"`
        );
        
        return res.sendFile(path.resolve(filePath));
      }
    }

    // Fallback: regenerate from convertedData if file doesn't exist
    if (!upload.convertedData || !upload.convertedData.rows || upload.convertedData.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No converted data available",
      });
    }

    console.log("🔄 Regenerating Excel file from database");

    const workbook = XLSX.utils.book_new();
    
    const headers = upload.convertedData.headers || [
      "CODE", "CUSTOMER NAME", "SAPCODE", "ITEMDESC", 
      "ORDERQTY", "BOX PACK", "PACK", "DVN"
    ];
    const rows = upload.convertedData.rows;

    // Convert row objects to array format for Excel
    const excelRows = rows.map(row => 
      headers.map(header => row[header] || "")
    );

    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...excelRows
    ]);

    // Set column widths
    sheet["!cols"] = [
      { wch: 10 },  // CODE
      { wch: 30 },  // CUSTOMER NAME
      { wch: 12 },  // SAPCODE
      { wch: 50 },  // ITEMDESC
      { wch: 12 },  // ORDERQTY
      { wch: 12 },  // BOX PACK
      { wch: 10 },  // PACK
      { wch: 15 }   // DVN
    ];

    XLSX.utils.book_append_sheet(workbook, sheet, "Order Training");

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${upload.fileName.replace(/\.[^/.]+$/, "")}-converted.xlsx"`
    );

    // Write directly to response
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.send(buffer);

    console.log("✅ Download completed");

  } catch (err) {
    console.error("❌ Download error:", err);
    next(err);
  }
};


export const getOrderResult = async (req, res) => {
  const upload = await OrderUpload.findOne({
    _id: req.params.id,
    userId: req.user.id
  }).lean();

  if (!upload) {
    return res.status(404).json({
      success: false,
      message: "Result not found"
    });
  }

  res.json({
    success: true,
    status: upload.status,
    recordsProcessed: upload.recordsProcessed || 0,
    recordsFailed: upload.recordsFailed || 0,
    warnings: upload.rowWarnings || [],
    errors: upload.rowErrors || [],
    outputFile: upload.outputFile,
    processingTime: upload.processingTime
  });
};

export const getOrderTemplate = async (_req, res) => {
  try {
    res.json({
      success: true,
      columns: TEMPLATE_COLUMNS
    });
  } catch (err) {
    console.error("Template load error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load training template"
    });
  }
};

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  const order = await OrderUpload.findOne({
    _id: id,
    userId: req.user.id
  }).lean();

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json({
    id: order._id,
    status: order.status,
    recordsProcessed: order.recordsProcessed || 0,
    recordsFailed: order.recordsFailed || 0,
    rowErrors: order.rowErrors || [],
    rowWarnings: order.rowWarnings || [],
    processingTime: order.processingTime || "-",
    outputFile: order.outputFile || null
  });
};