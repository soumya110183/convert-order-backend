import express from "express";
import multer from "multer";
import { protect } from "../middlewares/authMiddleware.js";
import {
  extractOrderFields,
  convertOrders,
  getOrderHistory,
  downloadConvertedFile,
  getOrderResult,
  getOrderTemplate,
  getOrderById,
} from "../controllers/orderController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST routes
router.post("/extract", protect, upload.single("file"), extractOrderFields);
router.post("/convert", protect, convertOrders);

// GET routes - ORDER MATTERS!
router.get("/history", protect, getOrderHistory);
router.get("/template", protect, getOrderTemplate);
router.get("/download/:id", protect, downloadConvertedFile);  // BEFORE /:id
router.get("/result/:id", protect, getOrderResult);            // BEFORE /:id
router.get("/:id", protect, getOrderById);                     // LAST!

export default router;