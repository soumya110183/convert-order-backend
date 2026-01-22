
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SchemeMaster from '../models/SchemeMaster.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkSchemeCount() {
  try {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const count = await SchemeMaster.countDocuments({});
    console.log(`\n📊 Total Schemes in DB: ${count}`);

    const activeCount = await SchemeMaster.countDocuments({ isActive: true });
    console.log(`📊 Active Schemes: ${activeCount}`);

    // Check for potential duplicates or odd data
    const pipeline = [
        {
            $group: {
                _id: "$productCode",
                count: { $sum: 1 }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ];

    const duplicates = await SchemeMaster.aggregate(pipeline);
    console.log(`⚠️ Products with duplicate scheme entries: ${duplicates.length}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkSchemeCount();
