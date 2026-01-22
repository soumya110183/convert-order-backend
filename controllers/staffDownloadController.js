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
  fill: { patternType: "solid", fgColor: { rgb: "FFFF99" } },   // Light yellow for schemes
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

    const upload = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
      });
    }

    if (upload.status !== "CONVERTED") {
      return res.status(400).json({
        success: false,
        message: `File not ready (status: ${upload.status})`
      });
    }

    let fileName = upload.outputFile;
    
    // Handle specific file types
    if (type && upload.outputFiles && upload.outputFiles.length > 0) {
      if (type === 'sheets') {
        // Convention: First file is sheets
        fileName = upload.outputFiles.find(f => f.startsWith('sheet-orders')) || upload.outputFiles[0];
      } else if (type === 'main') {
        // Convention: Second file is main/standard
        fileName = upload.outputFiles.find(f => f.startsWith('main-order')) || upload.outputFiles[1];
      }
    }

    if (!fileName) {
      return res.status(404).json({
        success: false,
        message: "Converted file missing"
      });
    }

    const filePath = path.resolve("uploads", fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server"
      });
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

    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();

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

    const upload = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    }).lean(); // ✅ VERY IMPORTANT

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
      headers.forEach((_, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
        if (!ws[cellRef]) ws[cellRef] = { v: "" }; // Ensure cell exists
        
        // Use schemeRowStyle as requested ("yellow row colour... like done in converted files")
        ws[cellRef].s = schemeRowStyle; 
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

    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();

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
   UPDATE CONVERTED DATA
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

    const upload = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    });

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

    // Update converted data
    upload.convertedData.rows = rows;

    // Regenerate Excel file
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: upload.convertedData.headers });

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
        
        // Apply scheme style if this row has a scheme
        if (row["Free Qty"] || row["Scheme %"]) {
          ws[cellRef].s = schemeRowStyle;
        } else {
          ws[cellRef].s = normalCellStyle;
        }
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

    // Save updated file
    const outputFileName = `converted-${id}-${Date.now()}.xlsx`;
    const outputPath = path.join("uploads", outputFileName);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(outputPath, buffer);

    // Update upload record
    upload.outputFile = outputFileName;
    await upload.save();

    res.json({
      success: true,
      message: "Converted data updated successfully",
      data: {
        rowsUpdated: rows.length,
        outputFile: outputFileName
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

    const upload = await OrderUpload.findOne({
      _id: id,
      userId: req.user.id
    });

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