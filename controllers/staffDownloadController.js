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
      upload.fileName.replace(/\.[^.]+$/, "") + "-order-training.xlsx"
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
    const ws = XLSX.utils.json_to_sheet(schemeDetails);

    XLSX.utils.book_append_sheet(wb, ws, "Scheme Summary");

    const fileName = `scheme-summary-${upload.customerCode}-${Date.now()}.xlsx`;

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