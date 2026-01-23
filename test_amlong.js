import { splitProduct } from "./utils/splitProducts.js";

const testCase = "AMLONG 2.5";
console.log(`Testing splitProduct for: "${testCase}"`);

const result = splitProduct(testCase);
console.log("Result:", result);

if (result.name === "AMLONG 2.5" && result.strength === "2.5") {
    console.log("❌ FAILURE: Strength found but not removed from name (Duplicate will occur)");
} else if (result.name === "AMLONG" && result.strength === "2.5") {
    console.log("✅ SUCCESS: Strength correctly removed from name");
} else {
    console.log("⚠️ UNEXPECTED RESULT");
}
