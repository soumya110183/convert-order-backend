// services/schemeMatcher.js - FIXED FOR PROPORTIONAL SCALING

function normalize(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ") // Replace all punctuation with space
    .replace(/\s+/g, " ")       // Collapse spaces
    .trim();
}

/**
 * Find the best applicable scheme for a given product and context
 */
/**
 * Find the best applicable scheme for a given product and context
 * ✅ CONFLICT RESOLUTION: Returns the most specific match
 */
function findApplicableScheme(schemes, productCode, itemDesc, customerCode, division) {
  const normalizedCode = normalize(productCode);
  const normalizedDesc = normalize(itemDesc);
  const normalizedDiv = normalize(division);
  const normalizedCust = normalize(customerCode);

  // 1. Find ALL candidates
  const candidates = schemes.filter(s => {
    if (!s.isActive) return false;

    // A. Product Match
    const codeMatch = s.productCode && normalize(s.productCode) === normalizedCode;
    const nameMatch = s.productName && normalize(s.productName) === normalizedDesc;
    
    if (!codeMatch && !nameMatch) return false;

    // B. Customer Match (Strict: If scheme has customers, must match)
    if (s.applicableCustomers && s.applicableCustomers.length > 0) {
      if (!s.applicableCustomers.includes(normalizedCust)) {
        return false;
      }
    }

    // C. Division Match (Soft: If scheme has division, it SHOULD match, but we might allow cross-div if no better option)
    // Actually, for now, let's keep strict division matching if the scheme HAS a division defined
    if (s.division && normalizedDiv) {
        const schemeDiv = normalize(s.division);
        if (schemeDiv !== normalizedDiv && !schemeDiv.includes(normalizedDiv) && !normalizedDiv.includes(schemeDiv)) {
             return false;
        }
    }

    return true;
  });

  if (candidates.length === 0) return null;

  // 2. Score Candidates
  const scored = candidates.map(s => {
      let score = 0;

      // Rule 1: Customer Specific is Highest Priority
      if (s.applicableCustomers?.includes(normalizedCust)) score += 100;

      // Rule 2: Exact Code match > Name match
      if (s.productCode && normalize(s.productCode) === normalizedCode) score += 50;
      else if (s.productName && normalize(s.productName) === normalizedDesc) score += 20;

      // Rule 3: Exact Division match > Partial/Global
      if (s.division && normalize(s.division) === normalizedDiv) score += 10;

      return { scheme: s, score };
  });

  // 3. Return Best Match
  scored.sort((a, b) => b.score - a.score);
  return scored[0].scheme;
}

/**
 * ✅ PROPORTIONAL SCHEME APPLICATION
 * 
 * Logic:
 * 1. Find the BASE slab (smallest minQty)
 * 2. Calculate multiplier = floor(orderQty / baseSlab.minQty)
 * 3. Free qty = multiplier × baseSlab.freeQty
 * 
 * Example:
 * - Base slab: 100+20
 * - Order: 300
 * - Multiplier: 3
 * - Free: 3 × 20 = 60
 */
