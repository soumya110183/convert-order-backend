import { matchCustomerSmart } from "../services/customerMatcher.js";

console.log("\n🧪 LOWERCASE CUSTOMER NAME TEST\n");
console.log("=".repeat(70) + "\n");

// Simulate database customers (as stored)
const mockCustomers = [
    { customerName: "D.T.Associates", customerCode: "CUST001" },
    { customerName: "S.R.I. SABARI AGENCIES", customerCode: "CUST002" },
    { customerName: "RAJ DISTRIBUTORS, EKM", customerCode: "CUST003" },
];

// Test cases: Various case variations
const testCases = [
    {
        invoiceName: "d.t.associates",                   // all lowercase
        expectedMatch: "D.T.Associates"
    },
    {
        invoiceName: "D.t.Associates",                   // mixed case
        expectedMatch: "D.T.Associates"
    },
    {
        invoiceName: "d t associates",                   // lowercase no dots
        expectedMatch: "D.T.Associates"
    },
    {
        invoiceName: "sri sabari agencies",              // all lowercase
        expectedMatch: "S.R.I. SABARI AGENCIES"
    },
    {
        invoiceName: "S.r.i. Sabari Agencies",           // mixed case
        expectedMatch: "S.R.I. SABARI AGENCIES"
    },
    {
        invoiceName: "raj distributors,ekm",             // lowercase
        expectedMatch: "RAJ DISTRIBUTORS, EKM"
    }
];

console.log("Testing case-insensitive customer matching:\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}: "${test.invoiceName}"`);
    
    const result = matchCustomerSmart(test.invoiceName, mockCustomers);
    
    if (result.auto && result.auto.customerName === test.expectedMatch) {
        passed++;
        console.log(`✅ MATCHED: ${result.auto.customerName}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    } else {
        failed++;
        console.log(`❌ FAILED`);
        if (result.auto) {
            console.log(`   Got: ${result.auto.customerName}`);
        } else {
            console.log(`   No match found`);
        }
        console.log(`   Expected: ${test.expectedMatch}`);
    }
    
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 RESULTS: ${passed}/${testCases.length} passed\n`);

if (passed === testCases.length) {
    console.log("✅ ALL TESTS PASSED! Case-insensitive matching works.\n");
    console.log("Now handles:");
    console.log("  • d.t.associates ✅");
    console.log("  • D.t.Associates ✅");
    console.log("  • sri sabari agencies ✅");
    console.log("  • raj distributors,ekm ✅\n");
} else {
    console.log(`❌ ${failed} tests failed.\n`);
}
