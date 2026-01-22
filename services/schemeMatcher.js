// services/schemeMatcher.js - FIXED FOR PROPORTIONAL SCALING

function normalize(text = "") {
  return String(text).toUpperCase().trim()
    .replace(/[-_/]/g, " ")  ;
  
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
      if (!s.applicableCustomers.includes(normalizedCust)) {
        return false;
      }
    }

    // 3. Check Division (Optional)
    if (s.division && normalizedDiv) {
        const schemeDiv = normalize(s.division);
        if (!codeMatch && schemeDiv !== normalizedDiv && 
            !schemeDiv.includes(normalizedDiv) && 
            !normalizedDiv.includes(schemeDiv)) {
             return false;
        }
    }

    return true;
  });
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

  // ✅ FIND BASE SLAB (smallest minQty)
  const baseSlab = scheme.slabs
    .filter(s => s.minQty > 0)
    .sort((a, b) => a.minQty - b.minQty)[0];

  if (!baseSlab) {
    return { schemeApplied: false };
  }

  // ✅ CHECK IF ORDER QUALIFIES (must meet base slab minimum)
  if (orderQty < baseSlab.minQty) {
    return { 
      schemeApplied: false,
      reason: 'ORDER_BELOW_MINIMUM',
      minimumQty: baseSlab.minQty
    };
  }

  // ✅ CALCULATE MULTIPLIER (how many times the base slab fits)
  const multiplier = Math.floor(orderQty / baseSlab.minQty);
  
  // ✅ PROPORTIONAL FREE QUANTITY
  const totalFreeQty = multiplier * (baseSlab.freeQty || 0);

  // ✅ CALCULATE ACTUAL SCHEME PERCENT
  const schemePercent = orderQty > 0 && totalFreeQty > 0
    ? Number(((totalFreeQty / orderQty) * 100).toFixed(2))
    : (baseSlab.schemePercent * 100 || 0);

  return {
    schemeApplied: true,
    freeQty: totalFreeQty,
    schemePercent: schemePercent / 100, // Convert back to decimal
    appliedSlab: baseSlab,
    multiplier,
    baseRatio: {
      minQty: baseSlab.minQty,
      freeQty: baseSlab.freeQty
    },
    calculation: `${orderQty} ÷ ${baseSlab.minQty} = ${multiplier} × ${baseSlab.freeQty} = ${totalFreeQty} free`,
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

  // Find base slab
  const baseSlab = scheme.slabs
    .filter(s => s.minQty > 0)
    .sort((a, b) => a.minQty - b.minQty)[0];
  
  if (!baseSlab || baseSlab.minQty <= 0) return null;

  // Current multiplier
  const currentMultiplier = Math.floor(orderQty / baseSlab.minQty);
  
  // Target next multiplier
  const targetMultiplier = currentMultiplier + 1;
  const targetQty = targetMultiplier * baseSlab.minQty;
  const diff = targetQty - orderQty;

  // Only suggest if difference is reasonable (within 60% of base slab)
  const threshold = baseSlab.minQty * 0.6;
  
  if (diff > 0 && diff <= threshold) {
      const currentFreeQty = currentMultiplier * (baseSlab.freeQty || 0);
      const potentialFreeQty = targetMultiplier * (baseSlab.freeQty || 0);
      const additionalFree = potentialFreeQty - currentFreeQty;
      
      return {
          productCode,
          currentQty: orderQty,
          currentFreeQty,
          suggestedQty: targetQty,
          addQty: diff,
          potentialFreeQty,
          additionalFree,
          schemePercent: baseSlab.schemePercent,
          schemeName: scheme.schemeName || "Scheme",
          message: `Add ${diff} more to get ${additionalFree} additional free (total: ${potentialFreeQty} free)`
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