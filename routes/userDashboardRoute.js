import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getUserDashboard  } from "../controllers/userDashboardController.js";
import {  getMasterStats } from "../controllers/orderController.js";


const router = express.Router();

router.get("/dashboard", protect, getUserDashboard);
router.get("/master-stats", getMasterStats);
export default router;
