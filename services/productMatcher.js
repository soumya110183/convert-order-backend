/* =====================================================
   PRODUCT MATCHER – PRODUCTION SAFE
   Matches invoice text → Admin Product Master
===================================================== */

function normalize(text = "") {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(MG|ML|TAB|TABS|CAP|CAPS|S|PCS|NOS)\b/g, "")
    .replace(/\b(MICR)\b/g, "")   // distributor noise
    .replace(/\d+/g, "")          // quantities, strengths
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(w => w.length > 2);
}

export function matchProductLoose(invoiceDesc, productMaster) {
  if (!invoiceDesc || !productMaster?.length) return null;

  const invTokens = tokenize(invoiceDesc);
  if (!invTokens.length) return null;

  let best = null;
  let bestScore = 0;

  for (const p of productMaster) {
    if (!p.productName) continue;

    const prodTokens = tokenize(p.productName);
    if (!prodTokens.length) continue;

    const common = prodTokens.filter(t => invTokens.includes(t));
    const score = common.length / prodTokens.length;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore >= 0.6) {
    return { product: best, score: bestScore };
  }

  return null;
}