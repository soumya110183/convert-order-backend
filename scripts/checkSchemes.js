
import mongoose from "mongoose";
import dotenv from "dotenv";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

async function checkSchemes() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db");
        
        const products = ["TORSINEX", "CARSYON", "DOLO", "EBAST"];
        
        for (const p of products) {
            const schemes = await SchemeMaster.find({ productName: { $regex: p, $options: "i" } });
            console.log(`🔍 [${p}]: Found ${schemes.length} schemes.`);
            schemes.forEach(s => console.log(`   - ${s.productName} (${s.division}): ${JSON.stringify(s.slabs)}`));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchemes();
