mappingRputes
import express from "express";
import { getAuditHistory } from "../../controllers/admin/adminController.js";

const router = express.Router();

router.get("/", getAuditHistory);

export default router;