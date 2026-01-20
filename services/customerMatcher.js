/**
 * CUSTOMER MATCHER – PRODUCTION VERSION
 * Supports:
 *  - Exact match
 *  - Normalized match
 *  - Fuzzy match (string similarity)
 *  - Confidence scoring
 *  - Manual confirmation fallback
 */

function normalize(text = "") {
  return text
    .toUpperCase()
    .toUpperCase()
    .replace(/\./g, "") // 🔥 Fix: Remove dots (S.R.I -> SRI)
    .replace(/['"]/g, "") // Remove quotes
    .replace(/[^A-Z0-9 ]/g, " ") // Replace other symbols with space
    .replace(/\b(PVT|LTD|LIMITED|PHARMA|PHARMACY|MEDICAL|DRUGS?|AGENCIES|TRADERS?|ENTERPRISES?|DISTRIBUTORS?|STORES?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple but reliable similarity (0–1)
 */
export function stringSimilarity(a = "", b = "") {
  if (!a || !b) return 0;

  const s1 = normalize(a);
  const s2 = normalize(b);

  if (s1 === s2) return 1;

  const words1 = new Set(s1.split(" "));
  const words2 = new Set(s2.split(" "));

  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }

  return common / Math.max(words1.size, words2.size);
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

  // 3️⃣ AUTO MATCH THRESHOLD
  if (best && best.score >= 0.75 && (!second || best.score - second.score >= 0.15)) {
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
