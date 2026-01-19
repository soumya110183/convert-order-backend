export function applyScheme({ productCode, orderQty, schemes }) {
  const scheme = schemes.find(
    s => s.productCode === productCode && s.isActive
  );

  if (!scheme || !scheme.slabs?.length) {
    return { schemeApplied: false };
  }

  const eligibleSlab = scheme.slabs
    .filter(s => orderQty >= s.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  if (!eligibleSlab) {
    return {
      schemeApplied: false,
      availableSlabs: scheme.slabs
    };
  }

  return {
    schemeApplied: true,
    freeQty: eligibleSlab.freeQty,
    schemePercent: eligibleSlab.schemePercent,
    appliedSlab: eligibleSlab,
    availableSlabs: scheme.slabs
  };
}
