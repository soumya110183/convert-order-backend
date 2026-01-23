import mongoose from "mongoose";
import ProductMaster from "./models/productMaster.js";
import SchemeMaster from "./models/schemeMaster.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db";

async function checkDolo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    const code = "TLIND0001";
    
    // Check Product
    const product = await ProductMaster.findOne({ productCode: code });
    console.log("\n--- PRODUCT MASTER ---");
    if (product) {
        console.log(`Code: ${product.productCode}`);
        console.log(`Name: "${product.productName}"`);
        console.log(`Cleaned: "${product.cleanedProductName}"`);
    } else {
        console.log("❌ Product NOT FOUND");
    }

    // Check Scheme
    const schemes = await SchemeMaster.find({ productCode: code });
    console.log("\n--- SCHEME MASTER ---");
    if (schemes.length) {
        schemes.forEach((s, i) => {
            console.log(`Scheme #${i+1}: Name="${s.productName}"`);
        });
    } else {
        console.log("❌ No Schemes found for this code");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkDolo();
