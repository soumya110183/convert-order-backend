import express from "express";
import { 
  getAdminDashboard, 
  getRecentUploadsPaginated, 
  getUploadResult,
  deleteUploadsByDateRange
} from "../../controllers/admin/adminController.js";

const router = express.Router();

router.get("/", getAdminDashboard);
router.get("/uploads", getRecentUploadsPaginated);
router.get("/upload/:id", getUploadResult);
router.delete("/uploads/range", deleteUploadsByDateRange);

export default router;