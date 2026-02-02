// =====================================================
// STAFF ORDER ROUTES (user = staff)
// =====================================================
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

import {
  extractOrderFields,
  convertOrders,
  getOrderHistory,
  getOrderById,
  checkSchemes,
  getProductSchemes,
  generateDivisionReport
} from "../controllers/orderController.js";

import {
  downloadConvertedFile,
  downloadSchemeFile,
  previewConvertedOrders,
  previewSchemeData,
  updateConvertedData,
  updateSchemeData
} from "../controllers/staffDownloadController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* ================== FILE UPLOAD ================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.originalname.match(/\.(pdf|xls|xlsx|txt|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, Excel, Text or CSV files allowed"));
    }
  }
});

/* ================== AUTH ================== */
router.use(protect);

/* ================== FLOW ================== */

// import { uploadLimiter } from "../middlewares/rateLimiter.js";

// Upload endpoint
// router.post("/upload", uploadLimiter, upload.single("file"), extractOrderFields); 
// Disabling limiter as per user request
router.post("/upload", upload.array("files"), extractOrderFields);
import { validateFile } from "../middlewares/inputValidation.js";

// Step 1: Upload & extract
router.post("/extract", upload.array("files"), validateFile, extractOrderFields);

// Step 2: Convert
// Step 2: Convert
router.post("/convert", convertOrders);
router.post("/convert/division-report", generateDivisionReport);

// Step 2b: Check Schemes
router.post("/check-schemes", checkSchemes);

// Step 3: History (list)
router.get("/history", getOrderHistory);

// Step 4: Download (MOST SPECIFIC FIRST)
router.get("/download/file/:filename", (req, res) => {
  const { filename } = req.params;
  // Simple security check: prevent directory traversal
  if (filename.includes("..") || !filename.endsWith(".xlsx")) {
    return res.status(403).send("Invalid filename");
  }
  const filePath = path.resolve("uploads", filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("File not found");
  }
});
router.get("/download/:id/:type", downloadConvertedFile);
router.get("/download/:id", downloadConvertedFile);
router.get("/:id/scheme-file", downloadSchemeFile);

// Step 5: Preview
router.get("/preview/:id", previewConvertedOrders);
router.get("/preview-scheme/:id", previewSchemeData);

// Step 5b: Update data (edit before download)
router.put("/converted-data/:id", updateConvertedData);
router.put("/scheme-data/:id", updateSchemeData);

// Step 5c: Get schemes for specific product (Manual Mapping)
router.get("/schemes/product/:productCode", getProductSchemes);

// Step 6: Get single order (LAST – generic)
router.get("/:id", getOrderById);

export default router;