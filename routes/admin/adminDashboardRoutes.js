import express from "express";
import { getAdminDashboard } from "../../controllers/admin/adminDashboardController.js";

const router = express.Router();

router.get("/", getAdminDashboard);

export default router;