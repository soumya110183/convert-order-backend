import { splitProduct } from "./utils/splitProducts.js";

const testCase = "DOLO DROPS";
console.log(`Testing splitProduct for: "${testCase}"`);

const result = splitProduct(testCase);
console.log("Result:", result);

if (!result.name) {
    console.log("❌ FAILURE: Name is empty, product would be skipped.");
} else {
    console.log("✅ SUCCESS: Name is present.");
}
