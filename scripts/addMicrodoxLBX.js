import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import { splitProduct } from "../utils/splitProducts.js";

dotenv.config();

async function addMicrodoxLBX() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db");
        console.log("✅ Connected to database");

        // First check if it exists
        const existing = await ProductMaster.findOne({
            $or: [
                { productName: { $regex: "MICRODOX.*LBX", $options: "i" } },
                { productCode: /MICRODOX.*LBX/i }
            ]
        });

        if (existing) {
            console.log("✅ Product already exists:");
            console.log(`  - [${existing.productCode}] ${existing.productName}`);
            process.exit(0);
        }

        console.log("❌ MICRODOX LBX CAPSULE not found. Adding to database...");

        // Parse the product name
        const productName = "MICRODOX LBX CAPSULES";
        const { name, strength, variant } = splitProduct(productName);
        
        const cleanedProductName = [name, strength, variant]
            .filter(Boolean)
            .join(' ')
            .trim();

        const newProduct = {
            productCode: "MICRODOX-LBX-001",  // You may want to change this
            productName: productName,
            baseName: name,
            dosage: strength || null,
            variant: variant || null,
            cleanedProductName: cleanedProductName,
            division: "GTF1",  // Assuming GTF1 based on scheme data, change if needed
            pack: 10,  // Default pack size, change if needed
            boxPack: 10  // Default box pack, change if needed
        };

        const result = await ProductMaster.create(newProduct);
        
        console.log("✅ Successfully added product:");
        console.log(JSON.stringify(result, null, 2));

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

addMicrodoxLBX();
