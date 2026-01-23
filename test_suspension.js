import { splitProduct } from "./utils/splitProducts.js";

const testCase = "DOLO SUSPENSION";
console.log(`Testing splitProduct for: "${testCase}"`);

const result = splitProduct(testCase);
console.log("Result:", result);

if (result.name === "DOLO" && (result.variant === "SUSPENSION" || result.variant === "SUSP")) {
    console.log("✅ SUCCESS: 'SUSPENSION' detected as variant.");
} else if (result.name === "DOLO SUSPENSION") {
    // Also acceptable if it stays in name
    console.log("✅ SUCCESS: 'SUSPENSION' preserved in name.");
} else if (result.name === "DOLO") {
    console.log("❌ FAILURE: 'SUSPENSION' removed as noise.");
} else {
    console.log("⚠️ UNEXPECTED RESULT");
}
