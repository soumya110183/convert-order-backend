import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getUserDashboard } from "../controllers/userDashboardController.js";

const router = express.Router();

// User dashboard
router.get("/dashboard", protect, getUserDashboard);

export default router;
