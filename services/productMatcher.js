/**
 * COMPLETE FIX FOR 90%+ MATCH RATE
 * Replace these functions in your productMatcher.js
 */

/* =====================================================
   FIX 1: STOP REMOVING FORM WORDS
   Problem: cleanInvoiceDesc() removes TABS, CAPS, etc.
   Solution: Only remove NOISE, keep product identity
===================================================== */

import { extractStrength } from "../utils/extractionUtils.js";
import { splitProduct } from "../utils/splitProducts.js";
import { normalizeProductName } from "../utils/productNormalizer.js";

// 🔥 NEW: Common typos in medical product names
const COMMON_TYPOS = {
  'DRPS': 'DROPS',
  'DRP': 'DROP',
  'SUSP': 'SUSPENSION',
  'SUSPN': 'SUSPENSION',
  'TABS': 'TAB',
  'CAPS': 'CAP',
  'INJ': 'INJECTION',
  'INJN': 'INJECTION',
  'SYRUP': 'SYP',
  'SIRP': 'SYP'
};

/**
 * Fix common typos before matching
 */
function fixCommonTypos(text) {
  if (!text) return text;
  
  let fixed = text.toUpperCase();
  
  Object.entries(COMMON_TYPOS).forEach(([typo, correct]) => {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    fixed = fixed.replace(regex, correct);
  });
  
  return fixed;
}


function formAwareMatch(invoiceText, productName) {
  const FORMS = ['SPRAY','DROPS','CREAM','GEL','OINT','LOTION','SUSPENSION'];

  const inv = invoiceText.toUpperCase();
  const prod = productName.toUpperCase();

  const invForm = FORMS.find(f => inv.includes(f));
  const prodForm = FORMS.find(f => prod.includes(f));

  if (!invForm || !prodForm) return 0;
  if (invForm !== prodForm) return 0;

  // Compare base name
  const invBase = inv.replace(invForm, '').replace(/[^A-Z]/g,'');
  const prodBase = prod.replace(prodForm, '').replace(/[^A-Z]/g,'');

  if (invBase && prodBase && (
      invBase.includes(prodBase) ||
      prodBase.includes(invBase)
  )) {
    return 0.88; // strong confidence
  }

  return 0;
}

function extractBrandRoot(text = "") {
  if (!text) return "";

  return text
    .toUpperCase()
    .replace(/^(MICRO|MICR)\s*/i, "") // normalize distributor prefix
    .replace(/[^A-Z0-9\s\-]/g, "")
    .split(/[\s\-]/)
    .filter(Boolean)[0] || "";
}

