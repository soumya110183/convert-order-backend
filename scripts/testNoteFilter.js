// Test note line filtering
const testLines = [
    "DOLO 650MG TAB",                                    // Valid product
    "NOTE KINDLY SEND UMBRELLA FOR DOLO 650 TAB",      // Note - should be filtered
    "NOTE: URGENT DELIVERY REQUIRED",                   // Note - should be filtered
    "KINDLY SEND SAMPLES",                              // Instruction - should be filtered
    "PLEASE PROVIDE DISCOUNT",                          // Request - should be filtered
    "REMARK: CHECK EXPIRY DATE",                        // Remark - should be filtered
    "AMOXICILLIN 500MG CAP",                            // Valid product
    "SEND PROMOTIONAL ITEMS WITH ORDER",                // Instruction - should be filtered
];

const HARD_JUNK_PATTERNS = [
  /^(PAGE|PRINTED\s*BY|SIGNATURE|PREPARED\s*BY|CHECKED\s*BY)/i,
  /^(GSTIN|DL\s*NO|FSSAI|LICENSE\s*NO)/i,
  /^(PIN\s*CODE|PHONE|EMAIL|FAX)/i,
  /^(NOTE|REMARK|COMMENT|KINDLY|PLEASE|REQUEST)[\s:]/i,
  /^-+$/,
  /^_+$/,
  /^=+$/,
];

const INVALID_PRODUCT_PATTERNS = [
  /^TAB\s*\d+$/i,
  /^CAP\s*\d+$/i,
  /^SYP\s*\d+$/i,
  /^SEND\s+/i,
  /^KINDLY\s+/i,
  /^PLEASE\s+/i,
  /^NOTE[\s:]/i,
  /^REMARK[\s:]/i,
  /^\d+\s*TAB$/i,
  /^\d+\s*CAP$/i,
];

function isHardJunk(text) {
  const upper = text.toUpperCase();
  return HARD_JUNK_PATTERNS.some(p => p.test(upper));
}

function isInvalidProductName(text) {
  if (!text) return true;
  const cleaned = text.trim().toUpperCase();
  return INVALID_PRODUCT_PATTERNS.some(pattern => pattern.test(cleaned));
}

console.log("\n🧪 NOTE LINE FILTERING TEST\n");
console.log("=".repeat(70) + "\n");

let validProducts = 0;
let filteredNotes = 0;

testLines.forEach((line, i) => {
    const isJunk = isHardJunk(line);
    const isInvalid = isInvalidProductName(line);
    const filtered = isJunk || isInvalid;
    
    if (filtered) {
        filteredNotes++;
        console.log(`❌ FILTERED: "${line}"`);
        console.log(`   Reason: ${isJunk ? "Hard junk" : "Invalid product name"}`);
    } else {
        validProducts++;
        console.log(`✅ VALID PRODUCT: "${line}"`);
    }
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 SUMMARY:`);
console.log(`   ✅ Valid products: ${validProducts}`);
console.log(`   ❌ Filtered notes/junk: ${filteredNotes}\n`);

const success = validProducts === 2 && filteredNotes === 6;
if (success) {
    console.log("✅ All note lines correctly filtered!\n");
    console.log("Now filters:");
    console.log("  • NOTE KINDLY SEND... ✅");
    console.log("  • NOTE: ... ✅");
    console.log("  • KINDLY... ✅");
    console.log("  • PLEASE... ✅");
    console.log("  • REMARK: ... ✅");
    console.log("  • SEND... ✅\n");
} else {
    console.log("❌ Some filtering issues detected\n");
}
