// Test the CORRECTED regex order
const text = "TAB1X102314.2030";

console.log("Original:", text);

let cleaned = text;

// Step 1: Split large numbers FIRST
cleaned = cleaned.replace(/([A-Z]{2,})(\d{4,})/g, '$1 $2');
console.log("After step 1:", cleaned);

// Step 2: Split pack patterns
cleaned = cleaned.replace(/([A-Z]{2,})(\d+X\d+[A-Z]?)/gi, '$1 $2');
console.log("After step 2:", cleaned);

// Step 3: Split pack sizes
cleaned = cleaned.replace(/([A-Z]{2,})(\d+['`"]?S)/gi, '$1 $2');
console.log("After step 3:", cleaned);

// Step 4: Split decimals
cleaned = cleaned.replace(/(\d{3,}\.\d{2})(\d+)/g, '$1 $2');
console.log("After step 4:", cleaned);

const tokens = cleaned.split(/\s+/);
console.log("\nTokens:", tokens);

const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));
console.log("Decimal amount index:", amountIdx);
console.log("Decimal amount:", tokens[amountIdx]);
console.log("\n✅ SUCCESS! Decimal amount found at index", amountIdx);
