import express from "express";
import {
  getUsers,
  addUser,
  updateRole,
  toggleStatus,
} from "../../controllers/admin/adminUserController.js";

import { protect, adminOnly } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// 🔐 Apply auth + admin guard to ALL routes
router.use(protect, adminOnly);

router.get("/", getUsers);
router.post("/", addUser);
// Upload Invoice (User) - REMOVED (Wrong File)

export default router;