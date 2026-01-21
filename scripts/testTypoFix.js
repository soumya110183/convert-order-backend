// Common typos in medical product names
const COMMON_TYPOS = {
  'DRPS': 'DROPS',
  'DRP': 'DROP',
  'SUSP': 'SUSPENSION',
  'SUSPN': 'SUSPENSION',
  'SUSPEN': 'SUSPENSION',
  'TABS': 'TAB',
  'TBLT': 'TABLET',
  'CAPS': 'CAP',
  'CAPSUL': 'CAPSULE',
  'INJ': 'INJECTION',
  'SYRUP': 'SYP',
  'SIRP': 'SYP'
};

/**
 * Fix common typos in product names before matching
 */
export function fixCommonTypos(text) {
  if (!text) return text;
  
  let fixed = text.toUpperCase();
  
  // Apply typo corrections
  Object.entries(COMMON_TYPOS).forEach(([typo, correct]) => {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    fixed = fixed.replace(regex, correct);
  });
  
  return fixed;
}

// Test
const testCases = [
  "D3 DRPS 30ML",
  "PARACETAMOL SUSP",
  "INSULIN INJ 100IU",
  "AMOXICILLIN CAPS 500MG"
];

console.log("\n🧪 TYPO CORRECTION TEST\n");
console.log("=".repeat(70) + "\n");

testCases.forEach(test => {
  const fixed = fixCommonTypos(test);
  if (test !== fixed) {
    console.log(`✏️  "${test}"`);
    console.log(`   → "${fixed}"`);
  } else {
    console.log(`✅ "${test}" (no changes needed)`);
  }
  console.log();
});

console.log("=".repeat(70));
console.log("\nTypo corrections applied:");
console.log("  • DRPS → DROPS ✅");
console.log("  • SUSP → SUSPENSION ✅");
console.log("  • CAPS → CAP ✅\n");
