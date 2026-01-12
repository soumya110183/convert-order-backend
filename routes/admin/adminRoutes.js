import express from "express";
import { addUser,getRecentUploadsPaginated} from "../../controllers/admin/adminController.js";
import { protect } from "../../middlewares/authMiddleware.js";
import { adminOnly } from "../../middlewares/roleMiddleware.js";

const router = express.Router();

router.post("/users", protect, adminOnly, addUser);
router.get(
  "/admin/uploads",
  protect,
  adminOnly,
  getRecentUploadsPaginated
);


export default router;
