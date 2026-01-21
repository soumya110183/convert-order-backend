
import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import { splitProduct } from "../utils/splitProducts.js";

dotenv.config();

function normalizeMedicalTerms(str = "") {
  return str
    .toUpperCase()
    .replace(/\bSYP\b/g, "SUSPENSION")
    .replace(/\bSUSP\b/g, "SUSPENSION")
    .replace(/\bINJ\b/g, "INJECTION")
    .replace(/\bTAB\b/g, "TABLET")
    .replace(/\bCAP\b/g, "CAPSULE");
}

function normalizeDivision(div = "") {
  return div.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    // Force UTF-8 file logging
    const fs = await import("fs");
    const util = await import("util");
    const logFile = fs.createWriteStream("debug_scheme_match_utf8.txt", { flags: "w" });
    const logStdout = process.stdout;

    console.log = function(d) {
      logFile.write(util.format(d) + "\n");
      logStdout.write(util.format(d) + "\n");
    };

    // TEST CASES from User Reports
    const testCases = [
      { name: "TORSINEX INJ", division: "CARDI-CARE" },
      { name: "APIVAS 2.5", division: "CARDI-CARE" }, // DB has CAR1
      { name: "MECONERV PLUS OD 100", division: "DTF 1" }, // DB has MECONERV PLUS OD
      { name: "DOLOWIN TAB", division: "GTF 2" }
    ];

    // Load ALL products (optimization: usually we load all in controller)
    const allProducts = await ProductMaster.find({}).lean();
    console.log(`Loaded ${allProducts.length} products`);

    for (const test of testCases) {
      console.log(`\n---------------------------------------------------`);
      console.log(`🧪 TESTING: ${test.name} (${test.division})`);
      
      const cleanProductName = test.name.replace(/\s+/g, " ").trim();
      
      // 1. Simulate Split
      const { name: baseName, strength: dosage, variant } = splitProduct(cleanProductName);
      const normDivision = normalizeDivision(test.division);
      const normBase = normalizeMedicalTerms(baseName);
      const cleanedSearchName = [baseName, dosage, variant].filter(Boolean).join(' ').trim().toUpperCase();

      console.log(`   Split -> Base: "${baseName}", Dosage: "${dosage}", Cleaned: "${cleanedSearchName}", Variant: "${variant}"`);
      console.log(`   NormBase: "${normBase}", NormDiv: "${normDivision}"`);

      // 2. Run Logic
      let matchedProduct = 
        allProducts.find(p =>
          normalizeMedicalTerms(p.cleanedProductName) === normalizeMedicalTerms(cleanedSearchName) &&
          normalizeDivision(p.division) === normDivision
        ) ||
        allProducts.find(p =>
          normalizeMedicalTerms(p.baseName) === normBase &&
          normalizeDivision(p.division) === normDivision
        ) ||
        allProducts.find(p =>
          normalizeMedicalTerms(p.cleanedProductName) === normalizeMedicalTerms(cleanedSearchName) &&
          (normalizeDivision(p.division).includes(normDivision) || normDivision.includes(normalizeDivision(p.division)))
        ) ||
        allProducts.find(p => 
           normBase.includes(normalizeMedicalTerms(p.baseName)) &&
           normalizeDivision(p.division) === normDivision &&
           p.baseName.length > 3
        );

      if (matchedProduct) {
        console.log(`✅ MATCH FOUND (Direct): ${matchedProduct.productName} (${matchedProduct.division})`);
      } else {
        console.log(`❌ DIRECT MATCH FAILED. Trying Cross-Division...`);
        
        const candidates = allProducts.filter(p => 
            normalizeMedicalTerms(p.cleanedProductName) === normalizeMedicalTerms(cleanedSearchName) ||
            normalizeMedicalTerms(p.baseName) === normBase ||
            normBase.includes(normalizeMedicalTerms(p.baseName)) ||
            // NEW PROPOSED CHECK: DB Base includes Search Base (e.g. "TORSINEX 10" includes "TORSINEX")
            normalizeMedicalTerms(p.baseName).includes(normBase)
        );

        console.log(`   Found ${candidates.length} candidates:`);
        candidates.forEach(c => console.log(`     - [${c.division}] ${c.productName} (Base: ${c.baseName})`));

        if (candidates.length > 0) {
             matchedProduct = candidates[0]; // Simplistic selection
             console.log(`✅ MATCH FOUND (Cross-Div): ${matchedProduct.productName}`);
        } else {
             console.log(`❌ NO MATCH FOUND AT ALL`);
        }
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
};

run();
