// services/schemeMatcher.js

function normalizeName(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyScheme({ productCode, orderQty, itemDesc, schemes }) {

  const scheme = schemes.find(s =>
    s.isActive &&
    (
      s.productCode === productCode ||
   normalizeName(s.productName) === normalizeName(itemDesc)

    )
  );

  if (!scheme || !scheme.slabs?.length) {
    return { schemeApplied: false };
  }

  const eligibleSlab = scheme.slabs
    .filter(s => orderQty >= s.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  if (!eligibleSlab) {
    return { schemeApplied: false };
  }

  const freeQty = eligibleSlab.freeQty;

  const schemePercent =
    orderQty > 0 && freeQty > 0
      ? Number(((freeQty / orderQty) * 100).toFixed(2))
      : 0;

  return {
    schemeApplied: true,
    freeQty,
    schemePercent,
    appliedSlab: eligibleSlab,
    availableSlabs: scheme.slabs
  };
}


/**
 * Find better scheme opportunities
 * e.g. If Qty=80 and Scheme starts at 100, suggest 100
 */
export function findUpsellOpportunity({ productCode, orderQty, schemes }) {
  const scheme = schemes.find(
    s => s.productCode === productCode && s.isActive
  );

  if (!scheme || !scheme.slabs?.length) return null;

  // Find slabs that are explicitly GREATER than current qty
  const potentialSlabs = scheme.slabs
    .filter(s => s.minQty > orderQty)
    .sort((a, b) => a.minQty - b.minQty); // Smallest upgrade first

  if (potentialSlabs.length === 0) return null;

  const nextSlab = potentialSlabs[0];
  const diff = nextSlab.minQty - orderQty;

  // Heuristic: Suggest if difference is within 50% of current qty OR absolute diff is reasonably small
  // "80 -> 100" is +25%.
  const percentDiff = (diff / orderQty) * 100;
  
  if (percentDiff <= 50 || diff <= 50) {
      return {
          productCode,
          currentQty: orderQty,
          suggestedQty: nextSlab.minQty,
          freeQty: nextSlab.freeQty,
          diff: diff,
          schemePercent: nextSlab.schemePercent,
          schemeName: scheme.schemeName || "Scheme"
      };
  }

  return null;
}

