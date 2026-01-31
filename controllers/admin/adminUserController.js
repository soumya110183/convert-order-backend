import bcrypt from "bcryptjs";
import User from "../../models/User.js";
import OrderUpload from "../../models/orderUpload.js";

/**
 * =====================================================
 * ADMIN USER CONTROLLER (PRODUCTION)
 *
 * RESPONSIBILITIES:
 * - Manage users (CRUD-lite)
 * - View user activity stats (READ ONLY)
 * - NO business logic
 * - NO master DB mutation
 * =====================================================
 */

/* =====================================================
   ADMIN GUARD (use middleware if already exists)
===================================================== */
/* =====================================================
   GET ALL USERS
   GET /api/admin/users
===================================================== */
export const getUsers = async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Run DB queries in parallel for performance
    const [users, conversions] = await Promise.all([
      User.find(
        search
          ? {
              $or: [
                { name: { $regex: safeSearch, $options: "i" } },
                { email: { $regex: safeSearch, $options: "i" } }
              ]
            }
          : {}
      )
        .select("-password")
        .sort({ createdAt: -1 })
        .lean(),

      OrderUpload.aggregate([
        { $match: { status: "CONVERTED" } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
      ])
    ]);

    /* ---------- Map conversions for O(1) lookup ---------- */
    const conversionMap = Object.fromEntries(
      conversions.map(c => [String(c._id), c.count])
    );

    const formatted = users.map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.isActive ? "Active" : "Disabled",
      conversions: conversionMap[String(u._id)] || 0,
      lastLogin: u.lastLogin || null,
      createdAt: u.createdAt
    }));

    res.json({ success: true, data: formatted });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   ADD USER
   POST /api/admin/users
===================================================== */
export const addUser = async (req, res, next) => {
  try {
    // Admin guard handled by middleware

    const { name, email, role = "user", status = "Active", password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const safeName =
      name ||
      email
        .split("@")[0]
        .replace(/[^a-zA-Z]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const user = await User.create({
      name: safeName,
      email,
      role: role.toLowerCase(),
      isActive: status !== "Disabled",
      password: hashedPassword
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.isActive ? "Active" : "Disabled",
        conversions: 0,
        lastLogin: null
      }
    });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   UPDATE USER ROLE
   PATCH /api/admin/users/:id/role
===================================================== */
export const updateRole = async (req, res, next) => {
  try {
    // Admin guard handled by middleware

    const { role } = req.body;
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: role.toLowerCase() },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({ success: true, user });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   ENABLE / DISABLE USER
   PATCH /api/admin/users/:id/status
===================================================== */
export const toggleStatus = async (req, res, next) => {
  try {
    // Admin guard handled by middleware

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      id: user._id,
      status: user.isActive ? "Active" : "Disabled"
    });

  } catch (err) {
    next(err);
  }
};
/* =====================================================
   DELETE USER
   DELETE /api/admin/users/:id
===================================================== */
export const deleteUser = async (req, res, next) => {
  try {
    // Admin guard handled by middleware

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
      id: user._id
    });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   EXPORTS
===================================================== */
export default {
  getUsers,
  addUser,
  updateRole,
  toggleStatus,
  deleteUser
};