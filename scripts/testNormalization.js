import { normalizeProductName, compareNormalized } from "../utils/productNormalizer.js";

console.log("\n🧪 FORM WORD NORMALIZATION TEST\n");
console.log("=".repeat(70) + "\n");

const testCases = [
    {
        extracted: "DOLO 650MG TABLET",
        database: "DOLO 650MG TAB",
        shouldMatch: true
    },
    {
        extracted: "AMOXICILLIN 500 capsule",
        database: "AMOXICILLIN 500 CAP",
        shouldMatch: true
    },
    {
        extracted: "MICRODOX LBX Capsules",
        database: "MICRODOX LBX CAPSULE",
        shouldMatch: true
    },
    {
        extracted: "DOLO TABS 650MG",
        database: "DOLO TAB 650MG",
        shouldMatch: true
    },
    {
        extracted: "insulin injection 100 iu",
        database: "INSULIN INJ 100 IU",
        shouldMatch: true
    },
    {
        extracted: "PARACETAMOL SYRUP 120ML",
        database: "PARACETAMOL SYP 120ML",
        shouldMatch: true
    },
    {
        extracted: "DOLO 650MG TAB",
        database: "DOLO 500MG TAB",
        shouldMatch: false  // Different strength
    }
];

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    const norm1 = normalizeProductName(test.extracted);
    const norm2 = normalizeProductName(test.database);
    const similarity = compareNormalized(test.extracted, test.database);
    
    // Consider it a match if similarity > 0.90
    const actualMatch = similarity >= 0.90;
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
    console.log(`   Normalized 1: "${norm1}"`);
    console.log(`   Normalized 2: "${norm2}"`);
    console.log(`   Similarity: ${(similarity * 100).toFixed(1)}%`);
    console.log(`   Expected: ${test.shouldMatch ? "MATCH" : "NO MATCH"}`);
    console.log(`   Result: ${actualMatch ? "MATCH" : "NO MATCH"}`);
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
    console.log("✅ All normalization tests passed! Production-ready.\n");
} else {
    console.log("❌ Some tests failed. Needs attention.\n");
}
