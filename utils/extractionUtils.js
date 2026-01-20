/**
 * EXTRACTION UTILITIES - PRODUCTION GRADE
 * ✅ Preserves dosage, strength, variants
 * ✅ Accurate strength detection
 * ✅ Safe normalization
 */

export const FORM_WORDS = /\b(TABLETS?|TABS?|TAB|CAPSULES?|CAPS?|CAP|INJ|INJECTION|SYRUP|SYP|SUSPENSION|SUSP|DROPS?|CREAM|GEL|SPRAY|OINTMENT|LOTION|POWDER)\b/gi;

export const VARIANTS = [
  "FORTE", "PLUS", "TRIO", "CV", "CT", "MT", "DM", "GM",
  "SR", "XR", "CR", "OD", "ER", "HS", "XL", "AM", "H",
  "DS", "LS", "ADVANCE", "PRO", "LV", "HV", "DC", "TH"
];

// Valid pharma strengths (prevents false positives)
const VALID_STRENGTHS = new Set([
  "0.2", "0.25", "0.3", "0.5", "1", "2", "2.5", "5", "10", "15", "20", "25",
  "30", "40", "50", "60", "75", "80", "100", "120", "150", "200", "250", "300",
  "325", "400", "500", "625", "650", "750", "875", "1000", "1500", "2000"
]);

/**
 * Extract strength/dosage from text
 * Handles: Combo (50/500), Unit (500MG), Decimal (2.5MG), Standalone (650)
 */
export function extractStrength(text) {
  if (!text) return null;

  const upper = text.toUpperCase();

  // STEP 1: Combo dosage (875/125, 50/500, 12.5/500, 10/5)
  const combo = upper.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(MG|ML|MCG)?\b/);
  if (combo) {
    const unit = combo[3] || "MG";
    return `${combo[1]}/${combo[2]}${unit}`.replace(/\s+/g, "");
  }

  // STEP 2: Number + Unit (500MG, 2.5MG, 10ML) - HIGHEST CONFIDENCE
  const withUnit = upper.match(/\b(\d+(?:\.\d+)?)\s*(MG|ML|MCG|GM|G|IU|KG)\b/);
  if (withUnit) {
    return `${withUnit[1]}${withUnit[2]}`.replace(/\s+/g, "");
  }

  // STEP 3: Decimal before form word (2.5 TAB, 0.25 CAPSULE)
  const decimalForm = upper.match(/\b(\d+\.\d+)\s*(TAB|TABS|TABLET|CAP|CAPS|CAPSULE)\b/);
  if (decimalForm) {
    return `${decimalForm[1]}MG`;
  }

  // STEP 4: Standalone number before form word (DOLO 650 TAB)
  const standalone = upper.match(/\b(\d+)\s*(TAB|TABS|TABLET|CAP|CAPS|CAPSULE)\b/);
  if (standalone && VALID_STRENGTHS.has(standalone[1])) {
    return `${standalone[1]}MG`;
  }

  // STEP 5: Number followed by variant (METAPRO 50 SR, AVAS 40)
  const variantPattern = new RegExp(`\\b(\\d+)\\s+(${VARIANTS.join('|')})\\b`, 'i');
  const variantMatch = upper.match(variantPattern);
  if (variantMatch && VALID_STRENGTHS.has(variantMatch[1])) {
    return `${variantMatch[1]}MG`;
  }

  return null;
}

/**
 * Normalize strength for comparison
 */
export function normalizeStrength(strength = "") {
  if (!strength) return "";

  let s = String(strength)
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

  // Add MG if only number
  if (/^\d+(?:\.\d+)?$/.test(s) && VALID_STRENGTHS.has(s)) {
    s += "MG";
  }

  // Normalize units
  s = s
    .replace(/MILLIGRAMS?/g, "MG")
    .replace(/GRAMS?/g, "G")
    .replace(/MILLILITERS?/g, "ML");

  return s;
}

/**
 * Check if strengths are compatible
 * CRITICAL: Both must match if both present
 */
export function hasCompatibleStrength(invoiceText, productName) {
  const inv = normalizeStrength(extractStrength(invoiceText));
  const prod = normalizeStrength(extractStrength(productName));

  // Both missing → allow
  if (!inv && !prod) return true;

  // Both present → MUST match exactly
  if (inv && prod) return inv === prod;

  // Only one has strength → REJECT (strict mode for accuracy)
  return false;
}

/**
 * Normalize text for comparison
 */
export function normalize(text = "") {
  if (typeof text !== "string") {
    if (text === null || text === undefined) return "";
    text = String(text);
  }

  return text
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "") // remove unicode
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract base name (remove strength, forms, variants)
 */
export function extractBaseName(text = "") {
  if (!text) return "";

  let base = text.toUpperCase();

  // Remove strength patterns
  base = base.replace(/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s*(?:MG|ML|MCG)?/g, " ");
  base = base.replace(/\d+(?:\.\d+)?\s*(?:MG|ML|MCG|GM|G|IU|KG)/g, " ");

  // Remove form words
  base = base.replace(FORM_WORDS, " ");

  // Remove pack info
  base = base.replace(/\d+\s*['"`]?\s*S\b/gi, " ");
  base = base.replace(/\(\s*\d+\s*['"`]?\s*S\s*\)/gi, " ");

  // Clean up
  base = base.replace(/\s+/g, " ").trim();

  return base;
}

/**
 * Test strength extraction
 */
export function testStrengthExtraction() {
  const tests = [
    { input: "METAPRO 50MG TAB", expected: "50MG" },
    { input: "DOLO 650 TABLETS", expected: "650MG" },
    { input: "AMLONG 2.5 TABLETS", expected: "2.5MG" },
    { input: "DIAPRIDE M 500/1000", expected: "500/1000MG" },
    { input: "TURBOVAS 10", expected: "10MG" },
    { input: "AVAS 40", expected: "40MG" },
    { input: "METAPRO 50 SR", expected: "50MG" },
    { input: "DOLO-650 TABS", expected: "650MG" }
  ];

  console.log("\n🧪 TESTING STRENGTH EXTRACTION\n");

  tests.forEach((t, i) => {
    const result = extractStrength(t.input);
    const pass = result === t.expected;

    console.log(`Test ${i + 1}: ${pass ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Input:    ${t.input}`);
    console.log(`Expected: ${t.expected}`);
    console.log(`Got:      ${result}\n`);
  });
}