/**
 * PRODUCT MATCHER - PRODUCTION GRADE v8.0 (CLEANED)
 * ✅ Multiple matching strategies (exact, fuzzy, partial, keyword)
 * ✅ Balanced confidence thresholds (0.45/0.35)
 * ✅ Detailed logging for debugging
 * ✅ Removed all duplicates and unused code
 */

import { splitProduct } from "../utils/splitProducts.js";
import { cleanInvoiceDesc } from "../utils/invoiceUtils.js";

/* =====================================================
   CONFIGURATION
===================================================== */

const FUZZY_THRESHOLD = 0.50;

/* =====================================================
   TEXT NORMALIZATION
===================================================== */

function normalize(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/\+?\s*\d*\s*FREE/g, "")
    .replace(/['`"*]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeywords(text) {
  const stopWords = new Set(['THE', 'AND', 'FOR', 'WITH', 'TAB', 'TABS', 'CAP', 'CAPS', 'OF', 'MICR', 'MICRO']);
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

/**
 * Clean invoice description by removing supplier prefixes
 */
function cleanInvoiceProduct(text) {
  if (!text) return "";
  
  let cleaned = text.toUpperCase();
  
  // Remove supplier prefixes (MICR, MICRO, etc.)
  cleaned = cleaned.replace(/^(MICR|MICRO)\s+/i, "");
  
  // Remove distributor names
  cleaned = cleaned.replace(/\b(RAJ|DIST)\b/gi, "");
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
}

/* =====================================================
   HELPER FUNCTIONS
===================================================== */

function hasExplicitVariant(text = "") {
  return (
    /\b\d+\s*(MG|ML|MCG|IU|G)\b/i.test(text) ||
    /\b(DC|TH|SR|MR|XL|OD|PLUS)\b/i.test(text) ||
    /-\s*\d+/.test(text)
  );
}

function sameStrength(inv, master) {
  if (!inv || !master) return false;
  const a = normalize(inv);
  const b = normalize(master);
  return a === b || a.includes(b) || b.includes(a);
}

/* =====================================================
   SIMILARITY ALGORITHMS
===================================================== */

function jaccardSimilarity(text1, text2) {
  const set1 = new Set(getKeywords(text1));
  const set2 = new Set(getKeywords(text2));
  
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

function wordOverlapScore(text1, text2) {
  const words1 = getKeywords(text1);
  const words2 = getKeywords(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const common = words1.filter(w => words2.includes(w));
  return (common.length * 2) / (words1.length + words2.length);
}

function partialWordMatch(text1, text2) {
  const words1 = getKeywords(text1);
  const words2 = getKeywords(text2);
  
  let matches = 0;
  
  for (const w1 of words1) {
    for (const w2 of words2) {
      // Exact match
      if (w1 === w2) {
        matches += 1;
        continue;
      }
      
      // Substring match (at least 4 chars)
      if (w1.length >= 4 && w2.length >= 4) {
        if (w1.includes(w2) || w2.includes(w1)) {
          matches += 0.8;
          continue;
        }
      }
      
      // Start match (at least 3 chars)
      if (w1.length >= 3 && w2.length >= 3) {
        const len = Math.min(w1.length, w2.length, 4);
        if (w1.substring(0, len) === w2.substring(0, len)) {
          matches += 0.6;
        }
      }
    }
  }
  
  const totalWords = Math.max(words1.length, words2.length);
  return totalWords > 0 ? matches / totalWords : 0;
}

function levenshtein(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

function levenshteinSimilarity(s1, s2) {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1 - (levenshtein(s1, s2) / maxLen);
}

/* =====================================================
   MATCHING STRATEGIES
===================================================== */

function exactMatch(inv, product) {
  return normalize(inv) === normalize(product.productName) ? 1.0 : 0;
}

function cleanedMatch(inv, product) {
  if (!product.cleanedProductName) return 0;
  return normalize(inv) === normalize(product.cleanedProductName) ? 0.95 : 0;
}

/**
 * CRITICAL: Extract strength/dosage from product name
 * Used to prevent dangerous mismatches (5mg vs 25mg)
 */
function extractStrength(text) {
  if (!text) return null;
  
  const upper = text.toUpperCase();
  
  // Pattern 1: Combo dosage (50/500, 500/125) - HIGHEST PRIORITY
  const combo = upper.match(/(\d+\/\d+)\s*(MG|ML|MCG)?/);
  if (combo) return normalize(combo[1]); // Return just the numbers (50/500)
  
  // Pattern 2: Number with unit (500MG, 10ML, 25MCG, 100ML)
  const withUnit = upper.match(/(\d+(?:\.\d+)?)\s*(MG|ML|MCG|GM|G|IU)/);
  if (withUnit) return normalize(withUnit[1]); // Return just the number
  
  // Pattern 3: Standalone number that's likely a dosage (AMLONG 5, DAJIO 500)
  // Must be followed by TAB/CAP or end of string
  const standalone = upper.match(/\b(\d+)\s*(?:TAB|CAP|TABLET|CAPSULE|$)/);
  if (standalone) {
    const num = standalone[1];
    // Only treat as dosage if it's a common pharmaceutical value
    if (['5', '10', '25', '50', '100', '250', '500', '1000'].includes(num)) {
      return num;
    }
  }
  
  return null;
}

/**
 * CRITICAL: Check if two products have compatible strengths
 * Returns true only if strengths match or one is missing
 */
function hasCompatibleStrength(invoiceText, productName) {
  const invStrength = extractStrength(invoiceText);
  const prodStrength = extractStrength(productName);
  
  // If invoice has no strength, allow match
  if (!invStrength) return true;
  
  // If invoice has strength but product doesn't, REJECT
  if (invStrength && !prodStrength) return false;
  
  // Both have strength - must match exactly
  const invNorm = normalize(invStrength);
  const prodNorm = normalize(prodStrength);
  
  return invNorm === prodNorm;
}

function baseStrengthMatch(parts, product) {
  if (!parts?.name || !product.baseName) return 0;

  const baseInv = normalize(parts.name);
  const baseProd = normalize(product.baseName);

  if (baseInv !== baseProd) return 0;

  // Strength MUST match if present
  if (parts.strength && product.dosage) {
    return sameStrength(parts.strength, product.dosage) ? 0.90 : 0;
  }

  // No strength → allow base match only
  return 0.85;
}

function containsMatch(invoiceText, masterText) {
  const inv = normalize(invoiceText);
  const mst = normalize(masterText);
  
  if (inv.includes(mst) || mst.includes(inv)) {
    const ratio = Math.min(inv.length, mst.length) / Math.max(inv.length, mst.length);
    return 0.70 * ratio;
  }
  
  return 0;
}

function fuzzyMatch(invoiceText, masterText) {
  const jaccard = jaccardSimilarity(invoiceText, masterText);
  const overlap = wordOverlapScore(invoiceText, masterText);
  const partial = partialWordMatch(invoiceText, masterText);
  const leven = levenshteinSimilarity(normalize(invoiceText), normalize(masterText));
  
  // Weighted combination - favor word-based matching
  const score = (jaccard * 0.25) + (overlap * 0.30) + (partial * 0.30) + (leven * 0.15);
  
  return score >= FUZZY_THRESHOLD ? score : 0;
}

function keywordMatch(invoiceText, masterText) {
  const invWords = getKeywords(invoiceText);
  const mstWords = getKeywords(masterText);
  
  if (invWords.length === 0 || mstWords.length === 0) return 0;
  
  let score = 0;
  let exactMatches = 0;
  let partialMatches = 0;
  
  for (const w1 of invWords) {
    for (const w2 of mstWords) {
      // Exact word match (highest value)
      if (w1 === w2 && w1.length >= 4) {
        exactMatches++;
        continue;
      }
      
      // Substring match for significant words
      if (w1.length >= 4 && w2.length >= 4) {
        if (w1.includes(w2) || w2.includes(w1)) {
          partialMatches++;
        }
      }
    }
  }
  
  // Calculate score: exact matches worth more
  score = (exactMatches * 0.30) + (partialMatches * 0.15);
  
  return Math.min(0.85, score);
}

/* =====================================================
   MAIN MATCHER - PRODUCTION GRADE
===================================================== */

export function matchProductSmart(invoiceDesc, products) {
  if (!invoiceDesc || !products?.length) return null;

  // Clean the invoice description first
  const cleaned = cleanInvoiceProduct(cleanInvoiceDesc(invoiceDesc));
  const parts = splitProduct(cleaned);
  const hasVariant = hasExplicitVariant(cleaned);

  let best = null;
  let bestScore = 0;
  let matchType = "";

  console.log(`🔍 Matching: "${cleaned}" (original: "${invoiceDesc}")`);

  for (const p of products) {
    let score = 0;
    let type = "";

    // 🚨 CRITICAL SAFETY CHECK: Strength must be compatible
    if (!hasCompatibleStrength(cleaned, p.productName)) {
      // Silently skip - don't log every rejection
      continue;
    }

    // Strategy 1: Exact match (highest priority)
    score = exactMatch(cleaned, p);
    if (score) {
      type = "EXACT";
      console.log(`  ✅ EXACT match: ${p.productName} (score: ${score.toFixed(2)})`);
    }

    // Strategy 2: Cleaned match
    if (!score) {
      score = cleanedMatch(cleaned, p);
      if (score) {
        type = "CLEANED";
        console.log(`  ✅ CLEANED match: ${p.productName} (score: ${score.toFixed(2)})`);
      }
    }

    // Strategy 3: Base + Strength match
    if (!score) {
      score = baseStrengthMatch(parts, p);
      if (score) {
        type = "BASE_STRENGTH";
        console.log(`  ✅ BASE_STRENGTH match: ${p.productName} (score: ${score.toFixed(2)})`);
      }
    }

    // Strategy 4: Fuzzy match
    if (!score) {
      score = fuzzyMatch(cleaned, p.productName);
      if (score) {
        type = "FUZZY";
        console.log(`  ✅ FUZZY match: ${p.productName} (score: ${score.toFixed(2)})`);
      }
    }

    // Strategy 5: Contains match
    if (!score) {
      score = containsMatch(cleaned, p.productName);
      if (score) {
        type = "CONTAINS";
        console.log(`  ✅ CONTAINS match: ${p.productName} (score: ${score.toFixed(2)})`);
      }
    }

    // Strategy 6: Keyword match
    if (!score) {
      score = keywordMatch(cleaned, p.productName);
      if (score) {
        type = "KEYWORD";
        console.log(`  ✅ KEYWORD match: ${p.productName} (score: ${score.toFixed(2)})`);
      }
    }

    if (score > bestScore) {
      best = p;
      bestScore = score;
      matchType = type;
    }

    if (score === 1) break; // Perfect match found
  }

  /* =====================================================
     CONFIDENCE THRESHOLDS
  ===================================================== */

  if (!best) {
    console.log(`  ❌ No match found`);
    return null;
  }

  // Lower thresholds for better matching
  const MIN_SCORE = hasVariant ? 0.45 : 0.35;

  if (bestScore < MIN_SCORE) {
    console.log(`  ❌ Best match too low: ${best.productName} (${bestScore.toFixed(2)} < ${MIN_SCORE})`);
    return null;
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

export default { 
  matchProductSmart, 
  matchProductsBatch,
  matchProductLoose 
};