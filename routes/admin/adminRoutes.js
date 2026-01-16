import express from "express";
import { getRecentUploadsPaginated,updateCustomer,updateProduct} from "../../controllers/admin/adminController.js";
import { protect } from "../../middlewares/authMiddleware.js";
import { adminOnly } from "../../middlewares/roleMiddleware.js";

const router = express.Router();


router.get(
  "/uploads",
  protect,
  adminOnly,
  getRecentUploadsPaginated
);
router.put("/customers/:id", updateCustomer);
router.put("/products/:id", updateProduct);



export default router;
