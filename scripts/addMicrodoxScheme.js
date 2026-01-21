import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

async function addMicrodoxScheme() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected\n");

        // Find MICRODOX LBX product
        const product = await ProductMaster.findOne({
            productName: { $regex: "MICRODOX.*LBX", $options: "i" }
        });

        if (!product) {
            console.error("❌ MICRODOX LBX product not found in database");
            process.exit(1);
        }

        console.log(`📦 Found product: ${product.productName} [${product.productCode}]`);
        console.log(`   Current Division: ${product.division}\n`);

        // Check if scheme already exists
        const existing = await SchemeMaster.findOne({
            productCode: product.productCode,
            division: "GTF1"
        });

        if (existing) {
            console.log("✅ Scheme already exists for GTF1 division");
            console.log(` Slabs: ${existing.slabs.length}`);
            process.exit(0);
        }

        // Add scheme from Excel data:
        // MICRODOX LBX Capsules	100	20	20%
        //                          200	40	20%
        //                          300	60	20%
        const schemeData = {
            productCode: product.productCode,
            productName: product.productName,
            division: "GTF1",  // From Excel
            slabs: [
                { minQty: 100, freeQty: 20, schemePercent: 0.20 },
                { minQty: 200, freeQty: 40, schemePercent: 0.20 },
                { minQty: 300, freeQty: 60, schemePercent: 0.20 }
            ],
            isActive: true
        };

        await SchemeMaster.create(schemeData);

        console.log("✅ Successfully added MICRODOX LBX scheme:");
        console.log(`   Division: GTF1`);
        console.log(`   Slabs:`);
        schemeData.slabs.forEach(s => {
            console.log(`     ${s.minQty}+${s.freeQty} (${s.schemePercent * 100}%)`);
        });

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

addMicrodoxScheme();
