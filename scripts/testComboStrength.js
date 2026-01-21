import { normalizeProductName, compareNormalized } from "../utils/productNormalizer.js";

console.log("\n🧪 COMBINATION STRENGTH NORMALIZATION TEST\n");
console.log("=".repeat(70) + "\n");

const testCases = [
    {
        extracted: "VILDAPRIDE-M 50/500TAB",
        database: "VILDAPRIDE-M 50 500TAB",
        shouldMatch: true
    },
    {
        extracted: "DIAPRIDE M 1/500 MG TABLETS",
        database: "DIAPRIDE M 1 500 MG TAB",
        shouldMatch: true
    },
    {
        extracted: "AMOXICILLIN 500/125MG",
        database: "AMOXICILLIN 500 125MG",
        shouldMatch: true
    },
    {
        extracted: "INSULIN 50 100 IU",  // Space separated
        database: "INSULIN 50/100 IU",    // Slash separated
        shouldMatch: true
    }
];

console.log("Testing combination strength normalization:\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    const norm1 = normalizeProductName(test.extracted);
    const norm2 = normalizeProductName(test.database);
    const similarity = compareNormalized(test.extracted, test.database);
    
    const exactMatch = norm1 === norm2;
    const fuzzyMatch = similarity >= 0.90;
    const actualMatch = exactMatch || fuzzyMatch;
    const success = actualMatch === test.shouldMatch;
    
    if (success) {
        passed++;
        console.log(`✅ Test ${i + 1}: PASS`);
    } else {
        failed++;
        console.log(`❌ Test ${i + 1}: FAIL`);
    }
    
    console.log(`   Extracted: "${test.extracted}"`);
    console.log(`   Database:  "${test.database}"`);
    console.log(`   Normalized Extracted: "${norm1}"`);
    console.log(`   Normalized Database:  "${norm2}"`);
    console.log(`   Match: ${exactMatch ? "EXACT" : fuzzyMatch ? "FUZZY" : "NO"} (${(similarity * 100).toFixed(1)}%)`);
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 SUMMARY: ${passed}/${testCases.length} passed\n`);

if (passed === testCases.length) {
    console.log("✅ All tests passed! Combination strengths normalized correctly.\n");
    console.log("Now handles:");
    console.log("  • 50/500 ↔ 50 500 ✅");
    console.log("  • 1/500 ↔ 1 500 ✅");
    console.log("  • 500/125 ↔ 500 125 ✅\n");
} else {
    console.log(`❌ ${failed} tests failed.\n`);
}