function isComboStrength(text = "") {
  return /\d+\s*\/\s*\d+/.test(text);
}
function normalizeForMatch(text = "") {
  return text
    .toUpperCase()
    // distributor noise
    .replace(/\b(MICR|MICRO|RAJ|DIST)\b/g, " ")
    // normalize strength combos
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
    .replace(/\s*-\s*/g, "-")

    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCombo(text = "") {
  const m = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Clean invoice description - MINIMAL CLEANING
 * KEEP: Form words (TABS, CAPS), strength, variants
 * REMOVE: Only distributor noise
 */
function cleanInvoiceDesc(text = "") {
  if (!text) return "";
  
  let cleaned = text.trim().toUpperCase();
  
  // Remove pack info only: (10'S), (30S)
  cleaned = cleaned.replace(/\(\s*\d+\s*['`"]?\s*S\s*\)/gi, " ");
  cleaned = cleaned.replace(/\b\d+\s*['`"]?\s*S\b/gi, " ");
  
  // 🔥 DO NOT REMOVE FORM WORDS (TABS, CAPS, etc.)
  // They are part of product identity!
  
  // Normalize spacing
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
}

/**
 * Clean product name from invoice - REMOVE NOISE ONLY
 */
function cleanInvoiceProduct(text) {
  if (!text) return "";
  
  let cleaned = text.toUpperCase();
  
  // Remove distributor prefixes (already done in extraction, but safety check)
  cleaned = cleaned.replace(/^(MICR|MICRO)\s+/i, "");
  cleaned = cleaned.replace(/\b(RAJ|DIST)\b/gi, "");
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
}

/* =====================================================
   FIX 2: ENHANCED STRENGTH EXTRACTION
===================================================== */



function normalizeStrength(strength = "") {
  if (!strength) return "";

  return strength
    .toUpperCase()
    // Remove all spaces first
    .replace(/\s+/g, "")
    // Normalize combo units - remove MG, ML, MCG, GM, G after numbers
    .replace(/(\d+(?:\.\d+)?)(MG|ML|MCG|GM|G)\b/gi, "$1")
    // Normalize multiple slashes to single slash
    .replace(/\/+/g, "/")
    // Remove any remaining spaces
    .replace(/\s+/g, "")
    .trim();
}


/* =====================================================
   FIX 3: RELAXED COMPATIBILITY CHECKS
===================================================== */
function hasCompatibleStrength(invoiceText, productName) {
  const inv = normalizeStrength(extractStrength(invoiceText));
  const prod = normalizeStrength(extractStrength(productName));

  // 🔥 STRICT: Both must have strength and match, OR both must be absent
  if (!inv && !prod) return true; // Both absent = OK
  if (inv && prod) return inv === prod; // Both present = Must match

  // ❌ One has strength, other doesn't = NOT compatible
  // This prevents "MECONERV 500" from matching "MECONERV" automatically
  if ((inv && !prod) || (!inv && prod)) {
     // console.log(`    ⚠️ Strength Mismatch: Inv='${inv}' vs Prod='${prod}' (One missing)`);
     return false;
  }
  return false;
}








function hasCompatibleVariant(invoiceText, productName) {
  // 🔥 EXPANDED: Added MT, H, AT, TRIO, A, AM, D, M, LS, TH, DC and other common pharma variants
  const extract = (text) =>
    text.toUpperCase().match(/\b(OD|SR|MR|XL|CR|FORTE|PLUS|GOLD|CV|LBX|LB|MT|H|AT|TRIO|A|AM|D|M|LS|TH|BETA|DC)\b/g) || [];

  const inv = extract(invoiceText);
  const prod = extract(productName);

  // 🔥 STRICT variants must match - these are critical differentiators
  // MT = Metoprolol combo, H = HCTZ combo, AT = Atorvastatin combo, TRIO = Triple combo
  // BETA = Beta blocker combo, M = Metformin combo, DC = Diclofenac/combo
  // 🔥 UPDATED: Added PLUS, FORTE, GOLD, CV, LBX to strict list to prevent false positives
  const strict = ['OD', 'SR', 'MR', 'XL', 'CR', 'MT', 'H', 'AT', 'TRIO', 'BETA', 'A', 'AM', 'TH', 'LS', 'DC', 'PLUS', 'FORTE', 'GOLD', 'CV', 'LBX', 'M'];

  const invStrict = inv.filter(v => strict.includes(v));
  const prodStrict = prod.filter(v => strict.includes(v));

  // 🚨 CRITICAL: If invoice has a strict variant but product doesn't, BLOCK
  if (invStrict.length > 0 && prodStrict.length === 0) {
    return false; // Invoice has variant like MT, product doesn't have it
  }
  
  // 🚨 CRITICAL: If product has a strict variant but invoice doesn't, BLOCK
  if (prodStrict.length > 0 && invStrict.length === 0) {
    return false; // Product has variant like MT, invoice doesn't have it
  }

  // If both have strict variants, they must have at least one in common
  if (invStrict.length && prodStrict.length) {
    if (!invStrict.some(v => prodStrict.includes(v))) {
      return false; // real mismatch (e.g. MT vs H)
    }
  }

  // SOFT variants → do NOT block
  return true;
}


/* =====================================================
   FIX 4: ENHANCED EXACT MATCH
===================================================== */

function exactMatch(invoiceText, product) {
  if (!invoiceText || !product?.productName) return 0;

  // Enhanced normalization that removes units (MG, ML, MCG) before comparing
  const normalize = (text) => {
    return text
      .toUpperCase()
      .replace(/[-_/]/g, " ")  
      // Remove units first
      .replace(/(\d+(?:\.\d+)?)\s*(MG|ML|MCG|GM|G)\b/gi, '$1')
      // Remove all non-alphanumeric except forward slash (for combo strengths)
      .replace(/[^A-Z0-9\/]/g, "")
      .trim();
  };

  // 🔥 NEW: Word-order-flexible normalization
  const normalizeForWordMatch = (text) => {
    return text
      .toUpperCase()
      .replace(/[-_/]/g, " ")
      .replace(/(\d+(?:\.\d+)?)\s*(MG|ML|MCG|GM|G)\b/gi, '$1')
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 0)
      .sort()
      .join(" ");
  };

  const inv = normalize(invoiceText);
  const prod = normalize(product.productName);

  // Direct exact match
  if (inv === prod) return 1.0;

  // 🔥 NEW: Word-order-flexible match (AMLONG MT 25 == AMLONG 25 MT)
  const invWords = normalizeForWordMatch(invoiceText);
  const prodWords = normalizeForWordMatch(product.productName);
  
  if (invWords === prodWords && invWords.length >= 3) {
    return 1.0; // Same words, just different order
  }

  // Close match (one contains other)
  if (inv.includes(prod) || prod.includes(inv)) {
    const lenDiff = Math.abs(inv.length - prod.length);
    
    // If difference is small (just form word or unit), consider it exact
    if (lenDiff <= 4) { // "TABS" = 4 chars, "MG" = 2 chars
      return 1.0;
    }
    
    return 0.95;
  }

  return 0;
}

/* =====================================================
   FIX 5: IMPROVED SIMILARITY
===================================================== */

function similarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const NOISE = ['MICRO', 'MICRO1', 'RAJ', 'DIST', 'DISTRIBUT', 'DISTRIBUTOR', 'LIMITED', 'LTD', 'PROD'];

  const normalize = (s) => {
    return s
      .toUpperCase()
      // Remove units (MG, ML, MCG) from numbers
      .replace(/(\d+(?:\.\d+)?)\s*(MG|ML|MCG|GM|G)\b/gi, '$1')
      // Replace non-alphanumeric (except slash) with space
      .replace(/[^A-Z0-9\/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  const words1 = s1.split(/\s+/).filter(w => w.length > 1 && !NOISE.includes(w));
  const words2 = s2.split(/\s+/).filter(w => w.length > 1 && !NOISE.includes(w));

  if (words1.length === 0 || words2.length === 0) return 0;

  const set2 = new Set(words2);
  const common = words1.filter(w => set2.has(w));

  if (common.length === 0) return 0;

  // Full containment
  if (words1.every(w => set2.has(w)) || words2.every(w => words1.includes(w))) {
    return 0.95;
  }

  // Jaccard similarity
  return (common.length * 2) / (words1.length + words2.length);
}

/* =====================================================
   FIX 6: CLEANED MATCH (More Lenient)
===================================================== */

function cleanedMatch(invoiceText, product) {
  if (!invoiceText || !product?.productName) return 0;

  const score = similarity(invoiceText, product.productName);
  
  // Lowered threshold
  if (score >= 0.75) { // Was 0.85
    return 0.85;
  }
  
  return 0;
}

/* =====================================================
   FIX 7: BASE + STRENGTH MATCH (Enhanced)
===================================================== */

function baseStrengthMatch(parts, product) {
  if (!parts || !product?.productName) return 0;

const extractBase = (text = "") => {
  return text
    .toUpperCase()
    // remove strength (numbers only)
    .replace(/\b\d+(\.\d+)?(MG|ML|MCG)?\b/g, " ")
    // remove form words
    .replace(/\b(TAB|TABS|TABLET|TABLETS|CAP|CAPS|CAPSULES?)\b/g, " ")
    // normalize hyphens
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
};


  const invBase = extractBase(parts.name || "");
  const prodBase = extractBase(product.productName);

  if (!invBase || !prodBase) return 0;

  // Exact base match
  if (invBase === prodBase) return 0.80;

  // Containment
  if (invBase.includes(prodBase) || prodBase.includes(invBase)) {
    return 0.75;
  }

  return 0;
}

/* =====================================================
   FIX 8: FUZZY MATCH (Lower Threshold)
===================================================== */

function fuzzyMatch(invoiceText, productName) {
  if (!invoiceText || !productName) return 0;

  const score = similarity(invoiceText, productName);

  // Lowered threshold
  if (score >= 0.35) { // Was 0.50
    return score * 0.95;
  }

  return 0;
}

/* =====================================================
   FIX 9: MAIN MATCHING FUNCTION (Updated)
===================================================== */

export function matchProductSmart(invoiceDesc, products) {
  if (!invoiceDesc || !products?.length) return null;

const rawInvoice = invoiceDesc;

// 🔥 ENHANCED: Fix common typos first, then normalize
const typoFixed = fixCommonTypos(invoiceDesc);
const cleaned = normalizeProductName(
  cleanInvoiceProduct(cleanInvoiceDesc(typoFixed))
);


  let best = null;
  let bestScore = 0;
  let matchType = "";

  console.log(`🔍 Matching: "${cleaned}" (original: "${invoiceDesc}")`);

 for (const p of products) {
  let score = 0;
  let type = "";

  const prodNorm = normalizeProductName(p.productName);
  const invBrand = extractBrandRoot(rawInvoice);
  const prodBrand = extractBrandRoot(p.productName);

  // 🚨 HARD BRAND BLOCK (THIS FIXES YOUR BUG)
// 🚨 Brand block ONLY for distributor noise
const NOISE_BRANDS = ["MICRO", "RAJ", "DIST"];

if (
  invBrand &&
  prodBrand &&
  invBrand !== prodBrand &&
  NOISE_BRANDS.includes(invBrand)
) {
  continue;
}



  // 🔒 Existing strength block (keep this)
const strengthOk = hasCompatibleStrength(rawInvoice, p.productName);
if (!strengthOk) {
  // 🚨 ABSOLUTE BLOCK: do not allow fuzzy/contains
  continue;
}


  // 🔒 Existing variant block
 if (!hasCompatibleVariant(rawInvoice, p.productName)) {

    continue;
  }

  // Strategy 1: Exact match
  score = exactMatch(cleaned, p);
  if (score) type = "EXACT";

  // Strategy 2: Cleaned match
  if (!score) {
    score = cleanedMatch(cleaned, p);
    if (score) type = "CLEANED";
  }

  // Strategy 3: Base + Strength
  if (!score) {
   const parts = splitProduct(cleaned);
score = baseStrengthMatch(parts, p);


    if (score) type = "BASE_STRENGTH";
  }
  if (!score) {
    score = formAwareMatch(cleaned, p.productName);
    if (score) type = "FORM_AWARE";
  }



    // Strategy 5: Contains
    if (!score) {
  const inv = cleaned.replace(/[^A-Z0-9]/g, "");
const prod = prodNorm.replace(/[^A-Z0-9]/g, "");

if (
  inv.length > 6 &&
  prod.length > 6 &&
  (inv.includes(prod) || prod.includes(inv)) &&
  hasCompatibleStrength(rawInvoice, p.productName)
) {
  score = 0.55;
  type = "CONTAINS";
}

      
    }

    if (score > bestScore) {
      best = p;
      bestScore = score;
      matchType = type;
    }

    if (score === 1) break;
  }

  if (!best) {
    console.log(`  ❌ No match found, searching for candidates...`);
    
    // 🔥 NEW: Find similar products by base name
    const parts = splitProduct(cleaned);
    const baseName = parts.name?.toUpperCase();
    
    if (baseName && baseName.length >= 3) {
      const candidates = products.filter(p => {
        const pParts = splitProduct(p.productName);
        const pBase = pParts.name?.toUpperCase();
        
        // Match if base names are similar
        return pBase && (
          pBase.includes(baseName) || 
          baseName.includes(pBase) ||
          pBase === baseName
        );
      }).slice(0, 10); // Limit to 10 candidates
      
      if (candidates.length > 0) {
        console.log(`  💡 Found ${candidates.length} candidates with base "${baseName}"`);
        
        // 🔥 AUTO-SELECT: Pick the best candidate that has compatible strength/variant
        for (const candidate of candidates) {
          if (hasCompatibleStrength(rawInvoice, candidate.productName) &&
              hasCompatibleVariant(rawInvoice, candidate.productName)) {
            console.log(`  ✅ AUTO-SELECTED: ${candidate.productName} (from candidates)`);
            return {
              ...candidate,
              confidence: 0.75,
              matchType: "AUTO_CANDIDATE",
              boxPack: candidate.boxPack || candidate.pack || 0
            };
          }
        }
        
        // 🔥 LENIENT: If only one candidate exists, auto-select it ONLY if compatible
        if (candidates.length === 1) {
          const cand = candidates[0];
          if (hasCompatibleStrength(rawInvoice, cand.productName) &&
              hasCompatibleVariant(rawInvoice, cand.productName)) {
              console.log(`  ✅ AUTO-SELECTED (single candidate): ${cand.productName}`);
              return {
                ...cand,
                confidence: 0.65,
                matchType: "SINGLE_CANDIDATE",
                boxPack: cand.boxPack || cand.pack || 0
              };
          } else {
             console.log(`  ❌ SINGLE CANDIDATE REJECTED (Incompatible): ${cand.productName}`);
          }
        }
        
        // Multiple candidates but none passed checks - return for manual selection
        return {
          matchedProduct: null,
          candidates: candidates.map(c => ({
            ...c,
            boxPack: c.boxPack || c.pack || 0
          })),
          reason: `Multiple matches for "${invoiceDesc}". Please select.`
        };
      }
    }
    
    return null;
  }

  // 🔥 LENIENT: Very low threshold - accept almost any match
  const MIN_SCORE = 0.20; // Was 0.30

  if (bestScore < MIN_SCORE) {
    console.log(`  ❌ Best match too low: ${best.productName} (${bestScore.toFixed(2)} < ${MIN_SCORE})`);
    
    // 🔥 LENIENT: Auto-select even low-confidence matches
    console.log(`  ✅ AUTO-SELECTED (low confidence): ${best.productName}`);
    return {
      ...best,
      confidence: bestScore,
      matchType: matchType + "_LOW",
      boxPack: best.boxPack || best.pack || 0
    };
  }

  console.log(`  ✅ MATCHED: ${best.productName} (${matchType}, confidence: ${bestScore.toFixed(2)})`);

  return {
    ...best,
    confidence: bestScore,
    matchType,
    boxPack: best.boxPack || best.pack || 0
  };
}

/* =====================================================
   EXPORT ALL FUNCTIONS
===================================================== */

export {
  cleanInvoiceDesc,
  cleanInvoiceProduct,
  extractStrength,
  normalizeStrength,
  hasCompatibleStrength,
  hasCompatibleVariant,
  exactMatch,
  similarity,
  cleanedMatch,
  baseStrengthMatch,
  fuzzyMatch
};
/* =====================================================
   BATCH MATCHING
===================================================== */

export function matchProductsBatch(invoiceItems, products) {
  console.log(`\n🔄 BATCH MATCHING: ${invoiceItems.length} items against ${products.length} products\n`);
  
  const results = [];
  const failed = [];
  
  for (let i = 0; i < invoiceItems.length; i++) {
    const item = invoiceItems[i];
    console.log(`${i + 1}/${invoiceItems.length}. "${item.ITEMDESC}"`);
    
    const match = matchProductSmart(item.ITEMDESC, products);
    
    if (match) {
      results.push({
        ...item,
        matchedProduct: match
      });
    } else {
      failed.push({
        ...item,
        reason: 'No matching product found in database'
      });
    }
  }
  
  console.log(`\n📊 MATCH SUMMARY:`);
  console.log(`   ✅ Matched: ${results.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   Success rate: ${((results.length / invoiceItems.length) * 100).toFixed(1)}%\n`);
  
  return { results, failed };
}

/* =====================================================
   LEGACY COMPATIBILITY
===================================================== */

export function matchProductLoose(invoiceDesc, products) {
  const result = matchProductSmart(invoiceDesc, products);
  
  if (!result) return null;
  
  return {
    product: {
      ITEMDESC: result.productName,
      SAPCODE: result.productCode,
      PACK: result.pack || 0,
      "BOX PACK": result.boxPack || 0,
      DVN: result.division || ""
    },
    score: result.confidence
  };
}

/* =====================================================
   REVERSE LOOKUP STRATEGY (MASTER-DRIVEN)
   Scans the full raw data line to see if any Master Product name is present.
   Useful when extraction fails to isolate the name correctly.
===================================================== */

export function matchByReverseLookup(rawLine, products) {
  if (!rawLine || !products?.length) return null;

  const normalizeForSearch = (t) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cleanRaw = normalizeForSearch(rawLine); // "1ABC200TAB..."

  let best = null;
  let bestScore = 0;

  console.log(`🔍 Reverse Lookup on: "${rawLine}"`);

  for (const p of products) {
    const pName = normalizeForSearch(p.productName);
    
    // Quick check: Is the compressed product name inside the compressed raw line?
    if (cleanRaw.includes(pName)) {
        
        // 🚨 CRITICAL SAFETY CHECK 1: Strength must be compatible
        // (We pass rawLine as "invoiceText" because we want to see if the raw line contains the strength)
        if (!hasCompatibleStrength(rawLine, p.productName)) {
            continue;
        }

        // 🚨 CRITICAL SAFETY CHECK 2: Variant must be compatible
        // (If RawLine has "SR" and Product is "OD", reject)
        if (!hasCompatibleVariant(rawLine, p.productName)) {
            continue;
        }
        
        // 🚨 CRITICAL SAFETY CHECK 3: Significant Tokens
        // (If Product has "MS1" and RawLine misses it, reject)
        if (checkMissingSignificantTokens(rawLine, p.productName)) {
             continue;
        }

        // Score based on length (Longer match = Better)
        const score = pName.length;

        if (score > bestScore) {
            best = p;
            bestScore = score;
        }
    }
  }

  if (best) {
      console.log(`  ✅ REVERSE MATCH: ${best.productName}`);
      return {
          ...best,
          confidence: 0.85, // High but not perfect (since implicit)
          matchType: "REVERSE_LOOKUP",
          boxPack: best.boxPack || best.pack || 0
      };
  }
  
  return null;
}

export default { 
  matchProductSmart, 
  matchProductsBatch,
  matchProductLoose,
  matchByReverseLookup
};