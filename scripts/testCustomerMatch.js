import { matchCustomerSmart } from "../services/customerMatcher.js";

console.log("\n🧪 CUSTOMER MATCHING TEST - D T ASSOCIATES Issue\n");
console.log("=".repeat(70) + "\n");

// Simulate database customers
const mockCustomers = [
    { customerName: "D.T.Associates", customerCode: "CUST001" },
    { customerName: "S.R.I. SABARI AGENCIES", customerCode: "CUST002" },
    { customerName: "RAJ DISTRIBUTORS, EKM", customerCode: "CUST003" },
    { customerName: "K.K.M PHARMA", customerCode: "CUST004" },
];

// Test cases: Invoice extracted names
const testCases = [
    {
        invoiceName: "D T ASSOCIATES",
        expectedMatch: "D.T.Associates"
    },
    {
        invoiceName: "SRI SABARI AGENCIES",
        expectedMatch: "S.R.I. SABARI AGENCIES"
    },
    {
        invoiceName: "RAJ DISTRIBUTORS,EKM",
        expectedMatch: "RAJ DISTRIBUTORS, EKM"
    },
    {
        invoiceName: "KKM PHARMA",
        expectedMatch: "K.K.M PHARMA"
    }
];

console.log("Testing customer matching with punctuation variations:\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}: "${test.invoiceName}"`);
    
    const result = matchCustomerSmart(test.invoiceName, mockCustomers);
    
    if (result.auto && result.auto.customerName === test.expectedMatch) {
        passed++;
        console.log(`✅ MATCHED: ${result.auto.customerName}`);
        console.log(`   Match Type: ${result.source}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    } else if (result.auto) {
        failed++;
        console.log(`❌ WRONG MATCH: ${result.auto.customerName}`);
        console.log(`   Expected: ${test.expectedMatch}`);
    } else {
        failed++;
        console.log(`❌ NO MATCH`);
        console.log(`   Expected: ${test.expectedMatch}`);
        if (result.candidates && result.candidates.length > 0) {
            console.log(`   Top candidate: ${result.candidates[0].customer.customerName} (${(result.candidates[0].score * 100).toFixed(1)}%)`);
        }
    }
    
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 RESULTS: ${passed}/${testCases.length} passed\n`);

if (passed === testCases.length) {
    console.log("✅ ALL TESTS PASSED! Customer matching is production-ready.\n");
    console.log("Now handles:");
    console.log("  • D T ASSOCIATES ↔ D.T.Associates ✅");
    console.log("  • SRI SABARI ↔ S.R.I. SABARI ✅");
    console.log("  • RAJ DISTRIBUTORS,EKM ↔ RAJ DISTRIBUTORS, EKM ✅");
    console.log("  • KKM ↔ K.K.M ✅\n");
} else {
    console.log(`⚠️  ${failed} tests failed - normalization may need adjustment.\n`);
}
