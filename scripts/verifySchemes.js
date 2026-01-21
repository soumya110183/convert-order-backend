
import mongoose from "mongoose";
import dotenv from "dotenv";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

async function runVerify() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db");
        console.log("✅ Connected.");

        const schemes = await SchemeMaster.find().limit(5);
        // console.log("Example Schemes:", JSON.stringify(schemes, null, 2));

        const count = await SchemeMaster.countDocuments();
        console.log(`📊 Total Schemes in DB: ${count}`);
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

runVerify();
