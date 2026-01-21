import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

async function checkMicrodox() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected\n");

        // Find MICRODOX products
        const products = await ProductMaster.find({
            $or: [
                { productName: { $regex: "MICRODOX", $options: "i" } },
                { baseName: { $regex: "MICRODOX", $options: "i" } }
            ]
        }).lean();

        console.log(`📦 Found ${products.length} MICRODOX products:\n`);
        
        for (const p of products) {
            console.log(`[${p.productCode}] ${p.productName}`);
            console.log(`  Division: ${p.division}`);
            console.log(`  Base Name: ${p.baseName}`);
            
            // Check if this product has schemes
            const schemes = await SchemeMaster.find({
                productCode: p.productCode
            }).lean();
            
            if (schemes.length > 0) {
                console.log(`  ✅ HAS SCHEMES: ${schemes.length}`);
                schemes.forEach(s => {
                    console.log(`     Division: ${s.division}, Slabs: ${s.slabs.length}`);
                    s.slabs.forEach(slab => {
                        console.log(`       ${slab.minQty}+${slab.freeQty} (${slab.schemePercent * 100}%)`);
                    });
                });
            } else {
                console.log(`  ❌ NO SCHEMES`);
            }
            console.log();
        }

        // Also check if scheme exists for "MICRODOX LBX Capsules" name
        console.log(`\n🔍 Checking for exact scheme match: "MICRODOX LBX CAPSULES"\n`);
        const schemeByName = await SchemeMaster.find({
            productName: { $regex: "MICRODOX.*LBX", $options: "i" }
        }).lean();
        
        console.log(`Found ${schemeByName.length} schemes matching MICRODOX LBX`);

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkMicrodox();
