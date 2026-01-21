import express from "express";
import { getAdminDashboard } from "../../controllers/admin/adminController.js";

const router = express.Router();

router.get("/", getAdminDashboard);

export default router;