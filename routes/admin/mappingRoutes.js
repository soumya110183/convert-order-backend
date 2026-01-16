import express from "express";
import {
  getMappingRules,
  createMappingRule,
  updateMappingRule,
  deleteMappingRule,
} from "../../controllers/admin/mappingRules.js";
import { protect, adminOnly } from "../../middlewares/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Mapping Rules (ADMIN ONLY)
|--------------------------------------------------------------------------
*/

// Get all mapping rules
router.get(
  "/mapping-rules",
  protect,
  adminOnly,
  getMappingRules
);

// Create new mapping rule
router.post(
  "/mapping-rules",
  protect,
  adminOnly,
  createMappingRule
);

// Update mapping rule
router.put(
  "/mapping-rules/:id",
  protect,
  adminOnly,
  updateMappingRule
);

// Delete mapping rule
router.delete(
  "/mapping-rules/:id",
  protect,
  adminOnly,
  deleteMappingRule
);

export default router;