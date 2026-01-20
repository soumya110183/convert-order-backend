
// Mock of cleanCustomerName from customerDetector.js
function cleanCustomerName(text) {
  if (!text) return '';
  
  let cleaned = text
    .trim()
    // Remove leading prefixes
    .replace(/^(?:M\/S|M\s+|M\.\s*|MS\s+|TO|CUSTOMER|CLIENT|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)[:\s]*/i, '')
    // Remove customer code if present
    .replace(/^[A-Z0-9]+\s*[-–]\s*/i, '')
    // Remove trailing punctuation
    .replace(/[.,;:]+$/, '')
    // Remove address indicators
    .replace(/\s*,\s*(P\.?O\.?|POST\s*BOX|BANK\s*ROAD|BUILDING).*$/i, '')
    // Remove branch indicators
    .replace(/\s*\(\s*BRANCH\s*\)/gi, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .replace(/\./g, '') // 🔥 Fix: Remove dots early
    .trim();
  
  // Title case conversion
  cleaned = cleaned
    .split(' ')
    .map(word => {
      // Keep abbreviations uppercase (2-3 letters)
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }
      // Keep if already mixed case (like Pvt, Ltd)
      if (/^[A-Z][a-z]+$/.test(word)) {
        return word;
      }
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  return cleaned;
}

// Mock of normalize from customerMatcher.js
function normalize(text = "") {
  return text
    .toUpperCase()
    .toUpperCase()
    .replace(/\./g, "") 
    .replace(/['"]/g, "") 
    .replace(/[^A-Z0-9 ]/g, " ") 
    .replace(/\b(PVT|LTD|LIMITED|PHARMA|PHARMACY|MEDICAL|DRUGS?|AGENCIES|TRADERS?|ENTERPRISES?|DISTRIBUTORS?|STORES?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Similarity logic
function stringSimilarity(a = "", b = "") {
  if (!a || !b) return 0;
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (s1 === s2) return 1;
  const words1 = new Set(s1.split(" "));
  const words2 = new Set(s2.split(" "));
  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }
  return common / Math.max(words1.size, words2.size);
}

console.log("🧪 Testing 'M Attupuram Enterprises' Fix...\n");

const tests = [
    "M Attupuram Enterprises",
    "M/S Attupuram Enterprises",
    "M. Attupuram Enterprises",
    "Attupuram Enterprises"
];

const dbCustomer = "ATTUPURAM ENTERPRISES";
const normalizedDB = normalize(dbCustomer);

console.log(`DB Customer: "${dbCustomer}" -> Normalized: "${normalizedDB}"`);

tests.forEach(input => {
    const detected = cleanCustomerName(input);
    const normalizedInput = normalize(detected);
    const score = stringSimilarity(detected, dbCustomer);
    
    console.log(`\nInput: "${input}"`);
    console.log(` -> Detected: "${detected}"`);
    console.log(` -> Normalized: "${normalizedInput}"`);
    
    if (normalizedInput === normalizedDB) {
        console.log(` ✅ MATCH: Exact Normalized Match!`);
    } else {
        console.log(` ❌ FAIL: Mismatch`);
    }
});
