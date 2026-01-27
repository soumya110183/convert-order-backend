/**
 * USER DOWNLOAD CONTROLLER – PRODUCTION SAFE
 * ------------------------------------------
 * RULES:
 * - Users download ONLY their generated files
 * - NO master DB access
 * - NO MasterOrder usage
 */

import OrderUpload from "../models/orderUpload.js";
import XLSX from "xlsx-js-style";

import path from "path";
import fs from "fs";

/* =====================================================
   EXCEL STYLING (MATCHING ORDER CONTROLLER)
===================================================== */

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "8B0000" } },
  alignment: { vertical: "center", horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const normalCellStyle = {
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const schemeRowStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },   // Yellow
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const qtyCellStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFF99" } },
  alignment: { horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

/* =====================================================
   DOWNLOAD CONVERTED FILE
   GET /api/orders/download/:uploadId
===================================================== */
export async function downloadConvertedFile(req, res, next) {
  try {
    const { id, type } = req.params;

    console.log(`\n📥 DOWNLOAD REQUEST: ID=${id}, TYPE=${type || 'N/A'}`);
    console.log(`   User: ${req.user?._id} (${req.user?.role})`);

    // 🔥 REFACTOR: Fetch first, then check permissions (cleaner debug)
    const upload = await OrderUpload.findById(id);

    if (!upload) {
      console.warn("❌ Upload not found in DB");
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    // Auth check
    if (req.user.role !== "admin" && upload.userId.toString() !== req.user.id) {
      console.warn("❌ Authorization failed");
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this file"
      });
    }

    if (upload.status !== "CONVERTED") {
      return res.status(400).json({
        success: false,
        message: `File not ready (status: ${upload.status})`
      });
    }

    let fileName = upload.outputFile;
    console.log(`   Initial fileName: ${fileName}`);
    console.log(`   OutputFiles: ${JSON.stringify(upload.outputFiles)}`);
    
    // Handle specific file types
    if (type && upload.outputFiles && upload.outputFiles.length > 0) {
      if (type === 'sheets') {
        // Convention: First file is sheets
        fileName = upload.outputFiles.find(f => f.startsWith('sheet-orders')) || upload.outputFiles[0];
      } else if (type === 'main') {
        // Convention: Second file is main/standard
        // 🔥 FIX: If only 1 file exists (no sheets), use that as "main" as well
        fileName = upload.outputFiles.find(f => f.startsWith('main-order')) || (upload.outputFiles.length > 1 ? upload.outputFiles[1] : upload.outputFiles[0]);
      }
    }

    console.log(`   Resolved fileName: ${fileName}`);

    if (!fileName) {
      console.warn("❌ Filename could not be resolved");
      return res.status(404).json({
        success: false,
        message: "Converted file missing"
      });
    }

    const filePath = path.resolve("uploads", fileName);
    const exists = fs.existsSync(filePath);
    console.log(`   FilePath: ${filePath}`);
    console.log(`   Exists: ${exists}`);

    if (!exists) {
      console.warn("⚠️ File missing from disk even though DB says it exists. Attempting to regenerate...");
      
      try {
        if (!upload.convertedData || !upload.convertedData.rows || upload.convertedData.rows.length === 0) {
           throw new Error("No converted data available to regenerate file");
        }

        // Dynamically import generator
        const { generateOrderExcel, saveWorkBook } = await import("../utils/excelGenerator.js");
        const wb = generateOrderExcel(upload.convertedData.rows, "Converted Orders");
        saveWorkBook(wb, fileName);
        
        console.log("✅ File regenerated successfully!");
        
        // Re-check existence
         if (!fs.existsSync(filePath)) {
             throw new Error("Regeneration failed to save file to expected path");
        }

      } catch (regenError) {
        console.error("❌ Regeneration failed:", regenError);
        return res.status(404).json({
          success: false,
          message: "File not found on server and could not be regenerated"
        });
      }
    }

    return res.download(
      filePath,
      fileName // Use actual filename
    );

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   PREVIEW CONVERTED DATA
   GET /api/orders/preview/:id
===================================================== */
export async function previewConvertedOrders(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const query = { _id: req.params.id };
    if (req.user.role !== "admin") {
      query.userId = req.user.id;
    }

    const upload = await OrderUpload.findOne(query).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (!upload.convertedData?.rows?.length) {
      return res.json({
        success: true,
        data: [],
        headers: upload.convertedData?.headers || [],
        total: 0
      });
    }

    const total = upload.convertedData.rows.length;
    const data = upload.convertedData.rows.slice(skip, skip + limit);

    res.json({
      success: true,
      data,
      headers: upload.convertedData.headers || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    next(err);
  }
}

export async function downloadSchemeFile(req, res, next) {
  try {
    const { id } = req.params;

    const upload = await OrderUpload.findById(id).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (req.user.role !== "admin" && upload.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    const schemeDetails = (upload.schemeDetails || []).map(s => ({
      "Product Code": s.productCode,
      "Product Name": s.productName,
      "Order Qty": s.orderQty,
      "Free Qty": s.freeQty,
      "Scheme %": s.schemePercent,
      "Division": s.division
    }));

    if (schemeDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No scheme details found for this order"
      });
    }

    // Generate Excel
    const wb = XLSX.utils.book_new();
    const headers = ["Product Code", "Product Name", "Order Qty", "Free Qty", "Scheme %", "Division"];
    
    const ws = XLSX.utils.json_to_sheet(schemeDetails, { header: headers });

    // 🎨 APPLY STYLING
    
    // 1. Style Headers
    headers.forEach((_, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (!ws[cellRef]) return;
      ws[cellRef].s = headerStyle;
    });

    // 2. Style Rows (All rows are schemes, so apply scheme style or normal style?)
    // User requested "exact format... with that colouring". 
    // In main file, schemes are YELLOW. Since this is a SCHEME summary, let's make them light yellow or just normal with borders.
    // Let's go with normal borders for readability, but maybe highlight the header distinctively.
    // Actually, user said "exact format... with that colouring". 
    // I will apply normal borders to all, and maybe standard font.
    
    schemeDetails.forEach((row, idx) => {
      const excelRow = idx + 1;
      headers.forEach((colName, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
        if (!ws[cellRef]) ws[cellRef] = { v: "" }; 
        
        let style = normalCellStyle;
        
        // Use center alignment for quantity columns
        if (colName === "Order Qty" || colName === "Free Qty" || colName === "Scheme %") {
             style = qtyCellStyle;
        }
        
        // Apply Yellow Fill to EVERYTHING in scheme summary (as it contains only scheme rows)
        style = {
             ...style, 
             fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } }
        };

        ws[cellRef].s = style; 
      });
    });

    // 3. Set Column Widths
    ws["!cols"] = [
      { wch: 15 }, // Code
      { wch: 40 }, // Name
      { wch: 10 }, // Order Qty
      { wch: 10 }, // Free Qty
      { wch: 10 }, // Scheme %
      { wch: 15 }  // Division
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Scheme Summary");

    // Use original filename base + -scheme-summary
    const originalName = upload.fileName.replace(/\.[^.]+$/, "");
    const fileName = `${originalName}-scheme-summary.xlsx`;

    const buffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx"
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${fileName}`
    );

    res.send(buffer);

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   PREVIEW SCHEME DATA
   GET /api/orders/preview-scheme/:id
===================================================== */
export async function previewSchemeData(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const upload = await OrderUpload.findById(req.params.id).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (req.user.role !== "admin" && upload.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (!upload.schemeDetails?.length) {
      return res.json({
        success: true,
        data: [],
        total: 0
      });
    }

    const total = upload.schemeDetails.length;
    const data = upload.schemeDetails.slice(skip, skip + limit);

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   UPDATE CONVERTED DATA (WITH SCHEME RECALCULATION)
   PUT /api/orders/converted-data/:id
===================================================== */
export async function updateConvertedData(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        message: "Invalid data format. Expected array of rows."
      });
    }

    const upload = await OrderUpload.findById(id);

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (req.user.role !== "admin" && upload.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    // Validate rows
    const requiredFields = ["CODE", "CUSTOMER NAME", "ITEMDESC", "ORDERQTY"];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const field of requiredFields) {
        if (!row[field] && row[field] !== 0) {
          return res.status(400).json({
            success: false,
            message: `Row ${i + 1}: Missing required field "${field}"`
          });
        }
      }

      // Validate ORDERQTY is numeric
      if (isNaN(Number(row.ORDERQTY))) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 1}: ORDERQTY must be a number`
        });
      }
    }

    // 🔥 RECALCULATE SCHEMES BASED ON NEW ORDERQTY VALUES
    // Import scheme calculation function dynamically
    const { applyScheme } = await import("../services/schemeMatcher.js");
    const SchemeMaster = (await import("../models/schemeMaster.js")).default;
    
    // Fetch all schemes from database
    const allSchemes = await SchemeMaster.find({ isActive: true }).lean();
    
    // Recalculate scheme details
    const updatedSchemeDetails = [];
    
    for (const row of rows) {
      const productCode = row.SAPCODE || row.CODE || "";
      const orderQty = Number(row.ORDERQTY) || 0;
      const division = row.DVN || row.DIVISION || "";
      // Trust frontend data
      const itemDesc = row.ITEMDESC || "";
      
      // Apply scheme using the existing logic
      const schemeResult = applyScheme({
        productCode,
        orderQty,
        itemDesc,
        division,
        customerCode: row.CODE || "",
        schemes: allSchemes
      });
      
      if (schemeResult.schemeApplied) {
        updatedSchemeDetails.push({
          productCode,
          productName: itemDesc,
          orderQty,
          freeQty: schemeResult.freeQty,
          schemePercent: schemeResult.schemePercent,
          division,
          baseRatio: schemeResult.baseRatio,
          calculation: schemeResult.calculation
        });
        // 🔥 Mark row for styling
        row._hasScheme = true;
      } else {
        row._hasScheme = false;
      }
    }

    // Update converted data
    upload.convertedData.rows = rows;
    
    // 🔥 Update scheme details
    upload.schemeDetails = updatedSchemeDetails;
    
    // Recalculate scheme summary
    const totalFreeQty = updatedSchemeDetails.reduce((sum, s) => sum + Number(s.freeQty), 0);
    upload.schemeSummary = {
      count: updatedSchemeDetails.length,
      totalFreeQty: totalFreeQty
    };

    // Regenerate Excel file
    const wb = XLSX.utils.book_new();
    
    // 🔥 Remove internal flags (_hasScheme) before converting to sheet
    const cleanRows = rows.map(({ _hasScheme, ...rest }) => rest);
    const ws = XLSX.utils.json_to_sheet(cleanRows, { header: upload.convertedData.headers });

    // Apply styling (same as original conversion)
    const headers = upload.convertedData.headers;
    
    // Style headers
    headers.forEach((_, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (ws[cellRef]) {
        ws[cellRef].s = headerStyle;
      }
    });

      // Style data rows
      rows.forEach((row, idx) => {
      const excelRow = idx + 1;
      headers.forEach((_, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
        if (!ws[cellRef]) ws[cellRef] = { v: "" };
        
        let style = normalCellStyle;
        
        // Use quantity style for ORDERQTY column (center aligned, light yellow default)
        if (headers[colIdx] === "ORDERQTY") {
          style = qtyCellStyle;
        }

        // Apply scheme style (Yellow Fill) if this row has a scheme
        if (row._hasScheme) {
          // Merge styles: Keep alignment/border from base style, but override fill to Yellow
          style = {
            ...style,
            fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } }
          };
        }
        
        ws[cellRef].s = style;
      });
    });

    // Set column widths
    ws["!cols"] = [
      { wch: 15 }, // CODE
      { wch: 40 }, // CUSTOMER NAME
      { wch: 15 }, // SAPCODE
      { wch: 50 }, // ITEMDESC
      { wch: 12 }, // ORDERQTY
      { wch: 12 }, // BOX PACK
      { wch: 12 }, // PACK
      { wch: 15 }  // DVN
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Converted Orders");

    // 🔥 Add Scheme Summary Sheet
    if (updatedSchemeDetails.length > 0) {
      const schemeSheetData = updatedSchemeDetails.map(s => ({
        "Product Code": s.productCode,
        "Product Name": s.productName,
        "Order Qty": s.orderQty,
        "Free Qty": s.freeQty,
        // Removed "Applied Scheme" as requested (redundant with color/qty)
        "Scheme %": s.schemePercent,
        "Division": s.division
      }));

      const schemeWs = XLSX.utils.json_to_sheet(schemeSheetData);
      
      // Style header
      const schemeHeaders = ["Product Code", "Product Name", "Order Qty", "Free Qty", "Scheme %", "Division"];
      for(let c=0; c<schemeHeaders.length; c++) {
          const cellRef = XLSX.utils.encode_cell({r:0, c});
          if(schemeWs[cellRef]) schemeWs[cellRef].s = headerStyle;
      }

      // 🔥 Style Data Rows (Yellow Fill + Alignment)
      schemeSheetData.forEach((row, idx) => {
        const excelRow = idx + 1;
        schemeHeaders.forEach((colName, colIdx) => {
          const cellRef = XLSX.utils.encode_cell({r: excelRow, c: colIdx});
          if(!schemeWs[cellRef]) schemeWs[cellRef] = {v: ""};
          
          let style = normalCellStyle;
          // Center align quantities
          if (colName === "Order Qty" || colName === "Free Qty" || colName === "Scheme %") {
               style = qtyCellStyle;
          }
          // Apply Yellow Fill
          style = { ...style, fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
          schemeWs[cellRef].s = style;
        });
      });
      
      // column widths
      schemeWs["!cols"] = [
          {wch: 15}, {wch: 30}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}
      ];

      XLSX.utils.book_append_sheet(wb, schemeWs, "Scheme Summary");
    }

    // Save updated file
    const outputFileName = `converted-${id}-${Date.now()}.xlsx`;
    const outputPath = path.join("uploads", outputFileName);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(outputPath, buffer);

    // Update upload record
    upload.outputFile = outputFileName;
    // 🔥 Critical: Update outputFiles list so download uses this new file
    upload.outputFiles = [outputFileName];
    
    await upload.save();

    res.json({
      success: true,
      message: "Converted data updated successfully",
      data: {
        rowsUpdated: rows.length,
        outputFile: outputFileName,
        // 🔥 Return updated scheme details so frontend can refresh
        schemeDetails: updatedSchemeDetails,
        schemeSummary: {
          count: updatedSchemeDetails.length,
          totalFreeQty
        }
      }
    });

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   UPDATE SCHEME DATA
   PUT /api/orders/scheme-data/:id
===================================================== */
export async function updateSchemeData(req, res, next) {
  try {
    const { id } = req.params;
    const { schemeDetails } = req.body;

    if (!Array.isArray(schemeDetails)) {
      return res.status(400).json({
        success: false,
        message: "Invalid data format. Expected array of scheme details."
      });
    }

    const upload = await OrderUpload.findById(id);

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (req.user.role !== "admin" && upload.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    // Validate scheme details
    for (let i = 0; i < schemeDetails.length; i++) {
      const scheme = schemeDetails[i];
      
      if (isNaN(Number(scheme.orderQty)) || Number(scheme.orderQty) < 0) {
        return res.status(400).json({
          success: false,
          message: `Scheme ${i + 1}: Invalid orderQty`
        });
      }

      if (isNaN(Number(scheme.freeQty)) || Number(scheme.freeQty) < 0) {
        return res.status(400).json({
          success: false,
          message: `Scheme ${i + 1}: Invalid freeQty`
        });
      }

      if (isNaN(Number(scheme.schemePercent)) || Number(scheme.schemePercent) < 0) {
        return res.status(400).json({
          success: false,
          message: `Scheme ${i + 1}: Invalid schemePercent`
        });
      }
    }

    // Update scheme details
    upload.schemeDetails = schemeDetails;

    // Recalculate scheme summary
    const totalFreeQty = schemeDetails.reduce((sum, s) => sum + Number(s.freeQty), 0);
    upload.schemeSummary = {
      count: schemeDetails.length,
      totalFreeQty: totalFreeQty
    };

    await upload.save();

    res.json({
      success: true,
      message: "Scheme data updated successfully",
      data: {
        schemesUpdated: schemeDetails.length,
        totalFreeQty: totalFreeQty
      }
    });

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   EXPORTS
===================================================== */
export default {
  downloadConvertedFile,
  downloadSchemeFile,
  previewConvertedOrders,
  previewSchemeData,
  updateConvertedData,
  updateSchemeData
}