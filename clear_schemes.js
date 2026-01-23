import mongoose from "mongoose";
import SchemeMaster from "./models/schemeMaster.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db";

async function clearSchemes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    const result = await SchemeMaster.deleteMany({});
    console.log(`✅ Cleared ${result.deletedCount} scheme records.`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

clearSchemes();
