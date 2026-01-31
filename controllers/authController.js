import User from "../models/User.js";
import { comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await comparePassword(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      token,
      role: user.role,
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  res.status(200).json({
    id: req.user.id,
    name: req.user.name ?? null,
    email: req.user.email,
    role: req.user.role,
  });
};
