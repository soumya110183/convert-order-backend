import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import { readExcel } from "../../utils/readExcels.js";

/* =====================================================
   CUSTOMER UPLOAD (EXCEL)
===================================================== */
export const uploadCustomers = async (req, res) => {
  try {
    console.log("📥 Received customer upload request");
    if (!req.file) {
      console.warn("⚠️ No file provided in customer upload");
      return res.status(400).json({ error: "NO_FILE_UPLOADED" });
    }

    const rows = readExcel(req.file.buffer);
    console.log(`📊 Processing ${rows.length} rows from Excel`);

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      const code = String(r["Customer ID"] || "").trim();
      const name = String(r["Customer Name"] || "").trim();

      if (!name) {
        skipped++;
        continue;
      }

      try {
        const exists = await CustomerMaster.findOne({
          $or: [{ customerCode: code }, { customerName: name }]
        });

        if (exists) {
          skipped++;
          continue;
        }

        await CustomerMaster.create({
          customerCode: code || undefined,
          customerName: name
        });

        console.log(`✅ Created customer: ${name} (${code || "No Code"})`);
        inserted++;
      } catch (rowErr) {
        console.error(`❌ Error processing customer row: ${name}`, rowErr.message);
        skipped++;
      }
    }

    console.log(`🏁 Customer upload complete: ${inserted} inserted, ${skipped} skipped`);
    res.json({
      success: true,
      inserted,
      skipped
    });
  } catch (err) {
    console.error("❌ Critical Customer upload error:", err);
    res.status(500).json({ 
      error: "CUSTOMER_UPLOAD_FAILED",
      details: err.message 
    });
  }
};

/* =====================================================
   PRODUCT UPLOAD (EXCEL)
===================================================== */
export const uploadProducts = async (req, res) => {
  try {
    console.log("📥 Received product upload request");
    if (!req.file) {
      console.warn("⚠️ No file provided in product upload");
      return res.status(400).json({ error: "NO_FILE_UPLOADED" });
    }

    const rows = readExcel(req.file.buffer);
    console.log(`📊 Processing ${rows.length} rows for products from Excel`);

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      const code = String(r["Product ID"] || "").trim();
      const name = String(r["Product Name"] || "").trim();
      const division = String(r["Division"] || "").trim();

      if (!code || !name) {
        skipped++;
        continue;
      }

      try {
        const exists = await ProductMaster.findOne({ productCode: code });
        if (exists) {
          skipped++;
          continue;
        }

        await ProductMaster.create({
          productCode: code,
          productName: name,
          division
        });

        console.log(`✅ Created product: ${name} (${code})`);
        inserted++;
      } catch (rowErr) {
        console.error(`❌ Error processing product row: ${name}`, rowErr.message);
        skipped++;
      }
    }

    console.log(`🏁 Product upload complete: ${inserted} inserted, ${skipped} skipped`);
    res.json({
      success: true,
      inserted,
      skipped
    });
  } catch (err) {
    console.error("❌ Critical Product upload error:", err);
    res.status(500).json({ 
      error: "PRODUCT_UPLOAD_FAILED",
      details: err.message 
    });
  }
};

/* =====================================================
   ADD CUSTOMER (MANUAL)
===================================================== */
export const addCustomer = async (req, res) => {
  const { customerCode, customerName } = req.body;
  try {
    console.log(`👤 Manual add customer request: ${customerName}`);

    if (!customerName) {
      return res.status(400).json({ error: "CUSTOMER_NAME_REQUIRED" });
    }

    const exists = await CustomerMaster.findOne({
      $or: [
        ...(customerCode ? [{ customerCode: customerCode.trim() }] : []),
        { customerName: customerName.trim() }
      ]
    });

    if (exists) {
      console.warn(`⚠️ Customer already exists: ${customerName}`);
      return res.status(409).json({ error: "CUSTOMER_ALREADY_EXISTS" });
    }

    const customer = await CustomerMaster.create({
      customerCode: customerCode?.trim(),
      customerName: customerName.trim()
    });

    console.log(`✅ Manually added customer: ${customerName}`);
    res.json({ success: true, customer });
  } catch (err) {
    console.error("❌ Manual add customer error:", err);
    res.status(500).json({ 
      error: "FAILED_TO_ADD_CUSTOMER",
      details: err.message 
    });
  }
};

/* =====================================================
   ADD PRODUCT (MANUAL)
===================================================== */
export const addProduct = async (req, res) => {
  const { productCode, productName, division } = req.body;
  try {
    console.log(`📦 Manual add product request: ${productName} (${productCode})`);

    if (!productCode || !productName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await ProductMaster.findOne({ productCode: productCode.trim() });
    if (exists) {
      console.warn(`⚠️ Product already exists: ${productCode}`);
      return res.status(409).json({ error: "PRODUCT_ALREADY_EXISTS" });
    }

    const product = await ProductMaster.create({
      productCode: productCode.trim(),
      productName: productName.trim(),
      division: division?.trim()
    });

    console.log(`✅ Manually added product: ${productName}`);
    res.json({ success: true, product });
  } catch (err) {
    console.error("❌ Manual add product error:", err);
    res.status(500).json({ 
      error: "FAILED_TO_ADD_PRODUCT",
      details: err.message 
    });
  }
};

/* =====================================================
   TRANSFER PRODUCT DIVISION
===================================================== */
export const transferProduct = async (req, res) => {
  const { productCode, newDivision } = req.body;
  try {
    console.log(`🔄 Transfer request: ${productCode} to division ${newDivision}`);

    if (!productCode || !newDivision) {
      return res.status(400).json({ error: "CODE_AND_DIVISION_REQUIRED" });
    }

    const product = await ProductMaster.findOneAndUpdate(
      { productCode: productCode.trim() },
      { division: newDivision.trim() },
      { new: true }
    );

    if (!product) {
      console.warn(`⚠️ Transfer failed: Product ${productCode} not found`);
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    console.log(`✅ Product ${productCode} transferred to ${newDivision}`);
    res.json({ success: true, product });
  } catch (err) {
    console.error("❌ Transfer error:", err);
    res.status(500).json({ 
      error: "TRANSFER_FAILED",
      details: err.message 
    });
  }
};
