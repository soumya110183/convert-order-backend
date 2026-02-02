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
    /**
     * RULE 2 & 3: STRICT BASE LINEAR PATTERN
     * Identify the SMALLEST slab as "Base".
     * Generate ONLY strict multiples: Base, Base*2, Base*3...
     * IGNORE all other explicit slabs that do not fit this pattern.
     */
    generateVirtualSlabs: (explicitSlabs, orderQty) => {
        // 1. Find the Base Slab (Smallest Quantity)
        const sorted = [...explicitSlabs].filter(s => s.minQty > 0).sort((a, b) => a.minQty - b.minQty);
        if (sorted.length === 0) return [];

        const base = sorted[0];
        const baseQty = base.minQty;
        const baseFree = base.freeQty;

        // 2. Determine target range (cover current order + room for upsell)
        // Ensure we cover at least the orderQty, or a reasonable multiple if order is small
        const maxTarget = Math.max(orderQty * 2, baseQty * 10); 
        
        const allSlabs = [];
        let multiplier = 1;
        let currentQty = baseQty;

        // 3. Generate Linear Series (Strict Multiples)
        while (currentQty <= maxTarget) {
            allSlabs.push({
                minQty: currentQty,
                freeQty: multiplier * baseFree,
                isVirtual: multiplier > 1, // First one is real, others virtual
                schemeName: multiplier > 1 ? `Auto-Pattern (x${multiplier})` : base.schemeName,
                schemePercent: base.schemePercent
            });

            multiplier++;
            currentQty = baseQty * multiplier;
        }

        return allSlabs;
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
    // STANDARD LOGIC (DB Driven)
    // ---------------------------------------------------------

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