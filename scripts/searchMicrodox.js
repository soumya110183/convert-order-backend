import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";

dotenv.config();

async function searchProduct() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db");
        console.log("✅ Connected to database");

        // Search for MICRODOX
        const products = await ProductMaster.find({
            $or: [
                { productName: { $regex: "MICRODOX", $options: "i" } },
                { productCode: { $regex: "MICRODOX", $options: "i" } },
                { baseName: { $regex: "MICRODOX", $options: "i" } }
            ]
        });

        console.log(`\n🔍 Found ${products.length} products matching 'MICRODOX':`);
        products.forEach(p => {
            console.log(`  - [${p.productCode}] ${p.productName} (${p.division})`);
        });

        // Specific search for LBX
        const lbxProduct = await ProductMaster.findOne({
            productName: { $regex: "MICRODOX.*LBX", $options: "i" }
        });

        if (lbxProduct) {
            console.log("\n✅ MICRODOX LBX found:");
            console.log(JSON.stringify(lbxProduct, null, 2));
        } else {
            console.log("\n❌ MICRODOX LBX CAPSULE not found in database");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

searchProduct();
