import User from "../../models/User.js";
import OrderUpload from "../../models/orderUpload.js";
import MappingRule from "../../models/mappingRules.js";
import SystemAlert from "../../models/systemAlerts.js";
import ActivityLog from "../../models/activityLogs.js";
import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import { hashPassword } from "../../utils/password.js";
import XLSX from "xlsx";

export const addUser = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashed = await hashPassword(password);

    // ✅ Auto-generate name from email
    const nameFromEmail = email
      .split("@")[0]
      .replace(/[^a-zA-Z]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const user = await User.create({
      name: nameFromEmail || "Staff User", // ✅ IMPORTANT
      email,
      password: hashed,
      role: (role || "user").toLowerCase(),
    });

    res.status(201).json({
      message: "User added successfully",
      id: user._id,
      name: user.name,   // ✅ return name
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
};


export const getMappingRules = async (req, res) => {
  const rules = await MappingRule.find().sort({ updatedAt: -1 });
  res.json({ success: true, rules });
};

export const getRecentUploadsPaginated = async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const [total, uploads] = await Promise.all([
    OrderUpload.countDocuments(),
    OrderUpload.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "fileName userEmail status recordsProcessed recordsFailed createdAt"
      )
      .lean(),
  ]);

  res.json({
    data: uploads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: skip + uploads.length < total,
      hasPrev: page > 1,
    },
  });
};

/* ========================================================================
   CUSTOMER MASTER MANAGEMENT
   ======================================================================== */

export async function addCustomer(req, res) {
  try {
    const { customerCode, customerName } = req.body;

    if (!customerCode) {
      return res.status(400).json({ error: "CUSTOMER_CODE_REQUIRED" });
    }

    const existing = await CustomerMaster.findOne({ customerCode: customerCode.trim() });
    
    if (existing) {
       return res.status(409).json({ error: "CUSTOMER_ALREADY_EXISTS" });
    }

    const customer = await CustomerMaster.create({
      customerCode: customerCode.trim(),
      customerName: customerName?.trim() || ""
    });

    res.json({
      success: true,
      customer
    });
  } catch (err) {
    console.error("Add customer error:", err);
    res.status(500).json({ error: "FAILED_TO_ADD_CUSTOMER" });
  }
}

/* ========================================================================
   PRODUCT MASTER MANAGEMENT
   ======================================================================== */

export async function addProduct(req, res) {
  try {
    const { productCode, productName, division } = req.body;

    if (!productCode || !productName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const existing = await ProductMaster.findOne({ productCode: productCode.trim() });
    if (existing) {
      return res.status(409).json({ error: "PRODUCT_ALREADY_EXISTS" });
    }

    const product = await ProductMaster.create({
      productCode: productCode.trim(),
      productName: productName.trim(),
      division: division?.trim() || ""
    });

    res.json({ success: true, product });
  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ error: "FAILED_TO_ADD_PRODUCT" });
  }
}

export async function transferProduct(req, res) {
  try {
    const { productCode, newDivision } = req.body;

    if (!productCode || !newDivision) {
      return res.status(400).json({ error: "CODE_AND_DIVISION_REQUIRED" });
    }

    const product = await ProductMaster.findOneAndUpdate(
      { productCode: productCode.trim() },
      { $set: { division: newDivision.trim() } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("Transfer product error:", err);
    res.status(500).json({ error: "FAILED_TO_TRANSFER_PRODUCT" });
  }
}

/* ========================================================================
   ADMIN EXPORT (Customer Aggregated)
   ======================================================================== */

export const exportCustomers = async (req, res) => {
  try {
    const customers = await CustomerMaster.find()
      .sort({ customerName: 1 })
      .lean();

    if (!customers.length) {
      return res.status(404).json({ message: "No customer data found" });
    }

    console.log(`📊 Exporting ${customers.length} customers`);

    const exportRows = customers.map(c => ({
      "Customer Code": c.customerCode,
      "Customer Name": c.customerName,
      "Total Order Qty": c.totalOrderQty || 0,
      "Last Updated": c.updatedAt ? new Date(c.updatedAt).toISOString().split('T')[0] : ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    
    // Auto-width
    const wscols = [
      { wch: 15 },
      { wch: 40 },
      { wch: 15 },
      { wch: 15 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Customer Master");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `customer_master_export_${Date.now()}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);

  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Export failed" });
  }
};
