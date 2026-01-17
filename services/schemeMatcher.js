// schemeMatcher.js - FIXED VERSION
export function applyScheme({ productCode, orderQty, schemes }) {
  if (!schemes?.length) return { freeQty: 0 };
  
  // Find scheme for this product
  const scheme = schemes.find(s => 
    s.productCode === productCode && 
    orderQty >= (s.minQty || 0)
  );
  
  if (!scheme) return { freeQty: 0 };
  
  // Calculate free quantity
  let freeQty = 0;
  
  if (scheme.schemePercent > 0) {
    // Percentage-based scheme
    freeQty = Math.floor(orderQty * scheme.schemePercent);
  } else if (scheme.freeQty > 0 && scheme.minQty > 0) {
    // Buy X get Y free
    const batches = Math.floor(orderQty / scheme.minQty);
    freeQty = batches * scheme.freeQty;
  }
  
  return {
    freeQty,
    schemePercent: scheme.schemePercent || 0,
    schemeApplied: !!scheme
  };
}