import mongoose from "mongoose";
import ProductMaster from "./models/productMaster.js";
import SchemeMaster from "./models/schemeMaster.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db";

async function syncSchemes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    // 1. Fetch all Products Map
    console.log("Fetching Product Master...");
    const products = await ProductMaster.find({}).lean();
    const productMap = new Map(); // Code -> Name
    products.forEach(p => {
        if (p.productCode) {
            productMap.set(p.productCode, p.productName);
        }
    });
    console.log(`Loaded ${productMap.size} products.`);

    // 2. Fetch all Schemes
    console.log("Fetching Scheme Master...");
    const schemes = await SchemeMaster.find({}).lean();
    console.log(`Loaded ${schemes.length} schemes.`);

    // 3. Update Stale Names
    let updatedCount = 0;
    const bulkOps = [];

    for (const scheme of schemes) {
        const correctName = productMap.get(scheme.productCode);
        
        if (correctName && scheme.productName !== correctName) {
            // Add update op
            bulkOps.push({
                updateOne: {
                    filter: { _id: scheme._id },
                    update: { $set: { productName: correctName } }
                }
            });
            updatedCount++;
        }
    }

    if (bulkOps.length > 0) {
        console.log(`Syncing ${updatedCount} records...`);
        const result = await SchemeMaster.bulkWrite(bulkOps);
        console.log(`✅ Update Complete. Modified: ${result.modifiedCount}`);
    } else {
        console.log("✅ All records are already in sync.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

syncSchemes();
