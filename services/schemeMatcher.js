// services/schemeMatcher.js

function normalize(text = "") {
  return String(text).toUpperCase().trim();
}

/**
 * Find the best applicable scheme for a given product and context
 */
function findApplicableScheme(schemes, productCode, itemDesc, customerCode, division) {
  const normalizedCode = normalize(productCode);
  const normalizedDesc = normalize(itemDesc);
  const normalizedDiv = normalize(division);
  const normalizedCust = normalize(customerCode);

  return schemes.find(s => {
    if (!s.isActive) return false;

    // 1. Match Product (Code OR Name)
    const codeMatch = s.productCode && normalize(s.productCode) === normalizedCode;
    const nameMatch = s.productName && normalize(s.productName) === normalizedDesc;
    
    if (!codeMatch && !nameMatch) return false;

    // 2. Check Customer Restriction (if defined)
    if (s.applicableCustomers && s.applicableCustomers.length > 0) {
      // If scheme lists customers, ours MUST be in the list
      if (!s.applicableCustomers.includes(normalizedCust)) {
        return false;
      }
    }

    // 3. Check Division (Optional but preferred)
    if (s.division && normalizedDiv) {
        const schemeDiv = normalize(s.division);
        // Relaxed match: Allow if one includes the other (CARDI-CARE vs CAR3 is hard)
        // BUT strict product code match is usually sufficient.
        // Let's only fail if they are COMPLETELY different and length is significant
        // Actually, for now, if Product Code matches, we should trust it. 
        // Division in Scheme Master is often descriptive.
        
        // Only check if Product Code is NOT present (name-only match)
        if (!codeMatch && schemeDiv !== normalizedDiv && !schemeDiv.includes(normalizedDiv) && !normalizedDiv.includes(schemeDiv)) {
             return false;
        }
    }

    return true;
  });
}

export function applyScheme({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
  const scheme = findApplicableScheme(schemes, productCode, itemDesc, customerCode, division);

  if (!scheme || !scheme.slabs?.length) {
    return { schemeApplied: false };
  }

  // Find best qualifying slab
  // Sort descending by minQty so we get the highest applicable slab
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
    availableSlabs: scheme.slabs,
    schemeName: scheme.schemeName // might be useful
  };
}


/**
 * Find better scheme opportunities
 * e.g. If Qty=80 and Scheme starts at 100, suggest 100
 */
export function findUpsellOpportunity({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
  const scheme = findApplicableScheme(schemes, productCode, itemDesc, customerCode, division);

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

export function getSchemesForProduct({ productCode, customerCode, division, schemes }) {
    const scheme = findApplicableScheme(schemes, productCode, "", customerCode, division);
    
    if(!scheme || !scheme.slabs?.length) return [];

    return scheme.slabs.map(slab => ({
        ...slab,
        schemeName: scheme.schemeName || "Scheme",
        productCode: scheme.productCode,
        minQty: slab.minQty,
        freeQty: slab.freeQty,
        schemePercent: slab.schemePercent
    })).sort((a,b) => a.minQty - b.minQty); // Sort by min qty ascending
}

