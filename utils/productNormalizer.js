/**
 * PRODUCT NAME NORMALIZATION UTILITY
 * Handles variations in product names to improve matching accuracy
 * 
 * Purpose: When extracted names have small differences from database names,
 * this normalizer ensures they still match correctly.
 */

/* =====================================================
   NORMALIZATION RULES
===================================================== */

// Form word synonyms (all map to canonical form)
const FORM_SYNONYMS = {
  // Tablets
  'TABLET': 'TAB',
  'TABLETS': 'TAB',
  'TABS': 'TAB',
  'TBL': 'TAB',
  'TBLT': 'TAB',
  
  // Capsules
  'CAPSULE': 'CAP',
  'CAPSULES': 'CAP',
  'CAPS': 'CAP',
  'CPS': 'CAP',
  
  // Injections
  'INJECTION': 'INJ',
  'INJECTIONS': 'INJ',
  'INJECTIO': 'INJ',
  
  // Syrups
  'SYRUP': 'SYP',
  'SYRUPS': 'SYP',
  'SIRP': 'SYP',
  
  // Suspensions
  'SUSPENSION': 'SUSP',
  'SUSPENSIONS': 'SUSP',
  'SUSPN': 'SUSP',
  
  // Others
  'OINTMENT': 'OINT',
  'OINTMENTS': 'OINT',
  'DROP': 'DROPS',
};

// Strength unit synonyms
const UNIT_SYNONYMS = {
  'MILLIGRAM': 'MG',
  'MILLIGRAMS': 'MG',
  'MILLILITER': 'ML',
  'MILLILITERS': 'ML',
  'MICROGRAM': 'MCG',
  'MICROGRAMS': 'MCG',
  'GRAM': 'GM',
  'GRAMS': 'GM',
};

// Common typos and variations
const TYPO_CORRECTIONS = {
  'DOLO': 'DOLO',  // Keep as is
  'PARACETAMOL': 'PARACETAMOL',
  // Add more as you discover them
};

/* =====================================================
   CORE NORMALIZATION FUNCTION
===================================================== */

/**
 * Normalize product name for matching
 * @param {string} productName - Raw product name
 * @param {object} options - Normalization options
 * @returns {string} Normalized product name
 */
