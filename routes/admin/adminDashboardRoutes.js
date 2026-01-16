// routes/adminDashboard.routes.js
import express from "express";
import { getAdminDashboard } from "../../controllers/admin/adminDashboardController.js";
import { protect } from "../../middlewares/authMiddleware.js";
import {adminOnly} from "../../middlewares/roleMiddleware.js";

const router = express.Router();

router.get("/", protect, adminOnly, getAdminDashboard);

export default router;
