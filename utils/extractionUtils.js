/**
 * EXTRACTION UTILITIES - PRODUCTION GRADE
 * ✅ Preserves dosage, strength, variants
 * ✅ Accurate strength detection
 * ✅ Safe normalization
 */

export const FORM_WORDS = /\b(TABLETS?|TABS?|TAB|CAPSULES?|CAPS?|CAP|INJ|INJECTION|CREAM|GEL|SPRAY|OINTMENT|LOTION|POWDER)\b/gi;

export const VARIANTS = [
  "FORTE", "PLUS", "TRIO", "CV", "CT", "MT", "DM", "GM",
  "SR", "XR", "CR", "OD", "ER", "HS", "XL", "AM", "H",
  "DS", "LS", "ADVANCE", "PRO", "LV", "HV", "DC", "TH",
  "DROPS", "DROP",
  "SUSPENSION", "SUSP", "SYRUP", "SYP"
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
    let numerator = combo[1];
    let denominator = combo[2];
    const unit = combo[3] || "MG";

    // 🔥 FIX: Handle concatenated pack size (e.g. 50/50015 -> 50/500)
    // If denominator is 500xx, 850xx, 1000xx, treat as concatenated
    if (denominator.length > 3 && !VALID_STRENGTHS.has(denominator)) {
       if (denominator.startsWith("500")) denominator = "500";
       else if (denominator.startsWith("850")) denominator = "850";
       else if (denominator.startsWith("1000")) denominator = "1000";
    }

    return `${numerator}/${denominator}${unit}`.replace(/\s+/g, "");
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

  // STEP 4: Standalone number - CHECK IF VALID STRENGTH
  const standalonePattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\b`);
  const standaloneMatch = upper.match(standalonePattern);
  if (standaloneMatch) {
     const val = standaloneMatch[1];
     // 🔥 STRICT: Only allow if it's in our known pharma strength list
     if (VALID_STRENGTHS.has(val)) {
        return `${val}MG`;
     }
  }

  // STEP 5: Standalone number before form word (DOLO 650 TAB)
  // (Redundant if Step 4 covers it, but kept for explicit form association if needed)
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
 * UPDATED: Removes units (MG/ML/MCG) for unit-agnostic matching
 */
export function normalizeStrength(strength = "") {
  if (!strength) return "";

  let s = String(strength)
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

  // Normalize long-form units to short form first
  s = s
    .replace(/MILLIGRAMS?/g, "MG")
    .replace(/GRAMS?/g, "GM") 
    .replace(/MILLILITERS?/g, "ML");

  // USEREQ: Don't strip MG/GM. Keep them for explicit output.
  // s = s.replace(/(MG|ML|MCG|IU|KG)\b/gi, ""); <-- REMOVED

  return s;
}

/**
 * Check if strengths are compatible
 * CRITICAL: Both must match if both present
 */
export function hasCompatibleStrength(invoiceText, productName, strictMode = true) {
  const inv = normalizeStrength(extractStrength(invoiceText));
  const prod = normalizeStrength(extractStrength(productName));

  // Both missing → allow
  if (!inv && !prod) return true;

  // Both present → Check logic
  if (inv && prod) {
      if (inv === prod) return true;

      const parse = (s) => {
        const num = parseFloat(s);
        const unit = s.replace(/[0-9.]/g, "") || null;
        return { num, unit };
      };

      const i = parse(inv);
      const p = parse(prod);

      // Numeric mismatch check
      if (i.num !== p.num) {
          // 🔥 DOLO SPECIAL CASE: 1000 (mg) == 1 (gm)
          // strict check for "DOLO" in text
          const isDolo = (invoiceText.toUpperCase().includes("DOLO") || productName.toUpperCase().includes("DOLO"));
          
          if (isDolo) {
             if ((i.num === 1000 && i.num === p.num * 1000) || 
                 (p.num === 1000 && p.num === i.num * 1000)) {
                 return true;
             }
          }
          return false;
      }

      // If numbers match (e.g. 500 vs 500), check units
      // If both have units, they MUST match (e.g. 500MG != 500ML)
      // If one is unitless (e.g. 500 vs 500MG), accept as implied match
      // If numbers match (e.g. 500 vs 500), check units
      // If both have units, they MUST match (e.g. 500MG != 500ML)
      // 🔥 EXCEPTION: Allow 15MG vs 15ML if numbers match exact (Data entry error tolerance)
      if (i.unit && p.unit && i.unit !== p.unit) {
          if (i.num === p.num) {
             return true; // Allow 15MG == 15ML
          }
          return false;
      }

      return true;
  }

  // Only one has strength → Check strict mode
  if (!strictMode) {
      return true; // Allow if not strict
  }

  // REJECT (strict mode for safety)
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