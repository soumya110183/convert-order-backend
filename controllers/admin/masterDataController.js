/* =====================================================
   MASTER DATABASE UPLOAD (SINGLE EXCEL, MULTI SHEET)
   - Inserts customers/products if missing
   - Updates existing records
===================================================== */
import mongoose from "mongoose";
import XLSX from "xlsx";
import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import MasterOrder from "../../models/masterOrder.js";
import { readExcelSheets } from "../../utils/readExcels.js";
import SchemeMaster from "../../models/schemeMaster.js";
import { splitProduct } from "../../utils/splitProducts.js";


/* =====================================================
   UTILITIES
===================================================== */
function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const findSheet = (sheets, keywords) =>
  Object.entries(sheets).find(([name]) =>
    keywords.some(k => name.includes(k))
  )?.[1] || [];

const normalize = (v = "") =>
  v.toString().trim().toUpperCase();




/* =====================================================
   MASTER DATABASE UPLOAD
===================================================== */
export const uploadMasterDatabase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE_UPLOADED" });
    }

    const sheets = readExcelSheets(req.file.buffer);

    const customerRows =
      Object.entries(sheets).find(([k]) =>
        k.toLowerCase().includes("customer")
      )?.[1] || [];

    const productRows =
      Object.entries(sheets).find(([k]) =>
        k.toLowerCase().includes("sap") || k.toLowerCase().includes("product")
      )?.[1] || [];

    let inserted = { customers: 0, products: 0 };
    let updated = { customers: 0, products: 0 };

    /* ================= CUSTOMERS ================= */
    const customerOps = customerRows.map(r => {
      const customerCode = (r["customer code"] || r["code"] || r["sap code"])?.toString().trim();
      const customerType = (r["customer type"] || r["type"])?.toString().trim();
      const customerName = (r["customer name"] || r["name"])?.toString().trim();
      const address1 = r["address 1"]?.toString().trim();
      const address2 = r["address 2"]?.toString().trim();
      const address3 = r["address 3"]?.toString().trim();
      const city = r["city"]?.toString().trim();
      const pinCode = r["pin code"]?.toString().trim();
      const state = r["state"]?.toString().trim();
      const contactPerson = r["contact person"]?.toString().trim();
      const phoneNo1 = r["phone no1"]?.toString().trim();
      const phoneNo2 = r["phone no2"]?.toString().trim();
      const mobileNo = r["mobile no"]?.toString().trim();
      const drugLicNo = r["drug lic no"]?.toString().trim();
      const drugLicFromDt = r["drug lic from dt"]?.toString().trim();
      const drugLicToDt = r["drug lic to dt"]?.toString().trim();
      const drugLicNo1 = r["drug lic no1"]?.toString().trim();
      const drugLicFromDt1 = r["drug lic from dt1"]?.toString().trim();
      const drugLicToDt1 = r["drug lic to dt1"]?.toString().trim();
      const gstNo = r["gst no"]?.toString().trim();
      const email = r["e mail"]?.toString().trim();

      if (!customerCode || !customerName) return null;

      return {
        updateOne: {
          filter: { customerCode },
          update: {
            $set: {
              customerType: customerType || "",
              customerName: customerName || "",
              address1,
              address2,
              address3,
              city,
              pinCode,
              state,
              contactPerson,
              phoneNo1,
              phoneNo2,
              mobileNo,
              drugLicNo,
              drugLicFromDt,
              drugLicToDt,
              drugLicNo1,
              drugLicFromDt1,
              drugLicToDt1,
              gstNo,
              email
            }
          },
          upsert: true
        }
      };
    }).filter(Boolean);

    if (customerOps.length > 0) {
      const result = await CustomerMaster.bulkWrite(customerOps, { session });
      inserted.customers = result.upsertedCount || 0;
      updated.customers = result.modifiedCount || 0;
    }

    /* ================= PRODUCTS ================= */
    // In masterDataController.js - update product processing
