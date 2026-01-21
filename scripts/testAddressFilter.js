import { detectCustomerFromInvoice } from "../services/customerDetector.js";

console.log("\n🧪 ADDRESS LINE FILTERING TEST\n");
console.log("=".repeat(70) + "\n");

// Simulate Excel file content (each cell becomes a line)
const excelLines = [
    "D T ASSOCIATES",
    "Pharmaceutical Distributors, 11/267(5),new No41/685,tailor Street,palakkad",
    "41685,Pajar Street,PALAKKAD. 678001",
    "DL No:KL/PKD/27/1862",
    "GSTIN: 32AABFD7882A1Z2",
    "",
    "PURCHASE ORDER",
    "Order No : 802",
    "Company RAJ DISTRIBUTORS,EKM"
];

console.log("Test Excel content (cells as lines):\n");
excelLines.forEach((line, i) => {
    console.log(`${i + 1}. "${line}"`);
});

console.log("\n" + "=".repeat(70) + "\n");
console.log("Running customer detection...\n");

const customerName = detectCustomerFromInvoice(excelLines);

console.log("\n" + "=".repeat(70) + "\n");

if (customerName) {
    console.log(`✅ DETECTED: "${customerName}"\n`);
    
    // Check if it's correct (should be "D T ASSOCIATES" not the address)
    const isAddress = /\d+\/\d+/.test(customerName) || /Street|Road/i.test(customerName);
    
    if (isAddress) {
        console.log("❌ WRONG! Detected an address line instead of company name\n");
    } else {
        console.log("✅ CORRECT! Company name detected (not address)\n");
        console.log("Expected: D T ASSOCIATES or similar");
        console.log(`Got: ${customerName}\n`);
    }
} else {
    console.log("❌ NO CUSTOMER DETECTED\n");
}
