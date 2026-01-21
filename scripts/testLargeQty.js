console.log("\n🧪 QUANTITY EXTRACTION TEST - Large Orders\n");
console.log("=".repeat(70) + "\n");

// Simulate extraction patterns
const testCases = [
    {
        text: "DOLO 650MG TAB 15'S 3600 0 63410.40",
        expectedQty: 3600,
        description: "Large order quantity"
    },
    {
        text: "3600 0 81.19 292284.00",
        expectedQty: 3600,
        description: "Qty-only line"
    },
    {
        text: "000788 DOLO 650MG TAB 15'S 3600 0 63410.40",
        expectedQty: 3600,
        description: "With SAP code prefix"
    },
    {
        text: "AMOXICILLIN 500MG 5000",
        expectedQty: 5000,
        description: "Very large order"
    },
    {
        text: "1234 PRODUCT NAME 100",
        expectedQty: 100,
        description: "SAP code should be ignored, qty=100"
    }
];

// Simple extraction logic (mimicking the fix)
function extractQty(text) {
    const tokens = text.trim().split(/\s+/);
    
    // Find decimal amount
    const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));
    
    if (amountIdx !== -1) {
        // Search backwards from amount
        for (let i = amountIdx - 1; i >= 0; i--) {
            const token = tokens[i];
            if (!/^\d+$/.test(token)) continue;
            
            const val = Number(token);
            
            // Only block SAP codes at START
            if (i === 0 && val >= 1000 && val <= 9999) {
                console.log(`    Blocked SAP code: ${val}`);
                continue;
            }
            
            if (val >= 1 && val <= 99999) {
                return val;
            }
        }
    }
    
    // Fallback: find last valid number
    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (!/^\d+$/.test(token)) continue;
        
        const val = Number(token);
        
        // Block SAP codes at positions 0-1
        if (i <= 1 && val >= 1000 && val <= 9999) {
            console.log(`    Blocked leading SAP: ${val}`);
            continue;
        }
        
        if (val >= 1 && val <= 99999) {
            return val;
        }
    }
    
    return null;
}

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}: ${test.description}`);
    console.log(`  Input: "${test.text}"`);
    
    const extractedQty = extractQty(test.text);
    
    if (extractedQty === test.expectedQty) {
        passed++;
        console.log(`  ✅ PASS - Extracted: ${extractedQty}`);
    } else {
        failed++;
        console.log(`  ❌ FAIL - Extracted: ${extractedQty}, Expected: ${test.expectedQty}`);
    }
    console.log();
});

console.log("=".repeat(70));
console.log(`\n📊 RESULTS: ${passed}/${testCases.length} passed\n`);

if (passed === testCases.length) {
    console.log("✅ All quantity extraction tests passed!\n");
    console.log("Now correctly extracts:");
    console.log("  • 3600 ✅");
    console.log("  • 5000 ✅");
    console.log("  • Large orders up to 99999 ✅");
    console.log("  • Ignores SAP codes at start ✅\n");
} else {
    console.log(`❌ ${failed} tests failed\n`);
}
