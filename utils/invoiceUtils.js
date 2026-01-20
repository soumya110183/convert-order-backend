/**
 * INVOICE UTILITIES - PRODUCTION SAFE
 * ✅ Never removes dosage or strength
 * ✅ Only strips distributor noise
 * ✅ Preserves product identity
 */

import { extractStrength } from "./extractionUtils.js";

const VALID_STRENGTHS = new Set([
  "0.2", "0.25", "0.3", "0.5", "1", "2", "2.5", "5", "10", "15", "20", "25",
  "30", "40", "50", "60", "75", "80", "100", "120", "150", "200", "250", "300",
  "325", "400", "500", "625", "650", "750", "875", "1000", "1500", "2000"
]);

/**
 * Check if a number is a real pharma strength
 */
function isRealStrength(num) {
  return VALID_STRENGTHS.has(String(num));
}

/**
 * Strip leading distributor codes and noise ONLY
 * PRESERVES: Product name, strength, variants, forms
 */
export function stripLeadingCodes(text = "") {
  if (!text) return "";

  let cleaned = text.toUpperCase().trim();

  // STEP 1: Remove MICRO prefix (MICRO1, MICRO2, MICRO)
  cleaned = cleaned.replace(/^MICRO\d*\s+/g, "");

  // STEP 2: Remove distributor phrases
  // Pattern: "MICRO CARDICARE RAJ DIST 1657"
  cleaned = cleaned.replace(
    /^(MICRO\s+)?[A-Z\s\-()]+?\b(RAJ|DIST|DISTRIBUTOR|DISTRIBUT)\b[\s\-()]*\d*\s+/gi,
    ""
  );

  // STEP 3: Remove product codes ONLY if followed by letters
  // SAFE: Won't remove "650" from "DOLO 650"
  cleaned = cleaned.replace(/\b(PROD\d{4,6})\b\s+/g, "");
  cleaned = cleaned.replace(/^\d{4,6}\s+(?=[A-Z]{3,})/g, "");

  // STEP 4: Remove leftover RAJ/DIST
  cleaned = cleaned.replace(/\b(RAJ|DIST(RI(BUT)?)?)\b/gi, " ");

  // STEP 5: Clean spacing
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Clean invoice description for matching
 * PRESERVES: Name, strength, dosage, variants, forms
 */

function normalizeForMatch(text = "") {
  return text
    .toUpperCase()
    // distributor noise
    .replace(/\b(MICR|MICRO|RAJ|DIST)\b/g, " ")
    // normalize strength
    .replace(/(\d+)\s*MG\s*\/\s*(\d+)\s*MG/g, "$1/$2")
    .replace(/(\d+)\s*MG/g, "$1")
    // normalize forms
    .replace(/\bTABLETS?\b/g, "TAB")
    .replace(/\bTABS?\b/g, "TAB")
    .replace(/\bCAPSULES?\b/g, "CAP")
    .replace(/\bCAPS?\b/g, "CAP")
    // remove pack
    .replace(/\(\s*\d+\s*['"`]?\s*S\s*\)/g, " ")
    .replace(/\b\d+\s*['"`]?\s*S\b/g, " ")
    // normalize symbols
    .replace(/[-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export function cleanInvoiceDesc(text = "") {
  if (!text) return "";

  // STEP 1: Strip distributor noise
  let cleaned = stripLeadingCodes(text);

  // STEP 2: Remove pack info ONLY (10'S, 30S, etc.)
  cleaned = cleaned.replace(/\(\s*\d+\s*['"`]?\s*S\s*\)/gi, " ");
  cleaned = cleaned.replace(/\b\d+\s*['"`]?\s*S\b/gi, " ");

  // STEP 3: Preserve hyphenated strength (DOLO-650)
  cleaned = cleaned.replace(/(\b[A-Z]+)\s*-\s*(\d{2,4})\b/g, "$1-$2");

  // STEP 4: Final cleanup
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Extract product code from text (if present)
 */
export function extractProductCode(text = "") {
  if (!text) return null;

  // Pattern: PROD1234 or standalone 4-6 digit code
  const match = text.match(/\bPROD(\d{4,6})\b/);
  if (match) return match[1];

  // Loose match (but avoid strengths)
  const loose = text.match(/\b\d{4,6}\b/);
  if (loose && !isRealStrength(loose[0])) {
    return loose[0];
  }

  return null;
}

/**
 * Test invoice cleaning
 */
export function testInvoiceClean() {
  const tests = [
    {
      input: "MICRO1 MICRO CARDICARE RAJ DIST 1657 METAPRO 50MG TAB",
      expected: "METAPRO 50MG TAB"
    },
    {
      input: "MICRO1 MICRO DTF RAJ DIST 14926 DIAPRIDE 1MG TABS",
      expected: "DIAPRIDE 1MG TABS"
    },
    {
      input: "MICRO LABS LIMITED RAJ 883 DOLO-650 TABS",
      expected: "DOLO-650 TABS"
    },
    {
      input: "MICRO CARDICARE RAJ DIST METXL 25 SR TAB",
      expected: "METXL 25 SR TAB"
    },
    {
      input: "AMLONG - 5 TABLETS (30'S)",
      expected: "AMLONG - 5 TABLETS"
    },
    {
      input: "DOLO 650 TABS (10S)",
      expected: "DOLO 650 TABS"
    }
  ];

  console.log("\n🧪 TESTING INVOICE CLEANING\n");

  tests.forEach((t, i) => {
    const result = cleanInvoiceDesc(t.input);
    const pass = result === t.expected;

    console.log(`Test ${i + 1}: ${pass ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Input:    ${t.input}`);
    console.log(`Expected: ${t.expected}`);
    console.log(`Got:      ${result}\n`);
  });
}