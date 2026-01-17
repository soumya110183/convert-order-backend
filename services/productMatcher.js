/**
 * PRODUCT MATCHER – PRODUCTION GRADE
 * Pharma-safe, noise-tolerant, audit-friendly
 */

import { splitProduct } from "../utils/splitProducts.js";

/* =====================================================
   NORMALIZATION HELPERS
===================================================== */

function normalize(text = "") {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9+/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBase(text = "") {
  return normalize(text)
    .replace(
      /\b(TABLETS?|TABS?|CAPS?|CAPSULES?|SYRUP|SUSPENSION|INJ|INJECTION|SPRAY|DROPS?|CREAM|GEL)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariant(v = "") {
  return normalize(v)
    .replace(/\b30SR\b/g, "SR")
    .replace(/\bSUSTAINED\s*RELEASE\b/g, "SR")
    .replace(/\bCONTROLLED\s*RELEASE\b/g, "CR")
    .replace(/\bEXTENDED\s*RELEASE\b/g, "XR")
    .replace(/\bPLUS\b/g, "+")
    .trim();
}

/* =====================================================
   JUNK LINE FILTER
===================================================== */

function isHardJunkLine(text = "") {
  const t = text.toUpperCase();
  return (
    t.length < 6 ||
    /^APPROX\s*VALUE/i.test(t) ||
    /^MICRO\s*\(/i.test(t) ||
    /^PRINTED\s+BY/i.test(t) ||
    /^SUPPLIER\s*:/i.test(t) ||
    /^GSTIN/i.test(t) ||
    /^DL\s*NO/i.test(t) ||
    /^PAGE\s+\d+/i.test(t)
  );
}

/* =====================================================
   PACK REMOVAL
===================================================== */

function removePackSize(desc = "") {
  return normalize(desc)
    .replace(/\(\s*\d+\s*['`"]?\s*S\s*\)/gi, "")
    .replace(/\b\d+\s*['`"]?\s*S\b(?!\s*MG|\s*GM|\s*ML)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =====================================================
   DOSAGE NORMALIZATION
===================================================== */

function normalizeDosageToMg(value = "") {
  if (!value) return null;

  const text = normalize(value).replace(/\s+/g, "");

  // Combo dose → return normalized string
  if (text.includes("/")) {
    return text
      .split("/")
      .map(v => normalizeDosageToMg(v))
      .filter(Boolean)
      .join("/");
  }

  const m = text.match(/([\d.]+)(MG|GM|G|MCG|IU)?/);
  if (!m) return null;

  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;

  const unit = m[2] || "MG";

  switch (unit) {
    case "MCG": return num / 1000;
    case "MG": return num;
    case "G":
    case "GM": return num * 1000;
    case "IU": return num;
    default: return num;
  }
}

/* =====================================================
   MATCHING CONFIG
===================================================== */

const MATCH_THRESHOLD = 0.55;
const KNOWN_PRODUCTS = ["DOLO", "SILYBON", "EBAST", "MICRODOX", "AMLONG"];

/* =====================================================
   CORE MATCHER
===================================================== */

export function matchProductSmart(invoiceDesc, products) {
  if (!invoiceDesc || !products?.length) return null;
  if (isHardJunkLine(invoiceDesc)) return null;

  const cleaned = removePackSize(invoiceDesc);
  const invoiceParts = splitProduct(cleaned);

  let bestMatch = null;
  let bestScore = 0;

  for (const product of products) {
    let score = 0;

    const productName = removePackSize(product.productName || "");
    const productParts = splitProduct(productName);

    const baseInv = normalizeBase(invoiceParts.name || "");
    const baseProd = normalizeBase(product.baseName || productParts.name || "");

    const invDose = normalizeDosageToMg(invoiceParts.strength);
    const prodDose = normalizeDosageToMg(product.dosage || productParts.strength);

    const invVar = normalizeVariant(invoiceParts.variant || "");
    const prodVar = normalizeVariant(product.variant || productParts.variant || "");

    /* ---------- BASE NAME ---------- */
    if (baseInv && baseProd) {
      if (baseInv === baseProd) score += 0.45;
      else if (baseInv.includes(baseProd) || baseProd.includes(baseInv)) score += 0.35;
      else {
        const iw = baseInv.split(" ");
        const pw = baseProd.split(" ");
        const common = iw.filter(w => pw.includes(w));
        if (!common.length) continue;
        score += (common.length / Math.max(iw.length, pw.length)) * 0.3;
      }
    }

    /* ---------- DOSAGE ---------- */
   /* ---------- DOSAGE (STRICT) ---------- */
if (invDose && prodDose) {
  // combo doses must match exactly (e.g. 50/500)
  if (typeof invDose === "string" || typeof prodDose === "string") {
    if (invDose !== prodDose) continue; // 🚫 HARD REJECT
  } else {
    if (invDose !== prodDose) continue; // 🚫 HARD REJECT
  }

  // exact match only
  score += 0.35;
}

// invoice has dose but product doesn't → reject
if (invDose && !prodDose) {
  continue;
}

/* ---------- FORM / VARIANT SAFETY ---------- */
const LIQUID_FORMS = ["SYP", "SYRUP", "DROPS"];

if (invVar && prodVar) {
  const invIsLiquid = LIQUID_FORMS.includes(invVar);
  const prodIsLiquid = LIQUID_FORMS.includes(prodVar);

  if (invIsLiquid !== prodIsLiquid) {
    continue; // 🚫 tablet must NOT match syrup
  }
}


    /* ---------- VARIANT ---------- */
    if (invVar && prodVar) {
      if (invVar === prodVar) score += 0.2;
      else if (invVar.includes(prodVar) || prodVar.includes(invVar)) score += 0.15;
    }

    /* ---------- BRAND BOOST ---------- */
    if (KNOWN_PRODUCTS.some(k => baseProd.includes(k))) {
      score += 0.1;
    }

    /* ---------- FINAL ---------- */
    if (score >= MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestMatch = {
        ...product,
        confidence: Number(score.toFixed(2)),
        matchedParts: invoiceParts
      };
    }
  }

  /* ---------- BASE-NAME FALLBACK ---------- */
  if (!bestMatch && invoiceParts.name) {
    const fallback = products.find(p =>
      normalizeBase(p.baseName || "").includes(normalizeBase(invoiceParts.name))
    );

    if (fallback) {
      return {
        ...fallback,
        confidence: 0.51,
        forced: true,
        matchedParts: invoiceParts
      };
    }
  }

  return bestMatch;
}

/* =====================================================
   OPTIONAL INDEXER (FUTURE USE)
===================================================== */

export function enhanceProductMatching(products = []) {
  const map = { byBase: {}, byWord: {} };

  for (const p of products) {
    const base = normalizeBase(p.baseName || "");
    if (base) {
      if (!map.byBase[base]) map.byBase[base] = [];
      map.byBase[base].push(p);
    }

    normalize(p.productName || "")
      .split(" ")
      .filter(w => w.length > 3)
      .forEach(w => {
        if (!map.byWord[w]) map.byWord[w] = [];
        map.byWord[w].push(p);
      });
  }

  return map;
}
