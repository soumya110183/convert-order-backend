import express from "express";
import multer from "multer";

import {
  uploadMasterDatabase,
  exportMasterDatabase,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  transferProduct,

} from "../../controllers/admin/masterDataController.js";

import { getAdminDashboard, getAuditHistory } from "../../controllers/admin/adminController.js";



const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.originalname.match(/\.(xls|xlsx)$/i)) cb(null, true);
    else cb(new Error("Only Excel files allowed"));
  }
});

/* MASTER DB */
router.post("/upload", upload.single("file"), uploadMasterDatabase);
router.get("/export", exportMasterDatabase);
router.get("/dashboard", getAdminDashboard);
router.get("/audits", getAuditHistory); // ✅ Fixed missing route

/* CUSTOMERS */
router.get("/customers", getCustomers);
router.post("/customers", createCustomer);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);

/* PRODUCTS */
router.get("/products", getProducts);
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);
router.patch("/products/transfer", transferProduct);

export default router;