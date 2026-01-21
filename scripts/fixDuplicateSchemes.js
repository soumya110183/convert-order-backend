
import mongoose from "mongoose";
import dotenv from "dotenv";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db";

async function cleanupDuplicates() {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected.");

    const schemes = await SchemeMaster.find({});
    console.log(`📊 Found ${schemes.length} total scheme documents.`);

    const schemeMap = new Map(); // key -> [docs]

    for (const s of schemes) {
        if(!s.productCode) continue;
        const key = `${s.productCode}|${s.division || ''}`;
        if (!schemeMap.has(key)) schemeMap.set(key, []);
        schemeMap.get(key).push(s);
    }

    console.log(`🔍 Found ${schemeMap.size} unique product-division pairs.`);

    let validUpdates = 0;
    let deletedDocs = 0;

    for (const [key, docs] of schemeMap.entries()) {
        // If multiple docs, we need to merge
        if (docs.length > 1) {
            console.log(`⚠️  Found ${docs.length} DUPLICATE DOCUMENTS for ${key}. Merging...`);
            
            const [primary, ...rest] = docs;
            
            // Merge all slabs into primary
            for(const extra of rest) {
                primary.slabs.push(...extra.slabs);
                await SchemeMaster.findByIdAndDelete(extra._id);
                deletedDocs++;
            }
            // Now deduplicate primary
            await cleanScheme(primary);
        } else {
            // Just deduplicate single doc
            await cleanScheme(docs[0]);
        }
    }

    console.log(`\n✅ Cleanup complete!`); 
    console.log(`   Detailed Updates: ${validUpdates}`);
    console.log(`   Deleted Docs: ${deletedDocs}`);
    process.exit(0);

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

async function cleanScheme(scheme) {
      if (!scheme.slabs || scheme.slabs.length === 0) return;

      const originalCount = scheme.slabs.length;

      // Use a Set of strings to identify unique slabs
      const uniqueSlabs = [];
      const seen = new Set();

      for(const slab of scheme.slabs) {
          const min = Number(slab.minQty) || 0;
          const free = Number(slab.freeQty) || 0;
          const pct = Number(slab.schemePercent) || 0;
          
          const key = `${min}|${free}|${pct}`;
          
          if(!seen.has(key)) {
              seen.add(key);
              uniqueSlabs.push(slab);
          }
      }

      if (uniqueSlabs.length < originalCount) {
        scheme.slabs = uniqueSlabs;
        await scheme.save();
        console.log(`🔹 Cleaned ${scheme.productName} (${scheme.productCode}): ${originalCount} -> ${uniqueSlabs.length} slabs`);
      }
}

// remove call at bottom since I redefined it
cleanupDuplicates();
