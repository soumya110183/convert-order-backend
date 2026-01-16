import express from "express";
import { getMenu } from "../controllers/userDashboardController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMenu);

export default router;