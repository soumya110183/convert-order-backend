import XLSX from "xlsx";
import crypto from "crypto";

import { uploadMasterExcel } from "../../services/masterUploadService.js";
import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import InvoiceAudit from "../../models/invoiceAudit.js";
import User from "../../models/User.js";

/**
 * =====================================================
 * ADMIN MASTER CONTROLLER (PRODUCTION)
 *
 * RULES:
 * - Admin DB is WRITEABLE only by admin
 * - User uploads NEVER modify admin DB
 * - No order quantity stored in admin DB
 * =====================================================
 */

/* =====================================================
   ADMIN GUARD (OPTIONAL IF DONE IN ROUTER)
===================================================== */
function ensureAdmin(req, res) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ success: false, message: "Admin access required" });
    return false;
  }
  return true;
}

/* =====================================================
   UPLOAD MASTER EXCEL
   POST /api/admin/master/upload
===================================================== */
export async function uploadMaster(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE_UPLOADED",
        message: "Please upload an Excel file"
      });
    }

    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const stats = await uploadMasterExcel(req.file.buffer);

    if (!stats.customers || !stats.products) {
      return res.status(422).json({
        success: false,
        message: "Excel must contain both Customer and Product sheets"
      });
    }

    res.json({
      success: true,
      message: "Master database uploaded successfully",
      stats
    });

  } catch (err) {
    if (err.message === "EMPTY_EXCEL_FILE") {
      return res.status(422).json({ success: false, message: "Empty or invalid Excel file" });
    }
    next(err);
  }
}

/* =====================================================
   MASTER STATS (NO QUANTITY)
   GET /api/admin/master/stats
===================================================== */
export async function getMasterStats(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    const [customers, products] = await Promise.all([
      CustomerMaster.countDocuments(),
      ProductMaster.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        customers,
        products
      }
    });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   EXPORT MASTER DATABASE
   GET /api/admin/master/export
===================================================== */
export async function exportMaster(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    const customers = await CustomerMaster.find().sort({ customerCode: 1 }).lean();
    const products = await ProductMaster.find().sort({ productCode: 1 }).lean();

    if (!customers.length && !products.length) {
      return res.status(404).json({ success: false, message: "No master data found" });
    }

    const wb = XLSX.utils.book_new();

    /* ---------------- CUSTOMER SHEET ---------------- */
    const customerSheet = XLSX.utils.json_to_sheet(
      customers.map(c => ({
        "Customer Code": c.customerCode,
        "Customer Name": c.customerName,
        "City": c.city || "",
        "State": c.state || "",
        "GST No": c.gstNo || "",
        "Email": c.email || ""
      }))
    );
    XLSX.utils.book_append_sheet(wb, customerSheet, "Customers");

    /* ---------------- PRODUCT SHEET ---------------- */
    const productSheet = XLSX.utils.json_to_sheet(
      products.map(p => ({
        "SAP Code": p.productCode,
        "Item Description": p.productName,
        "Division": p.division || ""
      }))
    );
    XLSX.utils.book_append_sheet(wb, productSheet, "Products");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="master-data-${Date.now()}.xlsx"`
    );
    res.send(buffer);

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   AUDIT HISTORY (READ-ONLY)
   GET /api/admin/audits
===================================================== */
export async function getAuditHistory(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status.toUpperCase();
    if (req.query.userId) query.userId = req.query.userId;

    const [total, audits] = await Promise.all([
      InvoiceAudit.countDocuments(query),
      InvoiceAudit.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .lean()
    ]);

    res.json({
      success: true,
      data: audits,
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
   ADMIN DASHBOARD (COUNTS ONLY)
   GET /api/admin/dashboard
===================================================== */
export async function getAdminDashboard(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    const [
      customerCount,
      productCount,
      userCount,
      uploadCount,
      successCount,
      failCount
    ] = await Promise.all([
      CustomerMaster.countDocuments(),
      ProductMaster.countDocuments(),
      User.countDocuments(),
      InvoiceAudit.countDocuments(),
      InvoiceAudit.countDocuments({ status: "COMPLETED" }),
      InvoiceAudit.countDocuments({ status: "FAILED" })
    ]);

    res.json({
      success: true,
      stats: {
        customers: customerCount,
        products: productCount,
        users: userCount,
        uploads: uploadCount,
        successRate:
          uploadCount === 0
            ? 100
            : ((successCount / uploadCount) * 100).toFixed(1)
      }
    });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   SEARCH MASTER DATA
   GET /api/admin/master/search
===================================================== */
export async function searchMasterData(req, res, next) {
  try {
    if (!ensureAdmin(req, res)) return;

    const q = (req.query.q || "").trim();
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const products = await ProductMaster.find(
      q
        ? {
            $or: [
              { productName: { $regex: safeQ, $options: "i" } },
              { productCode: { $regex: safeQ, $options: "i" } }
            ]
          }
        : {}
    )
      .limit(100)
      .lean();

    res.json({ success: true, data: products });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   EXPORTS
===================================================== */
export default {
  uploadMaster,
  getMasterStats,
  exportMaster,
  getAuditHistory,
  getAdminDashboard,
  searchMasterData
};
