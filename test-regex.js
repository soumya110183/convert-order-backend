// Test the regex patterns
const text = "TAB1X102314.2030";

console.log("Original:", text);

// Current pattern
let cleaned = text;
cleaned = cleaned.replace(/([A-Z]{2,})(\d+X\d+[A-Z]?)/gi, '$1 $2');
console.log("After step 1:", cleaned);

cleaned = cleaned.replace(/([A-Z]{2,})(\d+['`"]?S)/gi, '$1 $2');
console.log("After step 2:", cleaned);

cleaned = cleaned.replace(/([A-Z]{2,})(\d{4,})/g, '$1 $2');
console.log("After step 3:", cleaned);

cleaned = cleaned.replace(/(\d{3,}\.\d{2})(\d+)/g, '$1 $2');
console.log("After step 4:", cleaned);

const tokens = cleaned.split(/\s+/);
console.log("Tokens:", tokens);

const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));
console.log("Decimal amount index:", amountIdx);
console.log("Decimal amount:", tokens[amountIdx]);
