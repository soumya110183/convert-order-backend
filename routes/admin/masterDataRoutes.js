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
  getSchemes,
  createScheme,
  updateScheme,
  deleteScheme,
  uploadCustomerMaster,
  uploadProductMaster,
  uploadSchemeMaster,
  exportCustomers,
  exportProducts,
  exportSchemes,
  getDivisions
} from "../../controllers/admin/masterDataController.js";
import { protect, adminOnly } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// All routes require login; only write operations require admin
router.use(protect);
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return adminOnly(req, res, next);
  }
  next();
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.originalname.match(/\.(xls|xlsx|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel or CSV files allowed for master data"));
    }
  }
});

// =====================================================
// MASTER DATABASE ROUTES
// =====================================================

// Upload master database (3-sheet Excel file)
router.post("/master/upload", upload.single("file"), uploadMasterDatabase);

// Export master database
router.get("/master/export", exportMasterDatabase);

// Get unique divisions
router.get("/master/divisions", getDivisions);

// =====================================================
// CUSTOMER ROUTES
// =====================================================

// Get all customers (with pagination and search)
router.get("/customers", getCustomers);

// Create a new customer
router.post("/customers", createCustomer);

// Update a customer
router.put("/customers/:id", updateCustomer);

// Delete a customer
router.delete("/customers/:id", deleteCustomer);

// =====================================================
// PRODUCT ROUTES
// =====================================================

// Get all products (with pagination and search)
router.get("/products", getProducts);

// Create a new product
router.post("/products", createProduct);

// Update a product
router.put("/products/:id", updateProduct);

// Delete a product
router.delete("/products/:id", deleteProduct);

// Transfer product to new division
router.patch("/products/transfer", transferProduct);

router.get("/schemes", getSchemes);
router.post("/schemes", createScheme);
router.put("/schemes/:id", updateScheme);
router.delete("/schemes/:id", deleteScheme);

router.post("/customers/upload", upload.single("file"), uploadCustomerMaster);
router.get("/customers/export", exportCustomers);

router.post("/products/upload", upload.single("file"), uploadProductMaster);
router.get("/products/export", exportProducts);

router.post("/schemes/upload", upload.single("file"), uploadSchemeMaster);
router.get("/schemes/export", exportSchemes);

export default router;