// In uploadMasterDatabase function, update productOps:
const productOps = productRows.map(r => {
  const productCode = r["sap code"]?.toString().trim();
  const rawProductName = r["item desc"]?.toString().trim();
  const division = r["dvn"]?.toString().trim();

  if (!productCode || !rawProductName) return null;

  const { name, strength } = splitProduct(rawProductName);

  if (!name) {
    console.warn(`❌ Invalid product skipped: ${rawProductName}`);
    return null;
  }

  console.log(
    `📦 Parsing: "${rawProductName}" → Name: "${name}", Strength: "${strength}"`
  );
const productOps = productRows
  .map(r => {
    const productCode = r["sap code"]?.toString().trim();
    const rawProductName = r["item desc"]?.toString().trim();
    const division = r["dvn"]?.toString().trim();

    if (!productCode || !rawProductName) return null;

    const { name, strength, variant } = splitProduct(rawProductName);

    // ❗ Only skip if name itself is missing (rare)
    if (!name) {
      console.warn(`❌ Invalid product skipped: ${rawProductName}`);
      return null;
    }

    // Build safe cleaned name (NO undefined)
    const cleanedProductName = [name, strength, variant]
      .filter(Boolean)
      .join(" ");

    console.log(
      `📦 Parsing: "${rawProductName}" →`,
      `Base="${name}", Strength="${strength || "-"}", Variant="${variant || "-"}"`
    );

    return {
      updateOne: {
        filter: { productCode },
        update: {
          $set: {
            productCode,
            productName: rawProductName, // original invoice-safe name
            baseName: name,              // AMLONG
            dosage: strength || null,    // 5 / 5/25 / null
            variant: variant || null,    // HS / TRIO / INJ
            cleanedProductName,          // AMLONG 5 MT
            division: division || ""
          }
        },
        upsert: true
      }
    };
  })
  .filter(Boolean);

  return {
    updateOne: {
      filter: { productCode },
      update: {
        $set: {
          productCode,
          productName: rawProductName,
          baseName: name,
          dosage: strength,
          variant: "",
          cleanedProductName: `${name} ${strength}`,
          division: division || ""
        }
      },
      upsert: true
    }
  };
}).filter(Boolean);


    if (productOps.length) {
      const result = await ProductMaster.bulkWrite(productOps, { session });
      inserted.products = result.upsertedCount;
      updated.products = result.modifiedCount;
    }

    // Need to refresh products for scheme matching
    const allProducts = await ProductMaster.find({}).session(session).lean();

    /* ================= SCHEMES ================= */
    const schemeRows =
      Object.entries(sheets).find(([k]) =>
        k.toLowerCase().includes("scheme")
      )?.[1] || [];

    console.log(`📊 Processing ${schemeRows.length} scheme rows...`);
    
    let currentDivision = "";
    const schemeOps = [];
    let skippedSchemes = 0;

    for (const r of schemeRows) {
      // 1. Detect Division Header
      const rawRow = Object.values(r).join(' ');
      if (rawRow.toUpperCase().includes("DIVISION :")) {
        currentDivision = rawRow.split(":")[1]?.trim().toUpperCase();
        console.log(`📂 Switch Division: ${currentDivision}`);
        continue;
      }

      // 2. Skip junk/header rows
      const junkPattern = /^(NO\.?|DATE|INVOICE|BILL|GST|TOTAL|SUBTOTAL|AMOUNT|PAGE|PRODUCT|MIN QTY|FREE QTY|SCHEME)/i;
      if (junkPattern.test(rawRow)) {
        continue;
      }

      // 3. Extract scheme data using your original format
      // Looking for columns like: PRODUCT, MIN QTY, FREE QTY, SCHEME %
      const productName = r["PRODUCT"] || r["Product"] || r["product"] || 
                         r["ITEMDESC"] || r["ITEM DESC"] || r["item desc"];
      
      const rawMinQty = r["MIN QTY"] || r["MINQTY"] || r["Min Qty"] || r["min qty"];
      const rawFreeQty = r["FREE QTY"] || r["FREEQTY"] || r["Free Qty"] || r["free qty"];
      const rawSchemePercent = r["SCHEME %"] || r["SCHEME%"] || r["Scheme %"] || r["scheme %"] || 
                              r["SCHEME PERCENT"] || r["scheme percent"];

      if (!productName) continue;

      // Clean and parse product name
      const cleanProductName = productName.toString().trim();
      const { name: baseName, strength: dosage, variant } = splitProduct(cleanProductName);
      
      const minQty = Number(rawMinQty) || 0;
      const freeQty = Number(rawFreeQty) || 0;
      const schemePercent = Number(rawSchemePercent) || 0;

      if (minQty === 0 && freeQty === 0 && schemePercent === 0) {
        skippedSchemes++;
        continue;
      }

      // 4. Find matching product from master
      // Try multiple matching strategies
      let matchedProduct = null;
      
      // Strategy 1: Match by cleaned product name
      const cleanedSearchName = [baseName, dosage, variant].filter(Boolean).join(' ').trim();
      matchedProduct = allProducts.find(p => 
        p.cleanedProductName?.toUpperCase() === cleanedSearchName.toUpperCase() &&
        p.division?.toUpperCase() === currentDivision
      );

      // Strategy 2: Match by base name and dosage
      if (!matchedProduct) {
        matchedProduct = allProducts.find(p => 
          p.baseName?.toUpperCase() === baseName.toUpperCase() &&
          p.dosage === dosage &&
          p.division?.toUpperCase() === currentDivision
        );
      }

      // Strategy 3: Match by product name contains
      if (!matchedProduct) {
        matchedProduct = allProducts.find(p => 
          p.productName?.toUpperCase().includes(baseName.toUpperCase()) &&
          p.division?.toUpperCase() === currentDivision
        );
      }

      if (!matchedProduct) {
        console.warn(
          `❌ Scheme skipped – product not found: ${cleanProductName} (${currentDivision})`
        );
        skippedSchemes++;
        continue;
      }

      console.log(
        `✅ Scheme mapped: ${matchedProduct.productCode} | ${matchedProduct.productName}`
      );

      // 5. Create scheme operation
      schemeOps.push({
        updateOne: {
          filter: {
            productCode: matchedProduct.productCode,
            division: currentDivision
          },
          update: {
            $set: {
              productCode: matchedProduct.productCode,
              productName: matchedProduct.productName,
              minQty,
              freeQty,
              schemePercent,
              division: currentDivision,
              isActive: true
            }
          },
          upsert: true
        }
      });
    }

    console.log(`💾 Finalizing bulkWrite for ${schemeOps.length} schemes...`);
    console.log(`⚠️ Skipped ${skippedSchemes} schemes due to missing products`);
    
    if (schemeOps.length) {
      await SchemeMaster.bulkWrite(schemeOps, { session });
    }

    /* ✅ COMMIT TRANSACTION */
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Master database uploaded successfully",
      inserted,
      updated,
      schemesProcessed: schemeOps.length,
      schemesSkipped: skippedSchemes
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Master upload error:", err);
    res.status(500).json({ 
      error: "MASTER_UPLOAD_FAILED", 
      details: err.message 
    });
  }
};

