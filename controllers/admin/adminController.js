import XLSX from "xlsx-js-style";

import crypto from "crypto";

import { uploadMasterExcel } from "../../services/masterUploadService.js";
import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import SchemeMaster from "../../models/schemeMaster.js";
import InvoiceAudit from "../../models/invoiceAudit.js";
import User from "../../models/User.js";
import OrderUpload from "../../models/orderUpload.js"; // Match user dashboard model

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

// Admin guard handled by middleware
/* =====================================================
   UPLOAD MASTER EXCEL
   POST /api/admin/master/upload
===================================================== */
export async function uploadMaster(req, res, next) {
  try {
    // Admin guard handled by middleware

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
    // Admin guard handled by middleware

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
    // Admin guard handled by middleware

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
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status.toUpperCase();
    if (req.query.userId) query.userId = req.query.userId;

    const search = (req.query.search || "").trim();
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      query.$or = [
        { fileName: searchRegex },
        { status: searchRegex },
        // Simple regex search on userEmail directly stored in OrderUpload
        // If searching by User NAME is needed, we need aggregate or 2-step find. 
        // For now, email search is supported via OrderUpload.userEmail field.
        { userEmail: searchRegex }
      ];
    }

    // 🔥 MODIFIED: Fetch from OrderUpload (Actual User Uploads) instead of Audit Log
    const [total, uploads] = await Promise.all([
      OrderUpload.countDocuments(query),
      OrderUpload.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .lean()
    ]);

    // Map to a structure appropriate for the Audit/History Table
    const data = uploads.map(u => ({
      _id: u._id,
      action: "FILE_UPLOAD", // Synthetic action name
      user: u.userId, // Populated object { name, email, _id }
      details: u.fileName,
      status: u.status,
      timestamp: u.createdAt,
      createdAt: u.createdAt,
      // Extra fields for new frontend features
      fileName: u.fileName,
      processed: u.recordsProcessed,
      failed: u.recordsFailed 
    }));

    res.json({
      success: true,
      data: data,
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
    // Admin guard handled by middleware


    const [
      customerCount,
      productCount,
      schemeCount,
      userCount,
      uploadCount,
      successCount,
      failCount
    ] = await Promise.all([
      CustomerMaster.countDocuments(),
      ProductMaster.countDocuments(),
      SchemeMaster.countDocuments(),
      User.countDocuments(),
      OrderUpload.countDocuments(),
      OrderUpload.countDocuments({ status: "CONVERTED" }), // Matches OrderUpload status
      OrderUpload.countDocuments({ status: "FAILED" })
    ]);

    const successRate =
      uploadCount === 0
        ? 100
        : ((successCount / uploadCount) * 100).toFixed(1);

    res.json({
      success: true,
      users: {
        total: userCount
      },
      uploads: {
        total: uploadCount,
        completed: successCount, // "successfulConversions"
        failed: failCount,
        successRate: Number(successRate)
      },
      masterData: {
        customers: customerCount,
        products: productCount,
        schemes: schemeCount  // ✅ ADDED
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
    // Admin guard handled by middleware

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
   RECENT UPLOADS (PAGINATED)
   GET /api/admin/uploads
===================================================== */
export async function getRecentUploadsPaginated(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const query = {};

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      
      // We need to find users that match the email/name search first if we want to search by user name
      // But for performance on direct fields:
      query.$or = [
        { fileName: searchRegex },
        { status: searchRegex },
        // For user email, we usually need to look up users first or use aggregate.
        // For now, let's stick to fields present in OrderUpload if possible, 
        // OR rely on the fact that userEmail IS in OrderUpload schema (lines 11-16 of orderUpload.js)
        { userEmail: searchRegex } 
      ];
    }

    const [total, uploads] = await Promise.all([
      OrderUpload.countDocuments(query),
      OrderUpload.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email") // Populate user info
        .lean()
    ]);

    res.json({
      success: true,
      data: uploads.map(u => ({
        id: u._id,
        fileName: u.fileName,
        userName: u.userId?.name || "Unknown",
        userEmail: u.userId?.email || u.userEmail || "", // Fallback to schema email
        status: u.status,
        processed: u.recordsProcessed || 0,
        failed: u.recordsFailed || 0,
        createdAt: u.createdAt
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
   GET UPLOAD DETAILS (VIEW RESULT)
   GET /api/admin/upload/:id
===================================================== */
export async function getUploadResult(req, res, next) {
  try {
    const { id } = req.params;
    
    const upload = await OrderUpload.findById(id)
      .populate("userId", "name email")
      .lean();

    if (!upload) {
      return res.status(404).json({ success: false, message: "Upload not found" });
    }

    res.json({
      success: true,
      data: {
        id: upload._id,
        user: {
          name: upload.userId?.name || "Unknown",
          email: upload.userId?.email || ""
        },
        fileName: upload.fileName,
        status: upload.status,
        createdAt: upload.createdAt,
        stats: {
          processed: upload.recordsProcessed,
          failed: upload.recordsFailed,
          schemeCount: upload.schemeSummary?.count || 0
        },
        result: upload.convertedData // The actual converted rows
      }
    });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   UPDATE CUSTOMER
   PUT /api/admin/customers/:id
===================================================== */
export async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const customer = await CustomerMaster.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    res.json({ success: true, data: customer, message: "Customer updated successfully" });
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   UPDATE PRODUCT
   PUT /api/admin/products/:id
===================================================== */
export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const product = await ProductMaster.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, data: product, message: "Product updated successfully" });
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
  searchMasterData,
  getRecentUploadsPaginated, // ✅ Added
  getUploadResult, // ✅ Added
  updateCustomer, // ✅ Added
  updateProduct // ✅ Added
};