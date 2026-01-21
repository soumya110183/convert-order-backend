import { applyScheme, findUpsellOpportunity } from './services/schemeMatcher.js';

// Mock data
const mockSchemes = [
    {
        productCode: "PROD001",
        productName: "Test Product 1",
        isActive: true,
        slabs: [{ minQty: 10, freeQty: 1, schemePercent: 10 }],
        applicableCustomers: [], // All customers
        division: "DIV1"
    },
    {
        productCode: "PROD002",
        productName: "Test Product 2",
        isActive: true,
        slabs: [{ minQty: 20, freeQty: 2, schemePercent: 10 }],
        applicableCustomers: ["CUST001"], // Only CUST001
        division: "DIV1"
    }
];

console.log("🧪 Testing Scheme Matcher...");

// Test 1: Basic Match
const res1 = applyScheme({ 
    productCode: "PROD001", 
    orderQty: 15, 
    schemes: mockSchemes,
    customerCode: "CUST999" 
});
console.log("Test 1 (Basic Match):", res1.schemeApplied ? "✅ PASS" : "❌ FAIL");

// Test 2: Case Insensitive
const res2 = applyScheme({ 
    productCode: "prod001", 
    orderQty: 15, 
    schemes: mockSchemes,
    customerCode: "CUST999"
});
console.log("Test 2 (Case Insensitive):", res2.schemeApplied ? "✅ PASS" : "❌ FAIL");

// Test 3: Customer Restriction (Fail)
const res3 = applyScheme({ 
    productCode: "PROD002", 
    orderQty: 25, 
    schemes: mockSchemes,
    customerCode: "CUST999" 
});
console.log("Test 3 (Customer Mismatch):", !res3.schemeApplied ? "✅ PASS" : "❌ FAIL");

// Test 4: Customer Restriction (Pass)
const res4 = applyScheme({ 
    productCode: "PROD002", 
    orderQty: 25, 
    schemes: mockSchemes,
    customerCode: "CUST001" 
});
console.log("Test 4 (Customer Match):", res4.schemeApplied ? "✅ PASS" : "❌ FAIL");

// Test 5: Upsell
const upsell = findUpsellOpportunity({
    productCode: "PROD001",
    orderQty: 8,
    schemes: mockSchemes,
    customerCode: "CUST999"
});
console.log("Test 5 (Upsell):", upsell && upsell.suggestedQty === 10 ? "✅ PASS" : "❌ FAIL");
