
import { matchCustomerSmart, stringSimilarity } from "../services/customerMatcher.js";

const mockDB = [
    { customerName: "AYYAPPA DISTRIBUTORS" },
    { customerName: "AYYAPPA MEDICALS" },
    { customerName: "SREE AYYAPPA TRADERS" },
    { text: "RANDOM PHARMA" }
];

const input = "AYYAPPA ENTERPRISES";

console.log(`\n🔍 Input: "${input}"`);
console.log("---------------------------------------------------");

const result = matchCustomerSmart(input, mockDB);

console.log(`Match Status: ${result.source}`);
console.log(`Confidence: ${result.confidence.toFixed(2)}`);
console.log("\nCandidates:");
result.candidates.forEach(c => {
    console.log(`- "${c.customer.customerName}" (Score: ${c.score.toFixed(2)})`);
});

// Debug core similarity
console.log("\n--- Debug Similarity ---");
const target = "AYYAPPA DISTRIBUTORS";
console.log(`"${input}" vs "${target}" -> Score: ${stringSimilarity(input, target)}`);