export function applyScheme({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
  const scheme = findApplicableScheme(schemes, productCode, itemDesc, customerCode, division);

  if (!scheme || !scheme.slabs?.length) {
    return { schemeApplied: false };
  }

  // ✅ BEST SLAB SELECTION LOGIC
  // Iterate all slabs to find which one gives the MAXIMUM free quantity for the current orderQty
  let bestSlab = null;
  let maxFreeQty = -1;
  let bestMultiplier = 0;

  // Filter valid slabs (minQty > 0)
  const validSlabs = scheme.slabs.filter(s => s.minQty > 0);

  if (validSlabs.length === 0) return { schemeApplied: false };

  // Check each slab
  validSlabs.forEach(slab => {
      if (orderQty >= slab.minQty) {
          const multiplier = Math.floor(orderQty / slab.minQty);
          // If freeQty is 0, we still care about the slab match (maybe it's a discount scheme, but here we track freeQty)
          // Ideally check schemePercent too, but freeQty is priority based on user request "300+60"
          const totalFree = multiplier * (slab.freeQty || 0);

          // Logic: Prefer higher free qty. If equal, prefer higher tier (larger minQty) as it usually implies better status.
          if (totalFree > maxFreeQty || (totalFree === maxFreeQty && bestSlab && slab.minQty > bestSlab.minQty)) {
              maxFreeQty = totalFree;
              bestSlab = slab;
              bestMultiplier = multiplier;
          }
      }
  });

  // If no slab qualified (orderQty < smallest minQty)
  if (!bestSlab) {
    // Find limits for reporting
    const minSlab = validSlabs.sort((a, b) => a.minQty - b.minQty)[0];
    return { 
      schemeApplied: false,
      reason: 'ORDER_BELOW_MINIMUM',
      minimumQty: minSlab ? minSlab.minQty : 0
    };
  }
  
  // ✅ CALCULATE ACTUAL SCHEME PERCENT
  const schemePercent = orderQty > 0 && maxFreeQty > 0
    ? Number(((maxFreeQty / orderQty) * 100).toFixed(2))
    : (bestSlab.schemePercent * 100 || 0);

  return {
    schemeApplied: true,
    freeQty: maxFreeQty,
    schemePercent: schemePercent / 100, // Convert back to decimal
    appliedSlab: bestSlab,
    multiplier: bestMultiplier,
    baseRatio: {
      minQty: bestSlab.minQty,
      freeQty: bestSlab.freeQty
    },
    calculation: `${orderQty} ÷ ${bestSlab.minQty} = ${bestMultiplier} × ${bestSlab.freeQty} = ${maxFreeQty} free`,
    availableSlabs: scheme.slabs,
    schemeName: scheme.schemeName
  };
}


/**
 * ✅ UPSELL SUGGESTION (Next Multiple)
 * 
 * Example:
 * - Base slab: 100+20
 * - Order: 280
 * - Current multiplier: 2 (gets 40 free)
 * - Suggest: Order 300 (3× multiplier) to get 60 free
 */
export function findUpsellOpportunity({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
  const scheme = findApplicableScheme(schemes, productCode, itemDesc, customerCode, division);

  if (!scheme || !scheme.slabs?.length) return null;

  // Calculate current free qty (using our robust applyScheme logic)
  const currentResult = applyScheme({ productCode, orderQty, itemDesc, division, customerCode, schemes });
  const currentFree = currentResult.freeQty || 0;

  let bestSuggestion = null;
  let maxMarginalGain = -1; // (Additional Free) / (Additional Order)

  // Filter valid slabs
  const validSlabs = scheme.slabs.filter(s => s.minQty > 0);

  // Check potential targets for ALL slabs
  validSlabs.forEach(slab => {
      // Find next multiple breakpoint
      // If below minQty, next is minQty.
      // If above, next is (mult + 1) * minQty
      const multiplier = Math.floor(orderQty / slab.minQty);
      const targetMultiplier = multiplier + 1;
      const targetQty = targetMultiplier * slab.minQty;
      
      const diff = targetQty - orderQty;

      // Rule: Only suggest if diff is reasonable (e.g. within 50% of current order OR small absolute number)
      // User example: 260 -> 300 (diff 40). 40 is ~15%. this is reasonable.
      // Let's cap at 50% increase or 100 units, whichever is safer? 
      // Actually, standard is "within reasonable reach". Let's say max 60% increase.
      const isReasonableWait = diff > 0 && (diff <= orderQty * 0.6 || diff <= 50); 
      
      if (isReasonableWait) {
          const potentialFree = targetMultiplier * (slab.freeQty || 0);
          const additionalFree = potentialFree - currentFree;

          if (additionalFree > 0) {
              const marginalGain = additionalFree / diff; // Efficiency: Free units per Added unit

              if (marginalGain > maxMarginalGain) {
                  maxMarginalGain = marginalGain;
                  bestSuggestion = {
                      targetQty,
                      diff,
                      additionalFree,
                      potentialFree
                  };
              }
          }
      }
  });

  if (bestSuggestion) {
      return {
          productCode,
          currentQty: orderQty,
          currentFreeQty: currentFree,
          suggestedQty: bestSuggestion.targetQty,
          addQty: bestSuggestion.diff,
          potentialFreeQty: bestSuggestion.potentialFree,
          additionalFree: bestSuggestion.additionalFree,
          schemeName: scheme.schemeName || "Scheme",
          message: `Add ${bestSuggestion.diff} more to get ${bestSuggestion.additionalFree} additional free (Total: ${bestSuggestion.potentialFree})`
      };
  }

  return null;
}

/**
 * Get all available schemes for a product
 */
export function getSchemesForProduct({ productCode, customerCode, division, schemes }) {
    const scheme = findApplicableScheme(schemes, productCode, "", customerCode, division);
    
    if(!scheme || !scheme.slabs?.length) return [];

    // Sort slabs by minQty and return
    return scheme.slabs
        .map(slab => ({
            ...slab,
            schemeName: scheme.schemeName || "Scheme",
            productCode: scheme.productCode,
            minQty: slab.minQty,
            freeQty: slab.freeQty,
            schemePercent: slab.schemePercent
        }))
        .sort((a, b) => a.minQty - b.minQty);
}

/**
 * ✅ NEW: Calculate exact free quantity for any given order quantity
 * Useful for frontend calculators
 */
export function calculateFreeQty({ productCode, orderQty, division, customerCode, schemes }) {
    const result = applyScheme({
        productCode,
        orderQty,
        itemDesc: "",
        division,
        customerCode,
        schemes
    });

    if (!result.schemeApplied) {
        return {
            success: false,
            freeQty: 0,
            message: result.reason === 'ORDER_BELOW_MINIMUM' 
                ? `Minimum order: ${result.minimumQty}` 
                : 'No scheme available'
        };
    }

    return {
        success: true,
        orderQty,
        freeQty: result.freeQty,
        multiplier: result.multiplier,
        baseRatio: result.baseRatio,
        calculation: result.calculation
    };
}