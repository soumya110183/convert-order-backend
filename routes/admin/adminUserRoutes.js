import express from "express";
import {
  getUsers,
  addUser,
  updateRole,
  toggleStatus,
  deleteUser,
} from "../../controllers/admin/adminUserController.js";

import { protect, adminOnly } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// 🔐 Apply auth + admin guard to ALL routes
router.use(protect, adminOnly);

router.get("/", getUsers);
router.post("/", addUser);
router.put("/:id/role", updateRole);
router.put("/:id/status", toggleStatus);
router.delete("/:id", deleteUser);
// Upload Invoice (User) - REMOVED (Wrong File)

export default router;