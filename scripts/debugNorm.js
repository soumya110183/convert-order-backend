console.log("\n🔍 DEBUG: Customer Normalization Output\n");
console.log("=".repeat(70) + "\n");

function normalize(text = "") {
  if (!text) return "";
  
  let normalized = text.toUpperCase();
  
  // STEP 1: Remove punctuation (but preserve word boundaries)
  normalized = normalized
    .replace(/[.,\-&()[\]{}'"]/g, " ")  // Replace with space
    .replace(/\s+/g, " ")                // Compress spaces
    .trim();
  
  // STEP 2: Remove M/S prefix
  normalized = normalized.replace(/^M\s*\/\s*S\s+/i, "");
  normalized = normalized.replace(/^M\s+S\s+/i, "");
  
  // STEP 3: Remove location suffixes (only at end)
  normalized = normalized.replace(/\s+(EKM|PKD|TVM|KKD|CALICUT|KANNUR|ERNAKULAM|KOCHI|KERALA)\s*$/i, "");
  
  // STEP 4: Remove trailing business structure words (only at end)
  normalized = normalized.replace(/\s+(PVT\s+LTD|PRIVATE\s+LIMITED|LIMITED|LTD|LLP|LLC|INC|CORP|CORPORATION|CO)\s*$/i, "");
  
  // STEP 5: Clean up
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

const tests = [
    "D T ASSOCIATES",
    "D.T.Associates",
    "SRI SABARI AGENCIES",
    "S.R.I. SABARI AGENCIES",
    "RAJ DISTRIBUTORS,EKM",
    "RAJ DISTRIBUTORS, EKM",
    "KKM PHARMA",
    "K.K.M PHARMA"
];

tests.forEach(test => {
    const result = normalize(test);
    console.log(`Input:  "${test}"`);
    console.log(`Output: "${result}"`);
    console.log();
});
