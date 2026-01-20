// =====================================================
// STAFF ORDER ROUTES (user = staff)
// =====================================================
import express from "express";
import multer from "multer";

import {
  extractOrderFields,
  convertOrders,
  getOrderHistory,
  getOrderById,
  checkSchemes
} from "../controllers/orderController.js";

import {
  downloadConvertedFile,
  downloadSchemeFile,
  previewConvertedOrders
} from "../controllers/staffDownloadController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* ================== FILE UPLOAD ================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.originalname.match(/\.(pdf|xls|xlsx|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, Excel or Text files allowed"));
    }
  }
});

/* ================== AUTH ================== */
router.use(protect);

/* ================== FLOW ================== */

// Step 1: Upload & extract
router.post("/extract", upload.single("file"), extractOrderFields);

// Step 2: Convert
router.post("/convert", convertOrders);

// Step 2b: Check Schemes
router.post("/check-schemes", checkSchemes);

// Step 3: History (list)
router.get("/history", getOrderHistory);

// Step 4: Download (MOST SPECIFIC FIRST)
router.get("/download/:id", downloadConvertedFile);
router.get("/:id/scheme-file", downloadSchemeFile);

// Step 5: Preview
router.get("/preview/:id", previewConvertedOrders);

// Step 6: Get single order (LAST – generic)
router.get("/:id", getOrderById);

export default router;