import User from "../../models/User.js";
import bcrypt from "bcryptjs";

/* ---------------- GET ALL USERS ---------------- */

import OrderUpload from "../../models/orderUpload.js";

/* ---------------- GET ALL USERS ---------------- */
export const getUsers = async (req, res) => {
  const { search = "" } = req.query;

  const users = await User.find({
    $or: [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
    ],
  })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  // 🔥 Get conversion counts per user
  const conversionsByUser = await OrderUpload.aggregate([
    {
      $match: { status: "CONVERTED" },
    },
    {
      $group: {
        _id: "$userId",
        count: { $sum: 1 },
      },
    },
  ]);

  const conversionMap = {};
  conversionsByUser.forEach(c => {
    conversionMap[String(c._id)] = c.count;
  });

  const formatted = users.map(u => ({
    ...u,
    status: u.isActive ? "Active" : "Disabled",
    conversions: conversionMap[String(u._id)] || 0, // ✅ DYNAMIC
    lastLogin: u.lastLogin || null,
  }));

  res.json(formatted);
};


/* ---------------- ADD USER ---------------- */
export const addUser = async (req, res) => {
  const { name, email, role, status, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(409).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ Normalize fields
  const normalizedRole = (role || "user").toLowerCase();
  const isActive = status === "Disabled" ? false : true;

  // ✅ Auto-generate name if missing
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
    role: normalizedRole,
    isActive,
    password: hashedPassword, // ✅ CORRECT FIELD
  });

  res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  });
};

/* ---------------- UPDATE ROLE ---------------- */
export const updateRole = async (req, res) => {
  const { role } = req.body;

  const normalizedRole = role.toLowerCase();

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: normalizedRole },
    { new: true }
  ).select("-password");

  res.json(user);
};

/* ---------------- ENABLE / DISABLE ---------------- */
export const toggleStatus = async (req, res) => {
  const user = await User.findById(req.params.id);

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    id: user._id,
    isActive: user.isActive,
  });
};
