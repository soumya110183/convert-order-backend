
import { matchProductSmart } from "./services/productMatcher.js";
import { extractQuantity } from "./services/unifiedParser.js";
import { extractStrength } from "./utils/extractionUtils.js";

function testMapping() {
    console.log("=== TESTING PRODUCT MAPPING (DOLO DROPS vs DOLO 650) ===");
    
    const invoiceItem = "DOLO DROPS";
    const products = [
        { productName: "DOLO 650", _id: "1" },
        { productName: "DOLO 500", _id: "2" }
    ];

    console.log(`Invoice Item: "${invoiceItem}"`);
    console.log(`Candidate: "${products[0].productName}"`);
    console.log(`Extracted Strength (Inv):`, extractStrength(invoiceItem));
    console.log(`Extracted Strength (Prod):`, extractStrength(products[0].productName));

    const result = matchProductSmart(invoiceItem, products);
    console.log("Match Result:", result ? result.productName : "NO MATCH");
}

function testQuantity() {
    console.log("\n=== TESTING QUANTITY EXTRACTION ===");
    
    // Scenario 1: Amount picked as Quantity?
    // Assuming format: Qty Rate Amount
    const lines = [
        "DOLO 650 10 50.00 500.00", // Standard: 10 qty, 500.00 amount
        "DOLO 650 500.00",         // Missing qty? 500.00 amount. Should return null or NOT 500.
        "DOLO 650 500",            // Amount 500 (no decimals?). Should NOT return 500.
    ];

    lines.forEach(line => {
        console.log(`Line: "${line}" -> Qty:`, extractQuantity(line));
    });
}

testMapping();
testQuantity();
