
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import { uploadMasterDatabase } from "../controllers/admin/masterDataController.js";

dotenv.config();

// Mock req, res
const req = {
    file: {
        buffer: fs.readFileSync("test-files/Database.xls"),
        originalname: "Database.xls"
    }
};

const res = {
    status: (code) => ({
        json: (data) => {
            console.log(`[STATUS ${code}]`, JSON.stringify(data, null, 2));
            if(code === 500) {
                 fs.writeFileSync("import_error.log", JSON.stringify(data, null, 2));
            }
        }
    }),
    json: (data) => console.log(`[SUCCESS]`, JSON.stringify(data, null, 2))
};

async function runImport() {
    try {
        console.log("⏳ Connecting to DB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db");
        console.log("✅ Connected.");

        await uploadMasterDatabase(req, res);
        
        console.log("✅ Import script finished.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        fs.writeFileSync("import_error_toplevel.log", err.toString() + "\n" + err.stack);
        process.exit(1);
    }
}

runImport();
