import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

import authRoutes from "./routes/authRoutes.js";
import menuRoutes from "./routes/menuRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import userDashboardRoutes from "./routes/userDashboardRoute.js";

import adminRoutes from "./routes/admin/adminRoutes.js";
import adminDashboardRoutes from "./routes/admin/adminDashboardRoutes.js";
import adminMappingRoutes from "./routes/admin/mappingRoutes.js";
import adminUserRoutes from "./routes/admin/adminUserRoutes.js";

import errorHandler from "./middlewares/errorMiddleware.js";
import createAdminIfNotExists from "./utils/createAdmin.js";

import masterDataRoutes from "./routes/admin/masterDataRoutes.js";

dotenv.config();

const app = express();

/* -------------------- SECURITY -------------------- */
app.use(helmet());
app.use(cors());

/* -------------------- BODY PARSER -------------------- */
app.use(express.json());

/* -------------------- PUBLIC -------------------- */
app.use("/api/auth", authRoutes);

/* -------------------- USER -------------------- */
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/user", userDashboardRoutes);


import { initTrainingTemplate } from "./services/trainingTemplate.js";

await initTrainingTemplate();


/* -------------------- ADMIN (ORDER MATTERS) -------------------- */
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin", adminMappingRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/admin", masterDataRoutes);
/* -------------------- FILES -------------------- */
app.use("/uploads", express.static("uploads"));

/* -------------------- HEALTH -------------------- */
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

/* -------------------- ERROR HANDLER -------------------- */
app.use(errorHandler);

/* -------------------- DB + SERVER -------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    await createAdminIfNotExists();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
