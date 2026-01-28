
import { applyScheme, findUpsellOpportunity } from './services/schemeMatcher.js';

console.log("=== SCHEME ENGINE VERIFICATION ===");

const schemes = [
    {
        schemeId: 'S1',
        isActive: true,
        productCode: 'P001',
        slabs: [
            { minQty: 50, freeQty: 10 } // Base Pattern: 10 free for every 50
        ]
    },
    {
        schemeId: 'S2',
        isActive: true,
        productCode: 'P002',
        slabs: [
            { minQty: 50, freeQty: 10 },
            { minQty: 200, freeQty: 50 } // Override: Better than 40 (4 * 10)
        ]
    }
];

// TEST 1: Exact Base Match
const t1 = applyScheme({ productCode: 'P001', orderQty: 50, schemes });
console.log(`T1 (50->10): Ordered 50 => Got ${t1.freeQty}`, t1.freeQty === 10 ? "✅" : "❌");

// TEST 2: Below Min
const t2 = applyScheme({ productCode: 'P001', orderQty: 49, schemes });
console.log(`T2 (<50): Ordered 49 => Got ${t2.freeQty}`, t2.freeQty === undefined || t2.freeQty === 0 ? "✅" : "❌");

// TEST 3: Pattern Extension (2x)
const t3 = applyScheme({ productCode: 'P001', orderQty: 100, schemes });
console.log(`T3 (100->?): Ordered 100 => Got ${t3.freeQty} (Exp 20)`, t3.freeQty === 20 ? "✅" : "❌");

// TEST 4: Pattern Extension (3x)
const t4 = applyScheme({ productCode: 'P001', orderQty: 150, schemes });
console.log(`T4 (150->?): Ordered 150 => Got ${t4.freeQty} (Exp 30)`, t4.freeQty === 30 ? "✅" : "❌");

// TEST 5: Explicit Override
const t5 = applyScheme({ productCode: 'P002', orderQty: 200, schemes });
console.log(`T5 (Override): Ordered 200 => Got ${t5.freeQty} (Exp 50)`, t5.freeQty === 50 ? "✅" : "❌");

// TEST 6: Upsell
const t6 = findUpsellOpportunity({ productCode: 'P001', orderQty: 45, schemes });
console.log(`T6 (Upsell): Ordered 45 => Suggest ${t6?.targetQty} (Exp 50)`, t6?.targetQty === 50 ? "✅" : "❌");

// TEST 7: DOLO 650 Special
const doloSchemes = [{ schemeName: 'DOLO- 650', isActive: true, slabs: [{minQty: 4, freeQty: 1}] }];
const t7 = applyScheme({ productCode: 'FTIND0352', orderQty: 10, schemes: doloSchemes });
console.log(`T7 (DOLO): Ordered 10 => Got ${t7.freeQty} (Exp 2.5->3 or 2?)`, t7.freeQty); 
// Note: Dolo logic round(10 * 0.25) = 2.5 -> 3
