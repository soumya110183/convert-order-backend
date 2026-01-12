/**
 * Database Index Cleanup Script
 * Run this once to remove old/invalid indexes
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function cleanupIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("masterorders");

    // Get all indexes
    const indexes = await collection.indexes();
    console.log("\n📋 Current indexes:");
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, idx.key);
    });

    // Drop the problematic dedupKey index if it exists
    try {
      await collection.dropIndex("dedupKey_1");
      console.log("\n✅ Dropped old dedupKey_1 index");
    } catch (err) {
      if (err.code === 27) {
        console.log("\n✅ dedupKey_1 index doesn't exist (already clean)");
      } else {
        throw err;
      }
    }

    console.log("\n✅ Index cleanup complete!");
    process.exit(0);

  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  }
}

cleanupIndexes();
