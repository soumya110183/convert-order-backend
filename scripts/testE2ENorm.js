import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import { extractProductName } from "../services/unifiedParser.js";
import { matchProductSmart } from "../services/productMatcher.js";

dotenv.config();

async function testEndToEnd() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected\n");
    
    const allProducts = await ProductMaster.find().lean();
    console.log(`📦 Loaded ${allProducts.length} products from database\n`);
    
    console.log("🧪 END-TO-END NORMALIZATION TEST\n");
    console.log("=".repeat(70) + "\n");
    
    // Test cases: Extracted product names with different form word variations
    const testCases = [
        {
            raw: "50 DOLO 650  TABLETS 100 20.50",
            description: "TABLETS (plural form)"
        },
        {
            raw: "MICRODOX LBX capsule 30",
            description: "capsule (lowercase)"
        },
        {
            raw: "402 EBAST DC TABLET 10mg",
            description: "TABLET (singular)"
        },
        {
            raw: "PARACETAMOL CAPS 500MG",
            description: "CAPS (abbreviation)"
        }
    ];
    
    console.log("Testing form word variation handling:\n");
    
    for (const test of testCases) {
        console.log(`Test: ${test.description}`);
        console.log(`Raw:  "${test.raw}"`);
        
        // Step 1: Extract
        const extracted = extractProductName(test.raw, null);
        console.log(`Extracted: "${extracted}"`);
        
        // Step 2: Match
        const match = matchProductSmart(extracted, allProducts);
        
        if (match) {
            console.log(`✅ MATCHED: ${match.productName}`);
            console.log(`   Confidence: ${(match.confidence * 100).toFixed(1)}%`);
            console.log(`   Match Type: ${match.matchType}`);
        } else {
            console.log(`❌ NO MATCH FOUND`);
        }
        
        console.log();
    }
    
    console.log("=".repeat(70));
    console.log("\n✅ End-to-end test complete!\n");
    console.log("📋 Summary:");
    console.log("   - Extraction normalizes: TABLETS→TAB, capsule→CAP, etc.");
    console.log("   - Matching handles case variations automatically");
    console.log("   - Database products are case-insensitive matched\n");
    
    process.exit(0);
}

testEndToEnd().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
