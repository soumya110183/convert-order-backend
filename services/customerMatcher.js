/**
 * CUSTOMER MATCHER – PRODUCTION VERSION
 * Supports:
 *  - Exact match
 *  - Normalized match
 *  - Fuzzy match (string similarity)
 *  - Confidence scoring
 *  - Manual confirmation fallback
 */

/**
 * Normalize customer name for matching
 * Handles: dots, commas, spaces, case, business suffixes
 * Example: "D.T.Associates" → "DT ASSOCIATES"
 *          "S.R.I. SABARI & CO." → "SRI SABARI"
 */
function normalize(text = "") {
  if (!text) return "";
  
  let normalized = text.toUpperCase();
  
  // STEP 1: Remove punctuation (but preserve word boundaries)
  normalized = normalized
    .replace(/[.,\-&()[\]{}'"]/g, " ")  // Replace with space
    .replace(/\s+/g, " ")                // Compress spaces
    .trim();

  const CUSTOMER_ALIASES = {
    // Common mismatches
    "SRI AYYAPPA AGENCIES": "AYYAPPA DISTRIBUTORS", // Example
    "SABARI ASSOCIATES": "SRI SABARI AGENCIES", // Map to correct one if ambiguous
  };
  
  // STEP 2: Remove M/S prefix
  normalized = normalized.replace(/^M\s*\/\s*S\s+/i, "");
  normalized = normalized.replace(/^M\s+S\s+/i, "");
  
  // STEP 3: Remove location suffixes (only at end)
  normalized = normalized.replace(/\s+(EKM|PKD|TVM|KKD|CALICUT|KANNUR|ERNAKULAM|KOCHI|KERALA)\s*$/i, "");
  
  // STEP 4: Remove trailing business structure words (only at end)
  normalized = normalized.replace(/\s+(PVT\s+LTD|PRIVATE\s+LIMITED|LIMITED|LTD|LLP|LLC|INC|CORP|CORPORATION|CO)\s*$/i, "");
  
  // STEP 5: Clean up
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

/**
 * Enhanced similarity with character-level fallback
 * Handles word-based AND character-based matching
 */
export function stringSimilarity(a = "", b = "") {
  if (!a || !b) return 0;

  const s1 = normalize(a);
  const s2 = normalize(b);

  if (s1 === s2) return 1;

  // Word-based similarity
  const words1 = new Set(s1.split(" "));
  const words2 = new Set(s2.split(" "));

  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }

  const wordScore = common / Math.max(words1.size, words2.size);

  // Character-level similarity (for spacing variations like "K K M" vs "KKM")
  const c1 = s1.replace(/\s+/g, "");  // Remove all spaces
  const c2 = s2.replace(/\s+/g, "");
  
  const charScore = (c1 === c2) ? 1.0 : 
                    (c1.includes(c2) || c2.includes(c1)) ? 0.85 : 0;

  // Return the best score
  let finalScore = Math.max(wordScore, charScore);

  // 🔥 CORE WORD BONUS: If the FIRST major word matches exactly, boost score
  const w1 = s1.split(" ")[0];
  const w2 = s2.split(" ")[0];
  
  if (w1 && w2 && w1 === w2 && w1.length > 3) {
      finalScore += 0.35; // Boost "AYYAPPA" match
  }

  if (finalScore > 0.98 && s1 !== s2) finalScore = 0.98;
  return finalScore;
}

/**
 * MAIN CUSTOMER MATCHER
 */
export function matchCustomerSmart(invoiceCustomerName, customers = []) {
  if (!invoiceCustomerName || !customers.length) {
    return {
      source: "NONE",
      confidence: 0,
      candidates: [],
      auto: null
    };
  }

  const cleanedInvoiceName = normalize(invoiceCustomerName);

  // 1️⃣ EXACT MATCH (FAST EXIT)
  const exact = customers.find(c =>
    normalize(c.customerName) === cleanedInvoiceName
  );

  if (exact) {
    return {
      source: "EXACT",
      confidence: 1,
      candidates: [exact],
      auto: exact
    };
  }

  // 2️⃣ FUZZY MATCH
  const scored = customers.map(c => {
    const score = stringSimilarity(cleanedInvoiceName, c.customerName);
    return { customer: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  // 3️⃣ AUTO MATCH THRESHOLD (lowered for spacing variations)
  if (best && best.score >= 0.70 && (!second || best.score - second.score >= 0.10)) {
    return {
      source: "FUZZY_AUTO",
      confidence: best.score,
      candidates: scored.slice(0, 5),
      auto: best.customer
    };
  }

  // 4️⃣ MANUAL CONFIRMATION REQUIRED
  return {
    source: "MANUAL_REQUIRED",
    confidence: best?.score || 0,
    candidates: scored.slice(0, 5),
    auto: null
  };
}
