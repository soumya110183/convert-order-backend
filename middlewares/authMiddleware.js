import jwt from "jsonwebtoken";

/* ======================================================
   AUTH PROTECTION
====================================================== */
export const protect = (req, res, next) => {
  let token;

  // 1️⃣ From Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2️⃣ (Optional) From cookies
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET not configured");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    // ✅ decoded is defined HERE
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("🔍 DECODED TOKEN:", decoded);

    req.user = decoded; // { id, name, email, role }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/* ======================================================
   ADMIN GUARD
====================================================== */
export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};
