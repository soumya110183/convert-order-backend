/**
 * PRODUCTION CONTROLLER - PHARMA ORDER PROCESSING
 * Fixed: Works with existing schema (no dedupKey field needed)
 */

import OrderUpload from "../models/orderUpload.js";
import XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import MasterOrder from "../models/masterOrder.js";
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
   EXTRACT ENDPOINT - Enhanced Error Handling
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

    // Extract using unified parser with better error context
    let extractionResult;
    try {
      extractionResult = await unifiedExtract(file);
    } catch (parseError) {
      console.error("❌ Parser error:", parseError);
      return res.status(422).json({
        success: false,
        code: "PARSER_ERROR",
        message: "Failed to parse file. Please ensure it's a valid Excel/PDF/Text file with a clear table structure.",
        extractedFields: [],
        hint: "The file should contain columns like: Item/Product Name, Quantity, SAP Code, etc."
      });
    }

    if (!extractionResult) {
      return res.status(400).json({
        success: false,
        code: "UNSUPPORTED_FORMAT",
        message: "Unsupported file format. Please upload Excel (.xlsx, .xls), PDF, or Text files.",
        extractedFields: []
      });
    }

    if (extractionResult.error) {
      const errorMessages = {
        "TABLE_HEADER_NOT_FOUND": "Could not find a valid table header in the file. Please ensure your file has column headers like 'Item Name', 'Quantity', 'Product', etc.",
        "NO_DATA_ROWS": "No data rows found in the file. The file appears to be empty.",
        "EMPTY_FILE": "The uploaded file is empty or corrupted.",
        "PDF_EXTRACTION_FAILED": "Failed to extract text from PDF. The PDF might be scanned or image-based.",
        "EXCEL_EXTRACTION_FAILED": "Failed to read Excel file. The file might be corrupted.",
        "TXT_EXTRACTION_FAILED": "Failed to read text file. The file might be corrupted or in an unsupported encoding."
      };

      return res.status(422).json({
        success: false,
        code: extractionResult.error,
        message: errorMessages[extractionResult.error] || "Extraction failed",
        extractedFields: [],
        hint: "Try: 1) Ensure the file has clear column headers, 2) Check if data is in a table format, 3) For PDFs, ensure text is selectable (not scanned images)"
      });
    }

    if (!Array.isArray(extractionResult.dataRows) || 
        extractionResult.dataRows.length === 0) {
      return res.status(422).json({
        success: false,
        code: "EMPTY_EXTRACTION",
        message: "No valid data extracted from file. Please check your file format and data structure.",
        extractedFields: [],
        hint: "Make sure your file contains: 1) A clear header row, 2) At least one data row, 3) Item descriptions and quantities"
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
   CONVERT ENDPOINT - Fixed Deduplication (Uses Existing Index)
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
    upload.processingTimeMs = Date.now() - startTime;

    await upload.save();

    console.log("✅ Conversion completed successfully");

    // ===============================
    // DEDUPLICATE WITHIN SAME UPLOAD
    // ===============================
    const dedupedMap = new Map();

    for (const row of outputRows) {
      // Create a normalized key for deduplication
      const key = `${String(row["CUSTOMER NAME"]).toLowerCase().trim()}||${String(row["ITEMDESC"]).toLowerCase().trim()}`;

      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, { ...row });
      } else {
        // Merge quantities for duplicates
        dedupedMap.get(key).ORDERQTY += row["ORDERQTY"];
      }
    }

    const dedupedRows = Array.from(dedupedMap.values());

    console.log(`📝 Updating master database with ${dedupedRows.length} deduplicated rows...`);

    // ===============================
    // UPDATE MASTER DATABASE
    // Using existing unique index on (customerName, itemdesc)
    // ===============================
    let masterUpdates = 0;
    let masterErrors = 0;

    for (const row of dedupedRows) {
      const customerName = String(row["CUSTOMER NAME"] || "").trim();
      const itemdesc = String(row["ITEMDESC"] || "").trim();

      if (!customerName || !itemdesc) {
        console.warn("⚠️ Skipping row with empty customer name or item description");
        continue;
      }

      try {
        const result = await MasterOrder.updateOne(
          {
            customerName: customerName,
            itemdesc: itemdesc,
          },
          {
            $setOnInsert: {
              customerName: customerName,
              itemdesc: itemdesc,
              code: row["CODE"] || "",
              sapcode: row["SAPCODE"] || "",
              dvn: row["DVN"] || "",
              pack: row["PACK"] || 0,
              boxPack: row["BOX PACK"] || 0,
              uploadCount: 0, // Will be incremented below
              orderqty: 0, // Will be incremented below
              sourceUploads: [],
              lastUpdatedAt: new Date(),
            },
            $inc: {
              orderqty: row["ORDERQTY"],
              uploadCount: 1,
            },
            $addToSet: {
              sourceUploads: upload._id,
            },
            $set: {
              lastUploadId: upload._id,
              lastUpdatedAt: new Date(),
            },
          },
          { upsert: true }
        );

        masterUpdates++;

        if (masterUpdates % 50 === 0) {
          console.log(`📝 Updated ${masterUpdates}/${dedupedRows.length} master records...`);
        }

      } catch (dbError) {
        masterErrors++;
        console.error("❌ Master update error:", {
          customerName,
          itemdesc,
          error: dbError.message,
          code: dbError.code
        });

        // Handle duplicate key errors gracefully
        if (dbError.code === 11000) {
          console.warn(`⚠️ Duplicate detected, attempting merge...`);
          
          try {
            // Try a simple increment instead
            await MasterOrder.updateOne(
              { customerName, itemdesc },
              {
                $inc: {
                  orderqty: row["ORDERQTY"],
                  uploadCount: 1,
                },
                $addToSet: {
                  sourceUploads: upload._id,
                },
                $set: {
                  lastUploadId: upload._id,
                  lastUpdatedAt: new Date(),
                },
              }
            );
            console.log("✅ Merged successfully");
            masterUpdates++;
          } catch (retryError) {
            console.error("❌ Merge failed:", retryError.message);
            rowWarnings.push({
              field: "DATABASE",
              warning: `Failed to update master for: ${itemdesc}`,
              error: retryError.message
            });
          }
        } else {
          // Non-duplicate errors
          rowWarnings.push({
            field: "DATABASE",
            warning: `Failed to update master database for: ${itemdesc}`,
            error: dbError.message
          });
        }
      }
    }

    console.log(`✅ Master database updated: ${masterUpdates} records, ${masterErrors} errors`);

    res.json({
      success: true,
      uploadId: upload._id,
      recordsProcessed: outputRows.length,
      recordsFailed: rowErrors.length,
      warnings: rowWarnings.length,
      masterRecordsUpdated: masterUpdates
    });

  } catch (err) {
    console.error("❌ Conversion error:", err);
    
    // Provide helpful error message
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate entry detected in database",
        hint: "This might be caused by concurrent uploads. Please try again.",
        error: err.message
      });
    }
    
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
        sheet[ref].s = headerStyle;
      } else {
        sheet[ref].s = (R % 2 === 0) ? cellStyle : altRowStyle;
      }
    }
  }

  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  sheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(range.e.c)}1`
  };
  sheet["!rows"] = [{ hpt: 25 }];
}

/* ========================================================================
   OTHER ENDPOINTS
======================================================================== */

export const getOrderHistory = async (req, res) => {
  try {
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
        id: item._id.toString(),
        fileName: item.fileName,
        uploadDate: item.createdAt,
        status: item.status,
        recordsProcessed: item.recordsProcessed || 0,
        recordsFailed: item.recordsFailed || 0,
        outputFile: item.outputFile || null,
        processingTime: item.processingTimeMs || null
      }))
    });
  } catch (err) {
    console.error("❌ History error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load history"
    });
  }
};

export const downloadConvertedFile = async (req, res, next) => {
  try {
    console.log("📥 Download request for ID:", req.params.id);

    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Order not found or unauthorized",
      });
    }

    if (upload.status !== "CONVERTED") {
      return res.status(400).json({
        success: false,
        message: `File is not ready for download. Current status: ${upload.status}`,
      });
    }

    if (upload.outputFile) {
      const filePath = path.join("uploads", upload.outputFile);
      
      if (fs.existsSync(filePath)) {
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

    // Fallback: regenerate from convertedData
    if (!upload.convertedData || !upload.convertedData.rows || upload.convertedData.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No converted data available",
      });
    }

    const workbook = XLSX.utils.book_new();
    
    const headers = upload.convertedData.headers || TEMPLATE_COLUMNS;
    const rows = upload.convertedData.rows;

    const excelRows = rows.map(row => 
      headers.map(header => row[header] || "")
    );

    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...excelRows
    ]);

    sheet["!cols"] = [
      { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 50 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, sheet, "Order Training");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${upload.fileName.replace(/\.[^/.]+$/, "")}-converted.xlsx"`
    );

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.send(buffer);

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
      processingTime: upload.processingTimeMs
    });
  } catch (err) {
    console.error("❌ Result error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load result"
    });
  }
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
  try {
    const { id } = req.params;

    const order = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    }).lean();

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: "Order not found" 
      });
    }

    res.json({
      success: true,
      id: order._id,
      status: order.status,
      recordsProcessed: order.recordsProcessed || 0,
      recordsFailed: order.recordsFailed || 0,
      rowErrors: order.rowErrors || [],
      rowWarnings: order.rowWarnings || [],
      processingTime: order.processingTimeMs || null,
      outputFile: order.outputFile || null
    });
  } catch (err) {
    console.error("❌ Get order error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load order"
    });
  }
};