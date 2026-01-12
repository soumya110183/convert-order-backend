import User from "../../models/User.js";
import OrderUpload from "../../models/orderUpload.js";
import MappingRule from "../../models/mappingRules.js";
import SystemAlert from "../../models/systemAlerts.js";
import ActivityLog from "../../models/activityLogs.js";
import { hashPassword } from "../../utils/password.js";

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
