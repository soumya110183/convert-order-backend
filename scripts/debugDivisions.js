
import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";

dotenv.config();

const run = async () => {
  try {
    const fs = await import("fs");
    const util = await import("util");
    const logFile = fs.createWriteStream("debug_output_utf8.txt", { flags: "w" });
    const logStdout = process.stdout;

    console.log = function(d) {
      logFile.write(util.format(d) + "\n");
      logStdout.write(util.format(d) + "\n");
    };

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    // 1. List all Divisions
    const divisions = await ProductMaster.distinct("division");
    console.log("\n📂 ALL DIVISIONS IN DB:", divisions);

    // 2. Check specific missing products
    const sampleProducts = [
      "TORSINEX", "APIVAS", "EBAST", "ETIZEP", "GRAMOCEF", 
      "MICROBACT", "MICRODOX", "PULMUCUS", "SILYBON", 
      "BIPACEF", "MECONERV", "DOLOWIN", "TOLPA", "VONACID",
      "BIOFER", "BONMIN", "LINOSEPT", "RABIROS"
    ];

    console.log("\n🔍 SEARCHING FOR SAMPLE PRODUCTS:");
    for (const term of sampleProducts) {
      const results = await ProductMaster.find({ 
        productName: { $regex: term, $options: "i" } 
      }).select("productName division productCode baseName dosage").lean();
      
      if (results.length > 0) {
        console.log(`\nFound ${term}:`);
        results.forEach(p => console.log(`   - [${p.division}] ${p.productName} (Base: ${p.baseName}, Dosage: ${p.dosage})`));
      } else {
        console.log(`\n❌ ${term} NOT FOUND in DB`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
};

run();
