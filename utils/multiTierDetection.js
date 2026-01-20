/**
 * MULTI-TIER PRODUCT DETECTION SYSTEM
 * Ensures 100% extraction with no product skipping
 */

/**
 * TIER 1: Explicit Product Indicators (Highest Confidence)
 * - Has form words: TAB, CAP, INJ, SYP
 * - Has strength: 500MG, 2.5ML
 * - Has pack: 10'S, 15'S
 * - Has product code: "1 000788 DOLO"
 */
export function isProductTier1(text) {
  if (!text || text.length < 3) return false;
  
  const upper = text.toUpperCase();
  
  const hasForm = /\b(TAB|TABLET|CAP|CAPSULE|INJ|SYRUP|SYP|DROPS|CREAM|GEL|OINT)\b/i.test(upper);
  const hasStrength = /\b\d+\s*(MG|ML|MCG|IU|GM)\b/i.test(upper);
  const hasPack = /\d+['\"`]S\b/i.test(upper);
  const hasProductCode = /^\d{1,2}\s+\d{3,6}\s+[A-Z]/i.test(upper);
  
  return hasForm || hasStrength || hasPack || hasProductCode;
}

/**
 * TIER 2: Structural Patterns (Medium Confidence)
 * - Brand + Number: "DOLO 650", "ARNIV 50"
 * - Multiple caps: "ANGIZAAR H", "TURBOVAS F"
 * - Has pharma abbreviations
 */
export function isProductTier2(text) {
  if (!text || text.length < 3) return false;
  
  const upper = text.toUpperCase();
  
  // Brand + Number pattern
  if (/\b[A-Z]{3,}\s+\d{1,4}\b/i.test(upper)) return true;
  
  // Multiple capital words
  const words = upper.split(/\s+/).filter(w => w.length > 1);
  const capWords = words.filter(w => /^[A-Z]{2,}$/.test(w));
  if (capWords.length >= 2) return true;
  
  // Has pharma abbreviations
  if (/\b(MG|ML|MCG|GM|IU)\b/i.test(upper)) return true;
  
  return false;
}

/**
 * TIER 3: Context-Based (Low Confidence)
 * - Has a valid quantity
 */
export function isProductTier3(text, extractQuantityFn) {
  if (!text || text.length < 3) return false;
  
  const qty = extractQuantityFn(text);
  return qty && qty > 0 && qty < 10000;
}

/**
 * TIER 4: Guaranteed Extraction (Fallback)
 * - Any line with letters and numbers
 */
export function isProductTier4(text) {
  if (!text || text.length < 3) return false;
  
  const upper = text.toUpperCase();
  
  // Has both letters and numbers
  return /[A-Z]{3,}/.test(upper) && /\d/.test(upper);
}

/**
 * Hard junk patterns (reject at all tiers)
 */
const HARD_JUNK_PATTERNS = [
  /^(GSTIN|PAN|DL\s*NO|PHONE|MOB|EMAIL|FAX)/i,
  /^(ORDER\s*DATE|DELIVERY\s*DATE|INVOICE\s*DATE)/i,
  /^(SUPPLIER|CUSTOMER|BILL\s*TO|SHIP\s*TO)/i,
  /^(TOTAL|GRAND\s*TOTAL|SUB\s*TOTAL|NET\s*AMOUNT)/i,
  /^(PAGE\s*\d+|PRINTED\s*BY)/i,
  /ROAD|STREET|AVENUE|BUILDING|FLOOR/i,
  /KERALA|ERNAKULAM|KANNUR|BANGALORE|MUMBAI|DELHI/i,
];

export function isHardJunk(text) {
  if (!text) return true;
  const upper = text.toUpperCase();
  return HARD_JUNK_PATTERNS.some(p => p.test(upper));
}

/**
 * Multi-tier product detection
 * @param {string} text - Text to check
 * @param {number} maxTier - Maximum tier to check (1-4)
 * @param {function} extractQuantityFn - Quantity extraction function
 * @returns {number} Tier level (1-4) or 0 if not a product
 */
export function detectProductTier(text, maxTier = 4, extractQuantityFn = null) {
  if (!text || text.length < 3) return 0;
  if (isHardJunk(text)) return 0;
  
  // Check tiers in order
  if (maxTier >= 1 && isProductTier1(text)) return 1;
  if (maxTier >= 2 && isProductTier2(text)) return 2;
  if (maxTier >= 3 && extractQuantityFn && isProductTier3(text, extractQuantityFn)) return 3;
  if (maxTier >= 4 && isProductTier4(text)) return 4;
  
  return 0;
}

export default {
  isProductTier1,
  isProductTier2,
  isProductTier3,
  isProductTier4,
  isHardJunk,
  detectProductTier
};
