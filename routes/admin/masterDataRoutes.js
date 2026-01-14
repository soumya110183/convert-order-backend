import express from "express";
import multer from "multer";
import {
  uploadCustomers,
  uploadProducts,
  addCustomer,
  addProduct,
  transferProduct
} from "../../controllers/admin/masterDataController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/customers/upload", upload.single("file"), uploadCustomers);
router.post("/products/upload", upload.single("file"), uploadProducts);

router.post("/customers/add", addCustomer);
router.post("/products/add", addProduct);
router.patch("/products/transfer", transferProduct);

export default router;