export function normalizeProductName(productName, options = {}) {
  if (!productName) return '';
  
  const {
    preserveStrength = true,    // Keep strength values
    preserveVariants = true,    // Keep SR, OD, etc.
    preserveFormWords = true,   // Keep TAB, CAP, etc.
    removePack = true,          // Remove pack info (10'S, 15'S)
    removeDistributor = true,   // Remove MICRO, RAJ, DIST
  } = options;
  
  let normalized = productName.toUpperCase().trim();
  
  // STEP 1: Remove distributor noise
  if (removeDistributor) {
    normalized = normalized.replace(/^(MICRO\d*|MICR)\s+/g, '');
    normalized = normalized.replace(/\b(RAJ|DIST|DISTRIBUT|DISTRIBUTOR)\b/g, ' ');
    normalized = normalized.replace(/\([^)]*RAJ[^)]*\)/gi, ' ');
  }
  
  // STEP 2: Remove product codes (but not strengths!)
  normalized = normalized.replace(/^(PROD)?\d{4,6}\s+/g, '');
  
  // STEP 3: Normalize form words
  if (preserveFormWords) {
    Object.entries(FORM_SYNONYMS).forEach(([variant, canonical]) => {
      const regex = new RegExp(`\\b${variant}\\b`, 'gi');
      normalized = normalized.replace(regex, canonical);
    });
  }
  
  // STEP 4: Normalize strength units
  if (preserveStrength) {
    Object.entries(UNIT_SYNONYMS).forEach(([variant, canonical]) => {
      const regex = new RegExp(`\\b${variant}\\b`, 'gi');
      normalized = normalized.replace(regex, canonical);
    });
    
    // Normalize strength formats
    // "500 MG" → "500MG"
    normalized = normalized.replace(/(\d+(?:\.\d+)?)\s+(MG|ML|MCG|GM|G|IU)/g, '$1$2');
    
    // 🔥 DISABLED: This was corrupting decimals (2.5→'2 5'→'2/5')
    // Only enable for actual combination strengths with explicit context
    // For now, rely on slash normalization below which is safer
    
    // "50 / 500 MG" → "50/500MG" (already handles slash with spaces)
    normalized = normalized.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(MG|ML|MCG)?/g, '$1/$2$3');
  }
  
  // STEP 5: Remove pack info
  if (removePack) {
    normalized = normalized.replace(/\(\s*\d+\s*['`"]?\s*S\s*\)/gi, ' ');
    normalized = normalized.replace(/\b\d+\s*['`"]?\s*S\b/gi, ' ');
    normalized = normalized.replace(/\b\d+\s*X\s*\d+[A-Z]?\b/gi, ' '); // 10X15T, 1X10
  }
  
  // STEP 6: Normalize punctuation and spacing
  normalized = normalized
    .replace(/\s*-\s*/g, '-')      // "DOLO - 650" → "DOLO-650"
    .replace(/\s+/g, ' ')           // Multiple spaces → single space
    .replace(/[^\w\s\-\/\.]/g, ' ')   // 🔥 FIXED: Allow dots (.) for decimals like 2.5
    .replace(/\s+\./g, ' .')        // Fix Orphan dots if any
    .trim();
  
  return normalized;
}

/**
 * Normalize for fuzzy matching (more aggressive)
 * Removes all non-alphanumeric characters for loose comparison
 */
export function normalizeForFuzzyMatch(productName) {
  const normalized = normalizeProductName(productName, {
    preserveStrength: true,
    preserveVariants: true,
    preserveFormWords: true,
    removePack: true,
    removeDistributor: true,
  });
  
  return normalized
    .replace(/[^A-Z0-9]/g, '')  // Remove all non-alphanumeric
    .trim();
}

/**
 * Extract normalized components for structured matching
 */
export function extractNormalizedComponents(productName) {
  const normalized = normalizeProductName(productName);
  
  // Extract strength
  const strengthMatch = normalized.match(/\b(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)(MG|ML|MCG|GM|G|IU)\b/i);
  const strength = strengthMatch ? `${strengthMatch[1]}${strengthMatch[2]}` : null;
  
  // Extract form
  const formMatch = normalized.match(/\b(TAB|CAP|INJ|SYP|SUSP|DROPS|CREAM|GEL|OINT)\b/i);
  const form = formMatch ? formMatch[1] : null;
  
  // Extract variant
  const variantMatch = normalized.match(/\b(SR|OD|MR|XL|CR|ER|FORTE|PLUS|GOLD|CV|LBX|LB)\b/i);
  const variant = variantMatch ? variantMatch[1] : null;
  
  // Extract base name (remove strength, form, variant)
  let baseName = normalized;
  if (strength) baseName = baseName.replace(strength, ' ');
  if (form) baseName = baseName.replace(form, ' ');
  if (variant) baseName = baseName.replace(variant, ' ');
  baseName = baseName.replace(/\s+/g, ' ').trim();
  
  return {
    normalized,
    baseName,
    strength,
    form,
    variant,
  };
}

/**
 * Compare two product names with normalization
 * Returns similarity score (0-1)
 */
export function compareNormalized(name1, name2) {
  const norm1 = normalizeForFuzzyMatch(name1);
  const norm2 = normalizeForFuzzyMatch(name2);
  
  if (!norm1 || !norm2) return 0;
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Containment
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = Math.min(norm1.length, norm2.length);
    const longer = Math.max(norm1.length, norm2.length);
    return shorter / longer;
  }
  
  // Levenshtein-like similarity
  const maxLen = Math.max(norm1.length, norm2.length);
  let matches = 0;
  
  for (let i = 0; i < Math.min(norm1.length, norm2.length); i++) {
    if (norm1[i] === norm2[i]) matches++;
  }
  
  return matches / maxLen;
}

/* =====================================================
   BATCH NORMALIZATION
===================================================== */

/**
 * Normalize an array of product names
 */
export function normalizeProductsBatch(products) {
  return products.map(product => ({
    ...product,
    normalizedName: normalizeProductName(product.productName || product.ITEMDESC),
    fuzzyName: normalizeForFuzzyMatch(product.productName || product.ITEMDESC),
    components: extractNormalizedComponents(product.productName || product.ITEMDESC),
  }));
}

/* =====================================================
   TESTING UTILITY
===================================================== */

export function testNormalization() {
  const testCases = [
    {
      input: 'MICRO1 MICRO CARDICARE RAJ DIST 1657 METAPRO 50MG TAB',
      expected: 'METAPRO 50MG TAB',
    },
    {
      input: 'DOLO - 650 TABLETS (10\'S)',
      expected: 'DOLO-650 TAB',
    },
    {
      input: 'AMOXICILLIN 500 MILLIGRAMS CAPSULES',
      expected: 'AMOXICILLIN 500MG CAP',
    },
    {
      input: 'DIAPRIDE M 1 / 500 MG TABLETS',
      expected: 'DIAPRIDE M 1/500MG TAB',
    },
  ];
  
  console.log('\n🧪 TESTING PRODUCT NAME NORMALIZATION\n');
  
  testCases.forEach((test, i) => {
    const result = normalizeProductName(test.input);
    const pass = result === test.expected;
    
    console.log(`Test ${i + 1}: ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Input:    ${test.input}`);
    console.log(`Expected: ${test.expected}`);
    console.log(`Got:      ${result}\n`);
  });
}

export default {
  normalizeProductName,
  normalizeForFuzzyMatch,
  extractNormalizedComponents,
  compareNormalized,
  normalizeProductsBatch,
  testNormalization,
};
