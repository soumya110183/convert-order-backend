import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

// Routes
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminMasterRoutes from "./routes/admin/masterRoutes.js";
import adminUserRoutes from "./routes/admin/adminUserRoutes.js";
import userDashboardRoutes from "./routes/userDashboardRoute.js";
import masterDataRoutes from "./routes/admin/masterDataRoutes.js";
import adminDashboardRoutes from "./routes/admin/adminDashboardRoutes.js"; // ✅ New Route

// Middlewares
import errorHandler from "./middlewares/errorMiddleware.js";
import createAdminIfNotExists from "./utils/createAdmin.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173", 
  "https://convert-order-frontend.vercel.app",
  "https://convert-order-production.up.railway.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

/* -------------------- SECURITY -------------------- */
app.use(helmet());
// import { apiLimiter } from "./middlewares/rateLimiter.js";
// app.use("/api", apiLimiter);

/* -------------------- BODY PARSER -------------------- */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

/* -------------------- PUBLIC ROUTES -------------------- */
app.use("/api/auth", authRoutes);

/* -------------------- USER ROUTES -------------------- */
app.use("/api/orders", orderRoutes);
app.use("/api/user", userDashboardRoutes)

/* -------------------- ADMIN ROUTES -------------------- */
app.use("/api/admin/master", adminMasterRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin", masterDataRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes); // ✅ Mounted

/* -------------------- HEALTH CHECK -------------------- */
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/* -------------------- ERROR HANDLER -------------------- */
app.use(errorHandler);

/* -------------------- DATABASE & SERVER -------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Create default admin if not exists
    await createAdminIfNotExists();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  mongoose.connection.close(() => {
    console.log("📴 MongoDB connection closed");
    process.exit(0);
  });
});