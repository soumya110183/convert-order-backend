import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";
import { matchProductSmart } from "../services/productMatcher.js";

dotenv.config();

async function testD3Matching() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected\n");
    
    const allProducts = await ProductMaster.find().lean();
    console.log(`📦 Loaded ${allProducts.length} products\n`);
    
    console.log("🧪 D3 DROPS MATCHING TEST\n");
    console.log("=".repeat(70) + "\n");
    
    const testCases = [
        {
            extracted: "D3 DRPS 30ML",
            expected: "MICRO D3 DROPS 30ML",
            description: "Typo + missing prefix"
        },
        {
            extracted: "D3 DROPS 30ML",
            expected: "MICRO D3 DROPS 30ML",
            description: "Missing MICRO prefix only"
        },
        {
            extracted: "MICRO D3 DRPS",
            expected: "MICRO D3 DROPS 30ML",
            description: "Has MICRO but DRPS typo"
        }
    ];
    
    for (const test of testCases) {
        console.log(`Test: ${test.description}`);
        console.log(`  Extracted: "${test.extracted}"`);
        console.log(`  Expected:  "${test.expected}"`);
        
        const result = matchProductSmart(test.extracted, allProducts);
        
        if (result && result.matchedProduct) {
            console.log(`  ✅ MATCHED: ${result.matchedProduct.productName}`);
            console.log(`     Type: ${result.matchType}, Confidence: ${(result.confidence * 100).toFixed(1)}%`);
            
            if (result.matchedProduct.productName.includes("D3 DROPS") || 
                result.matchedProduct.productName.includes("D3 DROP")) {
                console.log(`     ✅ CORRECT MATCH!`);
            } else {
                console.log(`     ❌ Wrong product matched`);
            }
        } else {
            console.log(`  ❌ NO MATCH FOUND`);
            if (result && result.candidates && result.candidates.length > 0) {
                console.log(`     Top candidates:`);
                result.candidates.slice(0, 3).forEach((c, i) => {
                    console.log(`       ${i + 1}. ${c.productName} (${(c.score * 100).toFixed(1)}%)`);
                });
            }
        }
        console.log();
    }
    
    console.log("=".repeat(70));
    console.log("\n✅ Test complete!\n");
    
    process.exit(0);
}

testD3Matching().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
