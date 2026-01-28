// services/schemeMatcher.js - STRICT PRODUCTION ENGINE
// Strict, Deterministic, Integer-Only Scheme Logic

function normalize(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 🧠 CORE ENGINE: STRICT MATCHING & CALCULATION
 */
const SchemeEngine = {
    /**
     * RULE 1: STRICT PRODUCT MATCHING
     * Find best scheme with strict preference: Customer > Code > Name
     */
    findBestScheme: (schemes, productCode, itemDesc, customerCode, division) => {
        const normCode = normalize(productCode);
        const normDesc = normalize(itemDesc);
        const normCust = normalize(customerCode);
        const normDiv = normalize(division);

        const candidates = schemes.filter(s => {
            if (!s.isActive) return false;
            
            // Match Logic
            const codeMatch = s.productCode && normalize(s.productCode) === normCode;
            const nameMatch = s.productName && normalize(s.productName) === normDesc;
            if (!codeMatch && !nameMatch) return false;

            // Customer Strictness
            if (s.applicableCustomers?.length > 0 && !s.applicableCustomers.includes(normCust)) return false;

            // Division Strictness
            if (s.division && normDiv) {
                const sDiv = normalize(s.division);
                if (sDiv !== normDiv && !sDiv.includes(normDiv) && !normDiv.includes(sDiv)) return false;
            }

            return true;
        });

        if (candidates.length === 0) return null;

        // Scored Sort
        return candidates.sort((a, b) => {
            // Customer specific is top priority
            const aCust = a.applicableCustomers?.includes(normCust) ? 100 : 0;
            const bCust = b.applicableCustomers?.includes(normCust) ? 100 : 0;
            if (aCust !== bCust) return bCust - aCust;

            // Code match > Name match
            const aCode = normalize(a.productCode) === normCode ? 50 : 0;
            const bCode = normalize(b.productCode) === normCode ? 50 : 0;
            if (aCode !== bCode) return bCode - aCode;

            return 0; 
        })[0];
    },

    /**
     * RULE 2 & 3: PATTERN DETECTION & AUTO SLAB GENERATION
     */
    generateVirtualSlabs: (explicitSlabs, orderQty) => {
        // Sort explicit
        const sorted = [...explicitSlabs].filter(s => s.minQty > 0).sort((a, b) => a.minQty - b.minQty);
        if (sorted.length === 0) return [];

        // Base Pattern = Smallest Explicit Slab
        const base = sorted[0];
        const baseQty = base.minQty;
        const baseFree = base.freeQty;

        // Max target to generate up to (cover orderQty + buffer for upsell)
        const maxTarget = Math.max(orderQty * 2, baseQty * 10); 
        
        const allSlabs = [];
        let multiplier = 1;
        let currentQty = baseQty;

        while (currentQty <= maxTarget) {
            // Check if explicit override exists for this qty
            const explicit = sorted.find(s => s.minQty === currentQty);
            
            if (explicit) {
                // RULE 7: PREFER LARGEST EXPLICIT
                allSlabs.push({ ...explicit, isVirtual: false });
            } else {
                // RULE 3: AUTO GENERATE (N * Base)
                allSlabs.push({
                    minQty: currentQty,
                    freeQty: multiplier * baseFree, // N * base_free
                    isVirtual: true,
                    schemeName: `Auto-Pattern (x${multiplier})`
                });
            }

            multiplier++;
            currentQty = baseQty * multiplier;
        }

        return allSlabs.sort((a, b) => a.minQty - b.minQty);
    },

    /**
     * RULE 6 & 8: CALCULATION LOGIC
     * Strict integer blocks. No partials.
     */
    calculate: (orderQty, slabs) => {
        if (orderQty <= 0 || !slabs.length) return { freeQty: 0, appliedSlabs: [] };

        // We use the "Best Fit" logic.
        // Identify the largest slab LEQ orderQty.
        // But since we have generated ALL virtual steps (1x, 2x, 3x...), finding the largest LEQ slab
        // effectively handles the "bulk calculation" rule naturally.
        
        // Example: Base 50->10. Order 180.
        // Virtual slabs: 50->10, 100->20, 150->30, 200->40...
        // Largest LEQ 180 is 150->30.
        // Remaining 30 is < 50, so no more free.
        
        const applicable = slabs.filter(s => s.minQty <= orderQty);
        if (applicable.length === 0) return { freeQty: 0, appliedSlabs: [] };

        const bestSlab = applicable[applicable.length - 1]; // Largest LEQ

        return {
            freeQty: bestSlab.freeQty,
            appliedSlabs: [bestSlab],
            baseSlab: slabs[0] // For metadata
        };
    }
};

/**
 * PUBLIC API: APPLY SCHEME
 */
export function applyScheme({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
    const scheme = SchemeEngine.findBestScheme(schemes, productCode, itemDesc, customerCode, division);
    if (!scheme) return { schemeApplied: false };

    
    // ---------------------------------------------------------
    // SPECIAL LOGIC: DOLO 650 (FTIND0352) -> 25% Proportional
    // ---------------------------------------------------------
    const isDolo650 = (productCode === 'FTIND0352') || (scheme.productName && scheme.productName.includes("DOLO- 650"));
  
    if (isDolo650 && orderQty >= 4) {
        const ratio = 0.25; 
        const freeQty = Math.round(orderQty * ratio);
        return {
              schemeApplied: true,
              freeQty: freeQty,
              schemePercent: 25,
              appliedSlab: { minQty: 4, freeQty: 1, schemePercent: 25 },
              multiplier: 1,
              baseRatio: { minQty: 4, freeQty: 1 },
              calculation: `DOLO 650 Special: ${orderQty} * 25% = ${freeQty} (Rounded)`,
              availableSlabs: scheme.slabs,
              schemeName: scheme.schemeName,
        };
    }

    // 1. Generate Universe of Slabs (Explicit + Virtual)
    const allSlabs = SchemeEngine.generateVirtualSlabs(scheme.slabs || [], orderQty);
    
    // 2. Strict Calculation
    const result = SchemeEngine.calculate(orderQty, allSlabs);

    if (result.freeQty > 0) {
        return {
            schemeApplied: true,
            freeQty: result.freeQty,
            schemeName: scheme.schemeName,
            appliedSlab: result.appliedSlabs[0],
            allSlabs: allSlabs, // Return for frontend visualization
            calculation: `${result.appliedSlabs[0].minQty} -> ${result.appliedSlabs[0].freeQty} Free`
        };
    }

    return { 
        schemeApplied: false,
        reason: 'BELOW_MIN_QTY', 
        nextSlab: allSlabs[0],
        allSlabs 
    };
}

/**
 * PUBLIC API: UPSELL / NEXT SLAB
 */
export function findUpsellOpportunity({ productCode, orderQty, itemDesc, division, customerCode, schemes }) {
    const scheme = SchemeEngine.findBestScheme(schemes, productCode, itemDesc, customerCode, division);
    if (!scheme) return null;

    const allSlabs = SchemeEngine.generateVirtualSlabs(scheme.slabs || [], orderQty);
    
    // Find next slab strictly > orderQty
    const next = allSlabs.find(s => s.minQty > orderQty);
    
    // Rule: Suggest only if within reasonable reach (e.g. +50% or +100 units)
    if (next && (next.minQty - orderQty) <= Math.max(50, orderQty * 0.5)) {
        const currentFree = SchemeEngine.calculate(orderQty, allSlabs).freeQty;
        const nextFree = next.freeQty;
        
        return {
            targetQty: next.minQty,
            addQty: next.minQty - orderQty,
            additionalFree: nextFree - currentFree,
            message: `Add ${next.minQty - orderQty} for +${nextFree - currentFree} free`
        };
    }
    return null;
}

export function getSchemesForProduct(params) {
    const scheme = SchemeEngine.findBestScheme(params.schemes, params.productCode, "", params.customerCode, params.division);
    if (!scheme) return [];
    // Return explicit SCHEME OBJECT(s) wrapped in array, so frontend can access scheme.slabs
    return [scheme];
}

export function calculateFreeQty(params) {
    return applyScheme(params);
}