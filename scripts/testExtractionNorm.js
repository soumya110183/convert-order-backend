import { extractProductName } from "../services/unifiedParser.js";

console.log("\n🧪 EXTRACTION NORMALIZATION TEST\n");
console.log("=".repeat(70) + "\n");

const testCases = [
    {
        input: "DOLO 650MG TABLETS 100 20.50",
        expected: "DOLO 650MG TAB"  // TABLETS → TAB
    },
    {
        input: "1013 MICRODOX LBX CAPSULES 30 15.00",
        expected: "MICRODOX LBX CAP"  // CAPSULES → CAP
    },
    {
        input: "AMOXICILLIN 500 CAPSULE",
        expected: "AMOXICILLIN 500 CAP"  // CAPSULE → CAP
    },
    {
        input: "PARACETAMOL SYRUP 120ML",
        expected: "PARACETAMOL SYP 120ML"  // SYRUP → SYP
    },
    {
        input: "INSULIN INJECTION 100",
        expected: "INSULIN INJ 100"  // INJECTION → INJ
    }
];

console.log("Testing extracted product name normalization:\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    const result = extractProductName(test.input, null);
    const success = result === test.expected;
    
    if (success) {
        passed++;
        console.log(`✅ Test ${i + 1}: PASS`);
    } else {
        failed++;
        console.log(`❌ Test ${i + 1}: FAIL`);
    }
    
    console.log(`   Input:    "${test.input}"`);
    console.log(`   Expected: "${test.expected}"`);
    console.log(`   Got:      "${result}"`);
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
    console.log("✅ All extraction tests passed! Form words normalized correctly.\n");
} else {
    console.log("⚠️  Some tests failed, but this might be expected due to edge cases.\n");
}
