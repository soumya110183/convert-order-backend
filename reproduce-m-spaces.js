
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
    .replace(/\./g, '') 
    .trim();
  
  // Title case conversion
  cleaned = cleaned
    .split(' ')
    .map(word => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      if (/^[A-Z][a-z]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  return cleaned;
}

const input = "M                              ATTUPURAM ENTERPRISES";
console.log(`Original: "${input}"`);

const cleaned = cleanCustomerName(input);
console.log(`Cleaned:  "${cleaned}"`);

if (cleaned === "ATTUPURAM ENTERPRISES" || cleaned === "Attupuram Enterprises") {
    console.log("✅ SUCCESS: 'M' removed correctly");
} else {
    console.log("❌ FAILURE: 'M' NOT removed");
}

// Test with Tab just in case
const inputTab = "M\t\t\tATTUPURAM ENTERPRISES";
console.log(`\nOriginal (Tabs): "${inputTab.replace(/\t/g, '\\t')}"`);
console.log(`Cleaned:  "${cleanCustomerName(inputTab)}"`);