// Helper function to extract pack size (add this outside the main function)
function extractPackSize(desc) {
  if (!desc) return null;
  
  const patterns = [
    /\((\d+)\s*['`"]?\s*S?\)/i,    // (30'S)
    /\b(\d+)\s*['`"]?\s*S\b/i,     // 30'S, 30S
    /\bPACK\s*OF\s*(\d+)\b/i,      // PACK OF 10
    /\b(\d+)\s*TABLETS?\b/i,       // 10 TABLETS
    /\b(\d+)\s*CAPSULES?\b/i       // 10 CAPSULES
  ];
  
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (match) {
      return {
        value: parseInt(match[1], 10),
        text: match[0]
      };
    }
  }
  
  return null;
}

/* =====================================================
   EXPORT MASTER DATABASE
===================================================== */
export const exportMasterDatabase = async (req, res) => {
  try {
    const customers = await CustomerMaster.find().sort({ customerCode: 1 }).lean();
    const products = await ProductMaster.find().sort({ productName: 1 }).lean();

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Customer sheet with full format
    const customerData = customers.map(c => ({
      "Code": c.customerCode || "",
      "Customer Type": c.customerType || "",
      "Customer Name": c.customerName || "",
      "Address 1": c.address1 || "",
      "Address 2": c.address2 || "",
      "Address 3": c.address3 || "",
      "City": c.city || "",
      "Pin Code": c.pinCode || "",
      "State": c.state || "",
      "Contact Person": c.contactPerson || "",
      "Phone No1": c.phoneNo1 || "",
      "Phone No2": c.phoneNo2 || "",
      "Mobile No": c.mobileNo || "",
      "Drug Lic No": c.drugLicNo || "",
      "Drug Lic From Dt": c.drugLicFromDt || "",
      "Drug Lic To Dt": c.drugLicToDt || "",
      "Drug Lic No1": c.drugLicNo1 || "",
      "Drug Lic From Dt1": c.drugLicFromDt1 || "",
      "Drug Lic To Dt1": c.drugLicToDt1 || "",
      "Gst No": c.gstNo || "",
      "E Mail": c.email || ""
    }));
    const customerSheet = XLSX.utils.json_to_sheet(customerData);
    XLSX.utils.book_append_sheet(wb, customerSheet, "customer db");

    // Product sheet
    const productData = products.map(p => ({
      "SAP Code": p.productCode,
      "Item Desc": p.productName,
      "Dvn": p.division || ""
    }));
    const productSheet = XLSX.utils.json_to_sheet(productData);
    XLSX.utils.book_append_sheet(wb, productSheet, "product db");
    const schemes = await SchemeMaster.find().sort({ productName: 1 }).lean();

    const schemeData = schemes.map(s => ({
      "Division": s.division || "",
      "Product": s.productName,
      "Min Qty": s.minQty,
      "Free Qty": s.freeQty,
      "Scheme %": s.schemePercent
    }));

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(schemeData),
      "scheme db"
    );

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=master-data-${Date.now()}.xlsx`
    );
    res.send(buffer);

  } catch (err) {
    console.error("EXPORT FAILED:", err);
    res.status(500).json({ error: "EXPORT_FAILED", details: err.message });
  }
};

/* =====================================================
   CUSTOMERS – CRUD
===================================================== */

export const getCustomers = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = req.query.search || "";

    const rawSearch = req.query.search || "";
const safeSearch = escapeRegex(rawSearch);

const query = safeSearch
  ? {
      $or: [
        { customerName: { $regex: safeSearch, $options: "i" } },
        { customerCode: { $regex: safeSearch, $options: "i" } },
        { city: { $regex: safeSearch, $options: "i" } },
        { state: { $regex: safeSearch, $options: "i" } }
      ]
    }
  : {};

    const [data, total] = await Promise.all([
      CustomerMaster.find(query)
        .sort({ customerCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      CustomerMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      total,
      page,
      limit
    });

  } catch (err) {
    console.error("GET CUSTOMERS FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_CUSTOMERS" });
  }
};


export const createCustomer = async (req, res) => {
  try {
    const {
      customerCode,
      customerType,
      customerName,
      address1,
      address2,
      address3,
      city,
      pinCode,
      state,
      contactPerson,
      phoneNo1,
      phoneNo2,
      mobileNo,
      drugLicNo,
      drugLicFromDt,
      drugLicToDt,
      drugLicNo1,
      drugLicFromDt1,
      drugLicToDt1,
      gstNo,
      email
    } = req.body;

    if (!customerCode || !customerName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await CustomerMaster.findOne({ customerCode: customerCode.trim() });

    if (exists) {
      return res.status(409).json({ error: "CUSTOMER_CODE_ALREADY_EXISTS" });
    }

    const customer = await CustomerMaster.create({
      customerCode: customerCode?.trim(),
      customerType: customerType?.trim(),
      customerName: customerName?.trim(),
      address1: address1?.trim(),
      address2: address2?.trim(),
      address3: address3?.trim(),
      city: city?.trim(),
      pinCode: pinCode?.trim(),
      state: state?.trim(),
      contactPerson: contactPerson?.trim(),
      phoneNo1: phoneNo1?.trim(),
      phoneNo2: phoneNo2?.trim(),
      mobileNo: mobileNo?.trim(),
      drugLicNo: drugLicNo?.trim(),
      drugLicFromDt: drugLicFromDt?.trim(),
      drugLicToDt: drugLicToDt?.trim(),
      drugLicNo1: drugLicNo1?.trim(),
      drugLicFromDt1: drugLicFromDt1?.trim(),
      drugLicToDt1: drugLicToDt1?.trim(),
      gstNo: gstNo?.trim(),
      email: email?.trim()
    });

    res.json({ success: true, customer });
  } catch (err) {
    console.error("CREATE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_CUSTOMER" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    const customer = await CustomerMaster.findById(id);
    if (!customer) {
      return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    }

    // Update all provided fields
    Object.keys(updateFields).forEach(key => {
      if (updateFields[key] !== undefined) {
        customer[key] = updateFields[key]?.toString().trim();
      }
    });

    await customer.save();
    res.json({ success: true, customer });
  } catch (err) {
    console.error("UPDATE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_CUSTOMER" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await CustomerMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_CUSTOMER" });
  }
};

/* =====================================================
   PRODUCTS – CRUD
===================================================== */

export const getProducts = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
  { productName: { $regex: search, $options: "i" } },
  { cleanedProductName: { $regex: search, $options: "i" } },
  { productCode: { $regex: search, $options: "i" } }
]

        }
      : {};

    const [data, total] = await Promise.all([
      ProductMaster.find(query)
        .sort({ productName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      ProductMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      total,
      page,
      limit
    });

  } catch (err) {
    console.error("GET PRODUCTS FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_PRODUCTS" });
  }
};


export const createProduct = async (req, res) => {
  try {
    const { productCode, productName, division } = req.body;

    if (!productCode || !productName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await ProductMaster.findOne({
      productCode: productCode.trim()
    });

    if (exists) {
      return res.status(409).json({ error: "PRODUCT_ALREADY_EXISTS" });
    }

const { name, strength, variant } = splitProduct(productName);

const product = await ProductMaster.create({
  productCode: productCode.trim(),
  baseName: name,
  dosage: strength || null,
  variant: variant || "",
  productName: productName.trim(),
  division: division?.trim()
});


    res.json({ success: true, product });
  } catch (err) {
    console.error("CREATE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_PRODUCT" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, division } = req.body;

    const product = await ProductMaster.findById(id);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    if (productName) product.productName = productName.trim();
    if (division !== undefined) product.division = division.trim();

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    console.error("UPDATE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_PRODUCT" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ProductMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_PRODUCT" });
  }
};

export const transferProduct = async (req, res) => {
  try {
    const { productCode, newDivision } = req.body;

    if (!productCode || !newDivision) {
      return res.status(400).json({ error: "CODE_AND_DIVISION_REQUIRED" });
    }

    const product = await ProductMaster.findOneAndUpdate(
      { productCode: productCode.trim() },
      { division: newDivision.trim() },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("TRANSFER PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_TRANSFER_PRODUCT" });
  }
};
/* =====================================================
   SCHEMES – READ ONLY (ADMIN)
===================================================== */


/* =====================================================
   GET SCHEMES (PAGINATED)
===================================================== */
export const getSchemes = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
            { schemeCode: { $regex: search, $options: "i" } },
            { schemeName: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const [data, total] = await Promise.all([
      SchemeMaster.find(query)
        .sort({ schemeCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      SchemeMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      total,
      page,
      limit
    });

  } catch (err) {
    console.error("GET SCHEMES FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_SCHEMES" });
  }
};

/* =====================================================
   CREATE SCHEME
===================================================== */
export const createScheme = async (req, res) => {
  try {
    const { schemeCode, schemeName } = req.body;

    if (!schemeCode || !schemeName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await SchemeMaster.findOne({ schemeCode });
    if (exists) {
      return res.status(409).json({ error: "SCHEME_ALREADY_EXISTS" });
    }

    const scheme = await SchemeMaster.create(req.body);
    res.json({ success: true, scheme });

  } catch (err) {
    console.error("CREATE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_SCHEME" });
  }
};

/* =====================================================
   UPDATE SCHEME
===================================================== */
export const updateScheme = async (req, res) => {
  try {
    const { id } = req.params;

    const scheme = await SchemeMaster.findById(id);
    if (!scheme) {
      return res.status(404).json({ error: "SCHEME_NOT_FOUND" });
    }

    Object.assign(scheme, req.body);
    await scheme.save();

    res.json({ success: true, scheme });

  } catch (err) {
    console.error("UPDATE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_SCHEME" });
  }
};

/* =====================================================
   DELETE SCHEME
===================================================== */
export const deleteScheme = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await SchemeMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "SCHEME_NOT_FOUND" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_SCHEME" });
  }
};