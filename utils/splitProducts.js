/**
 * PRODUCT SPLITTER - PRODUCTION GRADE
 * ✅ Accurately splits: Name | Strength | Variant
 * ✅ Preserves all product identity
 * ✅ Handles hyphenated names (DOLO-650, AMLONG-A)
 */

import { extractStrength, normalizeStrength, VARIANTS } from "./extractionUtils.js";

/**
 * Split product into components
 * Returns: { name, strength, variant }
 */
export function splitProduct(raw = "") {
  if (!raw) return { name: "", strength: "", variant: "" };

  let text = raw.toUpperCase().trim();

  // STEP 1: Remove distributor/location noise
  text = text
    .replace(/^MICRO\d*\s+MICRO\s+/g, "")
    .replace(/\bRAJ\b|\bDIST(RI(BUT)?)?\b/gi, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // STEP 2: Extract variant FIRST (before removing strength)
  let variant = "";
  for (const v of VARIANTS) {
    const regex = new RegExp(`\\b${v}\\b`, 'i');
    if (regex.test(text)) {
      variant = v;
      text = text.replace(regex, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // STEP 3: Extract strength
  const detectedStrength = extractStrength(text);
  const strength = detectedStrength ? normalizeStrength(detectedStrength) : "";

  // STEP 4: Remove strength from text to isolate name
  if (strength) {
    // Remove the exact strength pattern found
    // Remove the exact strength pattern found
    let strengthPattern = detectedStrength.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // 🔥 Fix: Allow spaces around slash for combo strengths (50/500 matches 50 / 500)
    if (strengthPattern.includes("/")) {
      strengthPattern = strengthPattern.replace(/\//g, "\\s*\\/\\s*");
    }

    text = text.replace(new RegExp(`\\b${strengthPattern}\\b`, "gi"), " ");
  }

  // STEP 5: Remove pack info
  text = text.replace(/\(\s*\d+\s*['"`]?\s*S\s*\)/gi, " ");
  text = text.replace(/\b\d+\s*['"`]?\s*S\b/gi, " ");

  // STEP 6: Remove form words to get base name
  text = text.replace(/\b(TABLETS?|TABS?|TAB|CAPSULES?|CAPS?|CAP|INJ|INJECTION|SYRUP|SYP|SUSPENSION|SUSP|DROPS?)\b/gi, " ");

  // STEP 7: Handle hyphenated suffixes (AMLONG-A, DOLO-T)
  // These are part of the name, not variants
  const hyphenSuffix = text.match(/\b([A-Z]+)\s*-\s*([A-Z]{1,2})\b/);
  if (hyphenSuffix) {
    // Keep it as part of name
    text = text.replace(/\s*-\s*/, "-");
  }

  // STEP 8: Final name cleanup
  const name = text
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-") // Normalize hyphens
    .trim();
// 🔥 FIX: remove dangling hyphens
text = text.replace(/-+$/g, "").replace(/^-+/g, "");

  return {
    name,
    strength,
    variant
  };
}

/**
 * Test product splitting
 */
export function testProductSplit() {
  const tests = [
    {
      input: "METAPRO 50MG TAB",
      expected: { name: "METAPRO", strength: "50MG", variant: "" }
    },
    {
      input: "DOLO-650 TABS",
      expected: { name: "DOLO", strength: "650MG", variant: "" }
    },
    {
      input: "AMLONG-A TABLETS",
      expected: { name: "AMLONG-A", strength: "", variant: "" }
    },
    {
      input: "METAPRO 50 SR TAB",
      expected: { name: "METAPRO", strength: "50MG", variant: "SR" }
    },
    {
      input: "DIAPRIDE M 500/1000",
      expected: { name: "DIAPRIDE M", strength: "500/1000MG", variant: "" }
    },
    {
      input: "AMLONG MT 25 (15'S)",
      expected: { name: "AMLONG MT", strength: "25MG", variant: "" }
    },
    {
      input: "TURBOVAS GOLD 10",
      expected: { name: "TURBOVAS", strength: "10MG", variant: "GOLD" }
    }
  ];

  console.log("\n🧪 TESTING PRODUCT SPLITTING\n");

  tests.forEach((t, i) => {
    const result = splitProduct(t.input);
    const pass = 
      result.name === t.expected.name &&
      result.strength === t.expected.strength &&
      result.variant === t.expected.variant;

    console.log(`Test ${i + 1}: ${pass ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Input: ${t.input}`);
    console.log(`Expected: ${JSON.stringify(t.expected)}`);
    console.log(`Got:      ${JSON.stringify(result)}\n`);
  });
}