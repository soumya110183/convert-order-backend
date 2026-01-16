/* =====================================================
   PRODUCT MATCHER – PHARMA SAFE
   ===================================================== */

function normalize(text = "") {
  return text
    .toUpperCase()
    .replace(/\+FREE/g, "")
    .replace(/['"*]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchProductLoose(invoiceDesc, products) {
  if (!invoiceDesc) return null;

  const inv = normalize(invoiceDesc);

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const master = normalize(p.productName);

    if (!master) continue;

    // Exact contains (strongest)
    if (inv.includes(master) || master.includes(inv)) {
      return {
        product: {
          ITEMDESC: p.productName,
          SAPCODE: p.productCode,
          PACK: p.pack,
          DVN: p.division
        },
        score: 1
      };
    }

    // Word overlap scoring
    const invWords = inv.split(" ");
    const masterWords = master.split(" ");

    const common = invWords.filter(w => masterWords.includes(w));

    const score =
      (common.length * 2) / (invWords.length + masterWords.length);

    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      best = {
        product: {
          ITEMDESC: p.productName,
          SAPCODE: p.productCode,
          PACK: p.pack,
          DVN: p.division
        },
        score
      };
    }
  }

  return best;
}
