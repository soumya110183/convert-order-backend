
import { matchCustomerSmart, stringSimilarity } from './services/customerMatcher.js';

console.log("🧪 Testing Customer Matching Logic...\n");

const customers = [
    { customerName: "SRI SABARI AGENCIES" },
    { customerName: "PVT LTD COMPANY" },
    { customerName: "K.P. ENTERPRISES" }
];

const testCases = [
    { input: "s.r.i sabari agencies", expected: "SRI SABARI AGENCIES" },
    { input: "S.R.I SABARI", expected: "SRI SABARI AGENCIES" },
    { input: "pvt. ltd. company", expected: "PVT LTD COMPANY" },
    { input: "k.p enterprises", expected: "K.P. ENTERPRISES" } 
    // Note: K.P. might be stored as KP or K.P. in DB. 
    // If DB has "K.P.", then "K.P" -> "KP". 
    // Let's check how "K.P. ENTERPRISES" normalizes.
];

console.log("Database:");
customers.forEach(c => console.log(` - ${c.customerName}`));
console.log("\nTests:");

testCases.forEach(({ input, expected }) => {
    const result = matchCustomerSmart(input, customers);
    const matched = result.auto ? result.auto.customerName : "❌ NO MATCH";
    const status = matched === expected ? "✅ PASS" : "❌ FAIL";
    
    console.log(`${status} Input: "${input}"`);
    console.log(`       Matched: "${matched}" (Conf: ${result.confidence.toFixed(2)})`);
    console.log(`       Source: ${result.source}`);
    if (matched !== expected) {
        console.log(`       Expected: "${expected}"`);
    }
    console.log("---");
});
