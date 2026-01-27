import crypto from "crypto";
import XLSX from "xlsx-js-style";


import { unifiedExtract } from "../../services/unifiedParser.js";
import { buildOrderTrainingRows } from "../../services/orderTrainingService.js";
import InvoiceAudit from "../../models/invoiceAudit.js";

/**
 * =====================================================
 * USER ORDER CONTROLLER (PRODUCTION)
 *
 * RULES:
 * - User uploads NEVER update admin DB
 * - Admin master is READ ONLY
 * - Output = Order Training Excel file
 * =====================================================
 */

/* =====================================================
   PROCESS INVOICE → GENERATE FILE
   POST /api/orders/upload
===================================================== */
export async function processInvoice(req, res, next) {
  const startTime = Date.now();
  let audit;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE_UPLOADED",
        message: "Please upload a file"
      });
    }

    /* ---------- Deduplication ---------- */
    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const existing = await InvoiceAudit.findOne({ fileHash });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_FILE",
        message: "This file was already processed",
        auditId: existing._id
      });
    }

    /* ---------- Create audit ---------- */
    audit = await InvoiceAudit.create({
      userId: req.user.id,
      userEmail: req.user.email,
      fileName: req.file.originalname,
      fileHash,
      status: "PROCESSING"
    });

    /* ---------- Parse invoice ---------- */
    // 🔥 FIX: Use unified parser and extract dataRows
    const extractionResult = await unifiedExtract(req.file);
    const invoiceItems = extractionResult.dataRows || [];

    if (!invoiceItems.length) {
      audit.status = "FAILED";
      audit.errorMessage = "No valid items found in invoice";
      audit.processingTimeMs = Date.now() - startTime;
      await audit.save();

      return res.status(422).json({
        success: false,
        error: "NO_ITEMS_FOUND",
        message: "No valid items found in invoice"
      });
    }

    /* ---------- Build order training rows (READ ONLY MASTER) ---------- */
    const result = await buildOrderTrainingRows(invoiceItems);

    if (!result.rows.length) {
      audit.status = "FAILED";
      audit.errorMessage = "No items matched with master data";
      audit.processingTimeMs = Date.now() - startTime;
      await audit.save();

      return res.status(422).json({
        success: false,
        message: "No invoice items matched with master data"
      });
    }

    /* ---------- Generate Excel ---------- */
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(result.rows);

    XLSX.utils.book_append_sheet(wb, ws, "Order Training");

    const buffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx"
    });

    /* ---------- Update audit (NO DB MUTATION) ---------- */
    audit.status = "COMPLETED";
    audit.stats = {
      totalItems: result.stats.total,
      matched: result.stats.matched,
      unmatched: result.stats.unmatched
    };
    audit.unmatchedItems = result.unmatchedItems;
    audit.processingTimeMs = Date.now() - startTime;
    await audit.save();

    /* ---------- Send file ---------- */
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.file.originalname.replace(/\.[^.]+$/, "")}-converted.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (err) {
    if (audit) {
      audit.status = "FAILED";
      audit.errorMessage = err.message;
      audit.processingTimeMs = Date.now() - startTime;
      await audit.save();
    }
    next(err);
  }
}

/* =====================================================
   USER UPLOAD HISTORY
   GET /api/orders/history
===================================================== */
export async function getUploadHistory(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [total, uploads] = await Promise.all([
      InvoiceAudit.countDocuments({ userId: req.user.id }),
      InvoiceAudit.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("fileName status stats createdAt processingTimeMs")
        .lean()
    ]);

    res.json({
      success: true,
      data: uploads.map(u => ({
        id: u._id,
        fileName: u.fileName,
        uploadDate: u.createdAt,
        status: u.status,
        matched: u.stats?.matched || 0,
        unmatched: u.stats?.unmatched || 0,
        processingTime: u.processingTimeMs
      })),
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
   USER DASHBOARD STATS
   GET /api/orders/stats
===================================================== */
export async function getUserStats(req, res, next) {
  try {
    const stats = await InvoiceAudit.aggregate([
      { $match: { userId: req.user._id, status: "COMPLETED" } },
      {
        $group: {
          _id: null,
          uploads: { $sum: 1 },
          matched: { $sum: "$stats.matched" },
          unmatched: { $sum: "$stats.unmatched" }
        }
      }
    ]);

    const s = stats[0] || { uploads: 0, matched: 0, unmatched: 0 };

    res.json({
      success: true,
      stats: {
        uploads: s.uploads,
        totalItems: s.matched + s.unmatched,
        matched: s.matched,
        unmatched: s.unmatched
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
  processInvoice,
  getUploadHistory,
  getUserStats
};