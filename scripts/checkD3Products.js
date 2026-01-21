import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";

dotenv.config();

async function checkD3Product() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Search for D3 products
    const d3Products = await ProductMaster.find({
        productName: /D3/i
    }).lean();
    
    console.log("\n📋 D3 Products in database:\n");
    d3Products.forEach(p => {
        console.log(`  • ${p.productName} (${p.division})`);
    });
    
    console.log(`\n✅ Total D3 products: ${d3Products.length}\n`);
    
    // Check exact match
    const exact = await ProductMaster.findOne({
        productName: /MICRO D3 DRPS/i
    }).lean();
    
    if (exact) {
        console.log(`✅ Found exact match: "${exact.productName}"\n`);
    } else {
        console.log(`⚠️  "MICRO D3 DRPS" not found in exact form\n`);
    }
    
    process.exit(0);
}

checkD3Product().catch(console.error);
