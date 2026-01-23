
import { matchProductSmart } from "./services/productMatcher.js";
import { extractQuantity } from "./services/unifiedParser.js";
import { extractStrength } from "./utils/extractionUtils.js";
import fs from 'fs';
import util from 'util';

const logFile = fs.createWriteStream('verification_debug.log', { flags: 'w' });

// Override console.log to capture ALL output including from imported modules
const originalLog = console.log;
console.log = function(...args) {
  const msg = util.format(...args);
  logFile.write(msg + '\n');
  originalLog.apply(console, args);
};

function verifyFixes() {
    console.log("=== VERIFICATION START ===");

    // 1. STRENGTH FIX VERIFICATION
    console.log("\n[TEST 1] Strength Extraction:");
    const s1 = extractStrength("DOLO 650");
    const s2 = extractStrength("DOLO DROPS");
    console.log(`'DOLO 650' -> '${s1}' (Expected: 650MG)`);
    console.log(`'DOLO DROPS' -> '${s2}' (Expected: null or empty)`);
    
    if (s1 === "650MG" && !s2) {
        console.log("✅ Strength Extraction Fix: PASSED");
    } else {
        console.log("❌ Strength Extraction Fix: FAILED");
    }

    // 2. MAPPING FIX VERIFICATION
    console.log("\n[TEST 2] Product Mapping (DOLO DROPS vs DOLO 650):");
    const products = [
        { productName: "DOLO 650", _id: "1" },
        { productName: "CALPOL 500", _id: "2" }
    ];
    // DOLO DROPS has no strength. DOLO 650 has 650MG. They should NOT be compatible.
    const match = matchProductSmart("DOLO DROPS", products);
    const matchName = match ? match.productName : "NO MATCH";
    console.log(`Mapping 'DOLO DROPS' -> '${matchName}'`);

    if (matchName !== "DOLO 650") {
        console.log("✅ Mapping Fix: PASSED (Prevented bad match)");
    } else {
        console.log("❌ Mapping Fix: FAILED (Still matched incorrectly)");
    }

    // 3. QUANTITY FIX VERIFICATION
    console.log("\n[TEST 3] Quantity Extraction (Amount Blocking):");
    const q1 = extractQuantity("DOLO 650 500.00"); // Amount 500.00
    console.log(`'DOLO 650 500.00' -> Qty: ${q1} (Expected: null or < 100)`);
    
    const q2 = extractQuantity("DOLO 650 10 500.00"); // Qty 10, Amount 500.00
    console.log(`'DOLO 650 10 500.00' -> Qty: ${q2} (Expected: 10)`);

    const q3 = extractQuantity("DOLO 650 500"); // Ambiguous 500. Should be blocked.
    console.log(`'DOLO 650 500' -> Qty: ${q3} (Expected: null)`);

    if (q1 !== 500 && q2 === 10 && q3 !== 500) {
        console.log("✅ Quantity Fix: PASSED");
    } else {
        console.log("❌ Quantity Fix: FAILED");
    }

    console.log("\n=== VERIFICATION END ===");
    // Don't close logFile immediately to ensure async logs flush? Sync writes above.
}

verifyFixes();
