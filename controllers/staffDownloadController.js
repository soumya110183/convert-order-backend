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
    const { id } = req.params;

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

    if (!upload.outputFile) {
      return res.status(404).json({
        success: false,
        message: "Converted file missing"
      });
    }

    const filePath = path.resolve("uploads", upload.outputFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server"
      });
    }

    return res.download(
      filePath,
      upload.fileName.replace(/\.[^.]+$/, "") + "-converted.xlsx"
    );

  } catch (err) {
    next(err);
  }
}


/* =====================================================
   PREVIEW CONVERTED DATA
   GET /api/orders/preview/:uploadId
===================================================== */
export async function previewConvertedOrders(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const upload = await OrderUpload.findOne({
      _id: req.params.uploadId,
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
        total: 0
      });
    }

    const total = upload.convertedData.rows.length;
    const data = upload.convertedData.rows.slice(skip, skip + limit);

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
   EXPORTS
===================================================== */
export default {
  downloadConvertedFile,
  downloadSchemeFile,
  previewConvertedOrders
}