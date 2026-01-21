import { matchCustomerSmart, stringSimilarity } from "../services/customerMatcher.js";

console.log("\n🧪 CUSTOMER NAME NORMALIZATION TEST\n");
console.log("=".repeat(70) + "\n");

// Test the normalize function directly
function testNormalize(text) {
    // Copy the normalize logic from customerMatcher
    return text
        .toUpperCase()
        .replace(/[.,\-&()[\]{}'"]/g, " ")
        .replace(/\b(M\/S|M\s+S|PVT|LTD|LIMITED|PHARMA|PHARMACY|PHARMACEUTICAL|MEDICAL|MEDICALS|DRUGS?|DRUG LINES|AGENCIES|AGENCY|TRADERS?|ENTERPRISES?|DISTRIBUTORS?|DISTRIBUTOR|STORES?|CORPORATION|CORP|CO|INC|LLC|LLP|AND|THE)\b/g, "")
        .replace(/\b(EKM|PKD|TVM|KKD|CALICUT|KANNUR|ERNAKULAM|KOCHI|KERALA)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const testCases = [
    {
        invoice: "D T ASSOCIATES",
        database: "D.T.Associates",
        shouldMatch: true
    },
    {
        invoice: "DT ASSOCIATES",
        database: "D.T. Associates",
        shouldMatch: true
    },
    {
        invoice: "S.R.I. SABARI AGENCIES",
        database: "SRI SABARI AGENCIES",
        shouldMatch: true
    },
    {
        invoice: "RAJ DISTRIBUTORS,EKM",
        database: "RAJ DISTRIBUTORS, EKM",
        shouldMatch: true
    },
    {
        invoice: "K.K.M PHARMA",
        database: "KKM PHARMA",
        shouldMatch: true
    },
    {
        invoice: "THE MEDICAL STORES & CO.",
        database: "MEDICAL STORES",
        shouldMatch: true
    },
    {
        invoice: "ABC PHARMA",
        database: "XYZ MEDICAL",
        shouldMatch: false
    }
];

console.log("Testing customer name normalization:\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    const norm1 = testNormalize(test.invoice);
    const norm2 = testNormalize(test.database);
    const similarity = stringSimilarity(test.invoice, test.database);
    
    // Consider exact match if normalized names are identical
    const exactMatch = norm1 === norm2;
    // Consider fuzzy match if similarity >= 0.75
    const fuzzyMatch = similarity >= 0.75;
    
    const actualMatch = exactMatch || fuzzyMatch;
    const success = actualMatch === test.shouldMatch;
    
    if (success) {
        passed++;
        console.log(`✅ Test ${i + 1}: PASS`);
    } else {
        failed++;
        console.log(`❌ Test ${i + 1}: FAIL`);
    }
    
    console.log(`   Invoice:  "${test.invoice}"`);
    console.log(`   Database: "${test.database}"`);
    console.log(`   Normalized Invoice:  "${norm1}"`);
    console.log(`   Normalized Database: "${norm2}"`);
    console.log(`   Similarity: ${(similarity * 100).toFixed(1)}%`);
    console.log(`   Match Type: ${exactMatch ? "EXACT" : fuzzyMatch ? "FUZZY" : "NO MATCH"}`);
    console.log(`   Expected: ${test.shouldMatch ? "MATCH" : "NO MATCH"}`);
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
    console.log("✅ All customer normalization tests passed!\n");
    console.log("Production-ready fixes:");
    console.log("  • D T ASSOCIATES = D.T.Associates ✅");
    console.log("  • S.R.I. SABARI = SRI SABARI ✅");
    console.log("  • RAJ DISTRIBUTORS,EKM = RAJ DISTRIBUTORS ✅");
    console.log("  • K.K.M = KKM ✅\n");
} else {
    console.log("⚠️  Some tests failed.\n");
}
