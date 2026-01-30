

import XLSX from "xlsx-js-style";
import { extractTextFromPDFAdvanced } from "./pdfParser.js";
import { detectCustomerFromInvoice } from "./customerDetector.js";
import { mergePDFRowsTableAware } from "../utils/tableAwareMerging.js";
import { normalizeProductName } from "../utils/productNormalizer.js";

/* =====================================================
   CONFIGURATION
===================================================== */

const DEBUG_MODE = true;
const MIN_PRODUCT_LENGTH = 3;
const MIN_QTY = 1;
const MAX_QTY = 999999;

function debug(...args) {
  if (DEBUG_MODE) console.log(...args);
}

function isPackToken(token = "") {
  return /^\d+['`"]?S$/i.test(token);
}

function normalizeColumnName(name = "") {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[.\s_-]+/g, "");
}

/* =====================================================
   JUNK DETECTION
===================================================== */

const HARD_JUNK_PATTERNS = [
  /^(PAGE|PRINTED\s*BY|SIGNATURE|PREPARED\s*BY|CHECKED\s*BY)/i,
  /^(GSTIN|DL\s*NO|FSSAI|LICENSE\s*NO)/i,
  /^(PIN\s*CODE|PHONE|EMAIL|FAX)/i,
  /^(NOTE|REMARK|COMMENT|KINDLY|PLEASE|REQUEST)[\s:]/i,  // 🔥 NEW: Skip note fields
  /^-+$/,
  /^_+$/,
  /^=+$/,
];

function isHardJunk(text) {
  const upper = text.toUpperCase();
  return HARD_JUNK_PATTERNS.some(p => p.test(upper));
}

/* =====================================================
   INVALID PRODUCT NAME PATTERNS
===================================================== */

const INVALID_PRODUCT_PATTERNS = [
  /^TAB\s*\d+$/i,
  /^CAP\s*\d+$/i,
  /^SYP\s*\d+$/i,
  /^SEND\s+/i,           // 🔥 NEW: "SEND UMBRELLA"
  /^KINDLY\s+/i,         // 🔥 NEW: "KINDLY SEND"
  /^PLEASE\s+/i,         // 🔥 NEW: "PLEASE PROVIDE"
  /^NOTE[\s:]/i,         // 🔥 NEW: "NOTE:"
  /^REMARK[\s:]/i,       // 🔥 NEW: "REMARK:"
  /^\d+\s*TAB$/i,
  /^\d+\s*CAP$/i,
  /^[A-Z]{1,2}\s*\d+$/,
  /^\d{1,4}$/,          // 🔥 ENHANCED: Block standalone small numbers (order numbers, IDs, etc.) 1-4 digits
  /\bDATE\s+\d{1,2}\b/i,
  /\bORDER\s*NO\b/i,
  /\bPOD[-\s]?\d+/i,
  /\bINVOICE\s*NO\b/i,
  /\bDELIVERY\s*NOTE\b/i,
  /\bCHALLAN\b/i,
  /\bPURCHASE\s*ORDER\b/i,
  /\bPO\s*NO\b/i,
  /\bNOV\b|\bDEC\b|\bJAN\b|\bFEB\b/i,
  /^ORDER\s*DT/i,        // 🔥 NEW: "ORDER DT", "Order Dt."
  /^COMPANY\b/i,         // 🔥 NEW: Company names
  /^COMPAY\b/i,          // 🔥 NEW: Typo "COMPAY" (seen in invoices)
  // 🔥 FOOTER PATTERNS: Common disclaimers and notes at bottom of invoices
  /^CANCEL\b/i,          // "Cancel all our pending orders"
  /^DO\s+NOT\b/i,        // "Do not execute any telephonic orders"
  /^\d+\s+F\s*DO\b/i,    // "1 FDo not execute..." (common footer format)
  /^\d+\s+F\b/i,         // "3 F" (footer marker)
  /^SY\s*CANCEL\b/i,     // "SY Cancel" (footer notes)
  /\bAUTHORI[SZ]ED\s+SIGNATURE\b/i,  // "Authorised Signature"
  /\bUSED\s+IT\s+TIME\b/i,           // "Used it Time: A"
  /^USER\b/i,            // "User it Time", "User"
  /^USED\b/i,            // "Used it Time"
  /\bUSER\s+IT\s+TIME\b/i,           // "User it Time: A" (variation)
  /^TIME[\s:]/i,         // "Time: A", "Time:"
  /\bSIGNATURE\b/i,      // Generic signature line
  /\bREPRESENTATIVE/i,   // "Representatives"
  /\bTELEPHONIC\s+ORDER/i, // "telephonic orders"
  /\bPENDING\s+ORDER/i   // "pending orders"
];

function isInvalidProductName(text) {
  if (!text) return true;
  const cleaned = text.trim().toUpperCase();
  return INVALID_PRODUCT_PATTERNS.some(pattern => pattern.test(cleaned));
}

/* =====================================================
   PRODUCT DETECTION
===================================================== */

const MEDICINE_PATTERNS = [
  /\b\d+\s*(MG|ML|MCG|IU|GM|KG|G)\b/i,
  /\b(TAB|TABLET|CAP|CAPSULE|SYP|SYRUP|INJ|INJECTION)\b/i,
  /\b(DROPS?|CREAM|OINTMENT|GEL|LOTION|POWDER)\b/i,
  /\d+['`"]S\b/i,
];

const BRAND_PATTERNS = [
  /\b[A-Z]{4,}\b/i
];

const STRUCTURE_PATTERNS = [
  /^[A-Z][A-Z\s\-]{2,}\s+\d+/i,
  /^[A-Z][A-Z\s\-]{2,}\s*-\s*[A-Z]{2}/i,
];

const NOT_PRODUCT_PATTERNS = [
  /^(TOTAL|SUBTOTAL|GRAND\s*TOTAL|NET\s*AMOUNT)/i,
  /^(CGST|SGST|IGST|GST|TAX)/i,
  /^(DISCOUNT|LESS|ADD|BALANCE)/i,
  /^(THANK\s*YOU|REGARDS|SIGNATURE)/i,
  /^(CONTINUED|CARRIED\s*FORWARD)/i,
  /^\d+\s*$/,
];

function looksLikeProduct(text, strict = true) {
  if (!text || text.length < 3) return false;  // 🔥 LOWERED from 5 to 3

  const upper = text.toUpperCase();

  // ❌ Hard reject junk
  if (isInvalidProductName(upper)) return false;
  if (isHardJunk(upper)) return false;

  // ❌ Reject GST / PAN / Codes
  // GST is 15 chars, PAN is 10. Usually mixed strict pattern.
  // Avoid blocking "NITROFIX 30SR" (12 chars) by ensuring it LOOKS like a code
  const spaceless = upper.replace(/\s/g, "");
  // True GST: 2 digits + 5 letters + 4 digits + 1 letter + 1 digit + 1 letter/digit
  // Simple check: mostly mixed, no meaningful words
  if (/^[0-9A-Z]{10,15}$/.test(spaceless)) {
     // If it has decent length words, it's likely a product, not a code
     const words = text.split(/\s+/);
     const maxWordLen = Math.max(...words.map(w => w.length));
     // If it has a word > 4 chars that is purely letters, it is PROBABLY a product (NITROFIX)
     // Codes usually don't have long dictionary-like words
     const hasLongWord = words.some(w => /^[A-Z]{4,}$/i.test(w));
     
     if (!hasLongWord && /\d/.test(spaceless) && /[A-Z]/.test(spaceless)) {
       return false; // Valid code
     }
  }

  // 🔥 PRIORITY: Table row detection (works even without form words)
  // Pattern: "2 218038 NITROFIX 30SR 10,S 10 1957.50 50"
  const tokens = text.trim().split(/\s+/);
  
  // Normal format: serial code product ...
  // Existing numeric check
  if (tokens.length >= 4 && /^\d{1,2}$/.test(tokens[0]) && /^\d{3,6}$/.test(tokens[1])) {
    const serialNum = Number(tokens[0]);
    if (serialNum >= 1 && serialNum <= 99 && /\d+\.\d{2}/.test(text) && /[A-Z]{3,}/i.test(text)) {
      debug(`  ✅ [TABLE] Row ${serialNum}, Code ${tokens[1]}`);
      return true;
    }
  }

  // 🔥 NEW: Qty-Code-Product Pattern (Common in this user's PDF)
  // e.g. "30 P1 PREGATOR...", "10 L1 LINAPRIDE..."
  // Token 0: Number (Qty)
  // Token 1: Short Code (A-Z + Digit, e.g. P1, D4, L1, or just 2-3 chars)
  // Token 2: Product Name start (3+ chars)
  if (tokens.length >= 3) {
      const t0 = tokens[0];
      const t1 = tokens[1];
      const t2 = tokens[2];
      
      const isQty = /^\d{1,5}$/.test(t0); // 1-99999
      const isShortCode = /^[A-Z]?[A-Z]?[0-9]{1,4}$/i.test(t1) || /^[A-Z][0-9][A-Z]$/i.test(t1); // P1, S1, D4, 100, etc.
      const isName = /[A-Z]{3,}/i.test(t2);
      
      if (isQty && isShortCode && isName) {
           return true; 
      }
  }

  // 🔥 REVERSED TABLE ROW: qty price serial code product
  // Pattern: "10 35 3148.60 2 110010 MECONERV 500"
  if (tokens.length >= 6 && /^\d{1,2}$/.test(tokens[0]) && /^\d+\.\d{2}$/.test(tokens[2])) {
    // tokens[0] = pack/qty, tokens[1] = qty, tokens[2] = price.xx
    // tokens[3] should be serial (1-2 digits), tokens[4] should be code (3-6 digits)
    if (/^\d{1,2}$/.test(tokens[3]) && /^\d{3,6}$/.test(tokens[4]) && /[A-Z]{3,}/i.test(text)) {
      debug(`  ✅ [TABLE-REVERSED] Serial ${tokens[3]}, Code ${tokens[4]}`);
      return true;
    }
  }


  // ✅ MUST contain medicine identity
  const hasForm = /\b(TAB|TABLET|CAP|CAPSULE|CAPS|INJ|SYRUP|SYP|DROPS|DRPS|CREAM|GEL|OINT|VIAL|AMP)\b/i.test(upper);
  const hasStrength = /\b\d+\s*(MG|ML|MCG|IU|GM)\b/i.test(upper);
  // 🔥 FIX: Allow "10S" without separator (e.g. DOLO 10S)
  const hasPack = /\d+['"`]?S\b/i.test(upper);

  if (hasForm || hasStrength || hasPack) return true;

  // 🔥 FALLBACK: Relaxed detection for PDFs without explicit form words
  if (!strict) {
    return looksLikeProductRelaxed(text);
  }

  // ❌ NO medicine signal → NOT a product
  return false;
}

/**
 * Relaxed product detection for PDFs without form keywords
 * Uses structural patterns and context
 */
function looksLikeProductRelaxed(text) {
  if (!text || text.length < 3) return false;

  const upper = text.toUpperCase();

  // ❌ Reject obvious non-products
  if (NOT_PRODUCT_PATTERNS.some(p => p.test(upper))) return false;

  // ❌ Reject common junk patterns
  const JUNK_RELAXED = [
    /^(ORDER\s*DATE|DELIVERY\s*DATE|INVOICE\s*DATE)/i,
    /^(SUPPLIER|CUSTOMER|BILL\s*TO|SHIP\s*TO)/i,
    /^(APPROX\s*VALUE|TOTAL\s*VALUE|NET\s*VALUE)/i,
    /^(SL\s*NO|CODE|PRODUCT\s*NAME|PACKING|QTY|AMOUNT)/i,
    /^(FOR\.|THIS\s*IS\s*A|SOFTWARE|GENERATED)/i,
    /^[A-Z\s]+\s*:$/,  // "Order Date :", "Supplier :"
    /^\d+\/\d+/,  // Addresses like "40/1364"
    /ROAD|STREET|AVENUE|BUILDING|FLOOR/i,
    /KERALA|ERNAKULAM|KANNUR|BANGALORE/i,  // City names
    /SYSTEMS|LIMITED|LTD|PVT/i,  // Company suffixes
  ];

  if (JUNK_RELAXED.some(p => p.test(upper))) return false;

  // ❌ Reject if too short or too long
  const words = upper.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 1 || words.length > 15) return false;  // 🔥 Changed from 2 to 1

  // ✅ Pattern 1: Single uppercase word with good length (PLAGERINE, MECONERV)
  if (words.length === 1 && words[0].length >= 5 && /^[A-Z]+$/.test(words[0])) {
    return true;
  }

  // ✅ Pattern 2: Pure uppercase brand name (e.g. "AVAS", "ANGIZAAR", "VILDAPRIDE M")
  // Must be significant length (3+) and look like a name
  if (/^[A-Z0-9\s\-]+$/.test(upper)) {
     const clean = upper.replace(/\s+/g, "");
     // Must have at least 3 letters
     const letters = clean.replace(/[^A-Z]/g, "").length;
     if (letters >= 3) return true;
  }

  // 🔥 RELAXED: Products don't always have numbers (PLAGERINE, MECONERV)
  // Only check number patterns if we haven't matched above
  // if (!/\d/.test(upper)) return false;  // DISABLED

  // ✅ Has brand-like pattern: WORD + NUMBER (DOLO 650, AMOXICILLIN 500)
  if (/\b[A-Z]{3,}[A-Z\s\-]*\d+/i.test(upper)) {
    // But not if it's just a code at the start
    if (/^\d{3,6}\s+[A-Z]/.test(upper)) return true;  // "1013 DIANORM-OD"
    if (/[A-Z]{3,}.*\d{1,4}(?:MG|ML|MCG|GM)?/i.test(upper)) return true;
  }

  // ✅ Has product code + name pattern ("1013 DIANORM-OD- 60MG")
  if (/^\d{3,6}\s+[A-Z]{3,}/i.test(upper)) return true;

  // ✅ Contains common pharma abbreviations with numbers
  if (/\d+\s*(MG|ML|MCG|GM|IU)\b/i.test(upper)) return true;

  return false;
}

/* =====================================================
   🔥 ENHANCED QUANTITY EXTRACTION - MULTI-STRATEGY
===================================================== */



/**
 * Strategy B: Extract from QUANTITY-ONLY line
 * Pattern: "120 0 81.19 9742.80"
 * First number = Quantity
 */
function extractQuantityFromQtyLine(text) {
  if (!text) return null;

  // ❌ Skip if line contains product name text (letters)
  // Allow "10'S" or "TAB" if it's minimal, but not "DIANORM-OD"
  // Heuristic: If > 3 consecutive letters, skip (unless it's just one word like "TAB"?)
  // Better: If it contains long words.
  if (/[A-Z]{4,}/i.test(text)) return null; 

  const tokens = text.trim().split(/\s+/);

  // Find decimal amount position
  const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));

  if (amountIdx === -1) return null;

  // Quantity is the LAST integer before amount
  for (let i = amountIdx - 1; i >= 0; i--) {
    const token = tokens[i];

    if (!/^\d+$/.test(token)) continue;

    const val = Number(token);

    // 🔥 FIXED: Only block SAP codes if they're at the START (position 0)
    // This allows actual quantities like 3600 to be extracted
    if (i === 0 && val >= 1000 && val <= 9999) {
      console.log(`  [QTY_LINE BLOCKED] Leading SAP code: ${val}`);
      continue;
    }
    
    // Guardrails: Allow quantities up to 99999
    if (val >= 1 && val <= 99999) {
      debug(`  [QTY_COL] Found qty: ${val}`);
      return val;
    }
  }

  return null;
}


/**
 * Strategy C: Original extraction (fallback)
 */
function extractQuantityOriginal(text) {
  if (!text) return null;

  const upper = text.toUpperCase();

  // Explicit QTY label
  const qtyPrefixMatch = upper.match(/\b(?:QTY|QUANTITY|ORD\s*QTY)[:\s]+(\d+)/i);
  if (qtyPrefixMatch) {
    const qty = Number(qtyPrefixMatch[1]);
    if (qty >= MIN_QTY && qty <= MAX_QTY) return qty;
  }

  // Smart integer detection
  let cleaned = text
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\d{3,}\.\d+/g, " ")  // Only remove large decimals like 123.45, not 2.5
    .replace(/\+\s*\d*\s*(FREE|F)\s*$/i, '');
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(/\s+/);

  const candidates = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1] || "";
    const next = tokens[i + 1] || "";
    
    if (!/^\d+$/.test(token)) continue;
    
    const val = Number(token);

    //  CRITICAL: BLOCK SAP CODES (1000-9999) in fallback too
    if (val >= 1000 && val <= 9999) {
      console.log(`  [FALLBACK BLOCKED] SAP code: ${val}`);
      continue;
    }
    
    if (/^(MG|ML|MCG|GM|G|IU|KG)$/i.test(next)) continue;
    if (isPackToken(token)) continue;
    if (isPackToken(token + next)) continue;
    if (/^['\`]S$/i.test(next)) continue;
    if (i === 0 && val < 10) continue;
    if (val > 10000) continue;
    if (val < MIN_QTY) continue;
    
    // 🔥 NEW: Block numbers that look like Amounts/Prices
    // 1. If it's the last token and > 100, it's likely an amount
    if (i === tokens.length - 1 && val > 100) continue;
    
    // 2. If next token looks like "00" or just decimals (rare in simple lines but possible)
    if (next === "00" || next === "0") continue;

    if (i <= 2 && /^[A-Z]+$/i.test(prev)) {
      if ([500, 250, 1000, 125, 650, 300, 30].includes(val)) continue;
    }
    
    candidates.push({ value: val, pos: i, score: i > 2 ? 2 : 1 });
  }

  if (candidates.length === 0) return null;
  
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.pos - a.pos;
  });
  
  return candidates[0].value;
}

// 🔥 RAW ROW LOOKAHEAD (SRI SABARI FIX)
function extractQuantityFromAdjacentRows(productLine, rawRows) {
  if (!rawRows || rawRows.length === 0) return null;
  
  // Find index of this product line in rawRows
  // Since mergedLines might differ slightly, use fuzzy check
  const cleanLine = productLine.replace(/[\s\t]+/g, '').toUpperCase();
  
  let bestIdx = -1;
  let maxScore = 0;

  // Search window: Scan whole rawRows? Efficient enough for small PDFs
  for (let i = 0; i < rawRows.length; i++) {
    const rawClean = rawRows[i].replace(/[\s\t]+/g, '').toUpperCase();
    if (rawClean.includes(cleanLine) || cleanLine.includes(rawClean)) {
       // Check overlap
       if (rawClean.length > 5 && cleanLine.length > 5) {
           bestIdx = i;
           break; // Assume first match is correct (sequential processing assumed)
       }
    }
  }

  if (bestIdx === -1) return null;

  // Check next 3 rows
  for (let offset = 1; offset <= 3; offset++) {
    const checkIdx = bestIdx + offset;
    if (checkIdx >= rawRows.length) break;

    const rowText = rawRows[checkIdx].trim();
    if (!rowText) continue;

    // Strict requirements for standalone qty row:
    // 1. Must contain a valid number
    // 2. Must NOT contain letters (except maybe 'X' for pack or 'NOS') or be very short
    
    // 🔥 Support 100+20 pattern (bonus qty)
    const additionMatch = rowText.match(/^(\d+)\+(\d+)$/);
    if (additionMatch) {
        const sum = Number(additionMatch[1]) + Number(additionMatch[2]);
        if (sum >= 1 && sum < MAX_QTY) return sum;
    }

    const isNumberOnly = /^\d+$/.test(rowText);
    const isNumberWithDecimals = /^\d+(\.\d+)?$/.test(rowText); // e.g. "30" or "30.00"
    
    if (isNumberWithDecimals) {
        const val = Number(rowText);
        // Valid qty range (avoid picking up prices like 2314.20)
        // Prices are usually formatted with .00, but logic:
        // Pack: 1X10
        // Price: 2314.20
        // Qty: 30
        
        // Filter out typical prices? 
        // Heuristic: If it has 2 decimal places, it MIGHT be a price.
        // But 30.00 is qty?
        // Let's rely on range. Prices > 1000 usually.
        // SAP codes (1000-9999) blocked.
        // So valid range: 1-999 OR 10000+ (for huge orders?)
        // Wait, 2314.20 is a price. '30' is qty.
        // 2314.20 matches `isNumberWithDecimals`.
        // val = 2314.2
        // BLOCK: 1000 <= 2314 <= 9999. BLOCKED.
        
        if (val >= 1 && val < 999999) {
             // Block SAP Range/Likely Prices
             if (val >= 1000 && val <= 9999) continue;
             
             return Math.floor(val); 
        }
    }
  }
  
  return null;
}
/**
 * Strategy A: Extract quantity from FULL merged product line
 * Example: "1 1013 DIANORM-OD- 60MG TAB1X102314.2030"
 * The quantity is typically the LARGEST integer before the decimal amount
 * CRITICAL: Must block product codes (3-6 digits) and serial numbers (1-2 digits at start)
 */
function extractQuantityFromMergedLine(text) {
  // 🔥 FINAL FIX: Split pack patterns globally FIRST
  let cleaned = text;
  
  // Step 1: Split pack patterns ANYWHERE in text (not just after form words)
  // This handles: 1X102314 -> 1X10 2314
  cleaned = cleaned.replace(/(\d{1,2}X\d{1,2})([\d\.]+)/gi, '$1 $2');
  
  // Step 2: Split form words from any numbers
  // TAB2314 -> TAB 2314, TAB1X10 -> TAB 1X10
  cleaned = cleaned.replace(/([A-Z]{2,})(\d)/g, '$1 $2');
  
  // Step 3: Split pack sizes (15'S, etc.)
  cleaned = cleaned.replace(/([A-Z]{2,})(\d+['`"]?S)/gi, '$1 $2');
  
  // Step 4: Split decimals with extra digits
  // 2314.2030 -> 2314.20 30
  cleaned = cleaned.replace(/(\d{3,}\.\d{2})(\d+)/g, '$1 $2');
  
  const tokens = cleaned.trim().split(/\s+/);

  // Find decimal amount (price) - our anchor point
  const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));
  
  if (amountIdx === -1) {
    console.log(`  [MERGED_QTY] No decimal amount found`);
    return null;
  }

  // Search backwards from amount to find quantity
  
  // 🔥 PRIORITY CHECK: Scan existing tokens for strict Qty-Code-Product pattern
  // This takes precedence over proximity to amount (fixes "21 S1 SITAPRIDE 50" -> picking 21, not 50)
  for (let i = 0; i < amountIdx; i++) {
     const t = tokens[i];
     const next = tokens[i+1];
     if (/^\d+$/.test(t) && Number(t) < 99999) {
         // Check for Code pattern (S1, P1, D4) immediately following
         if (next && /^[A-Z][0-9]$|^[A-Z][A-Z]?[0-9]$/i.test(next)) {
             console.log(`  [MERGED_QTY] PRIORITY: Found ${t} followed by code ${next}`);
             return Number(t);
         }
     }
  }

  for (let i = amountIdx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!/^\d+$/.test(t)) continue;

    const val = Number(t);
    const prev = tokens[i - 1] || "";
    const next = tokens[i + 1] || "";

    // 🚫 BLOCK pack patterns (10'S, 1X10, etc.)
    if (isPackToken(t + next)) continue;
    if (/^['`"]S$/i.test(next)) continue;
    if (/X$/i.test(prev)) continue;

    // 🚫 BLOCK strength patterns (500MG, 20ML, etc.)
    if (/^(MG|ML|MCG|GM|G|IU|KG|TAB|CAP|TABS|CAPS|INJ|SYP)$/i.test(next)) continue;
    
    // 🔥 FIXED: Only block SAP codes at position 0, not everywhere
    if (i === 0 && val >= 1000 && val <= 9999) {
      console.log(`  [BLOCKED] Leading SAP code: ${val}`);
      continue;
    }
    
    // ❌ BLOCK serial numbers at start
    if (i === 0 && val < 100) {
      console.log(`  [BLOCKED] Serial number: ${val}`);
      continue;
    }
    
    // (Qty-Code check removed - handled by PRIORITY CHECK above)

    // 🔥 NEW: Skip single-digit serial numbers in early positions  
    if (i <= 5 && val < 10) {
      console.log(`  [BLOCKED] Single-digit serial: ${val} at position ${i}`);
      continue;
    }

    // 🚫 BLOCK likely product codes (followed by long text)
    // e.g. "402 MICRODOX" -> 402 is code
    if (next && /[A-Z\-]{4,}/i.test(next)) {
       console.log(`  [BLOCKED] Code followed by text: ${val} -> ${next}`);
       continue;
    }

    // 🔥 NEW: Block common strength numbers if they appear to be strength
    // (e.g. DOLO 650 500.00 -> 650 is strength, 500 is amount)
    // If val is a common strength and preceded by letters, skip it
    // 🔥 UPDATED: Added 25, 50, 75, 80, 100, 150, 200, 400
    if ([500, 650, 250, 1000, 125, 300, 30, 40, 20, 10, 5, 25, 50, 60, 75, 80, 100, 150, 200, 400].includes(val)) {
        // Strict check: Preceded by product name part?
        // DOLO 650 -> '650' preceded by 'DOLO' (letters)
        if (prev && /^[A-Z\-]+$/i.test(prev)) {
             console.log(`  [BLOCKED] Likely strength: ${val} (preceded by ${prev})`);
             continue;
        }
    }

    // ✅ Valid quantity: 1-99999 (increased range)
    // Return FIRST valid quantity found (closest to amount)
    if (val >= 1 && val <= 99999) {
      console.log(`  [MERGED_QTY] Found ${val} at position ${i}`);
      return val;
    }
  }
  
  // 🔥 FIX: If backward scan failed, scan FORWARD from amount
  // (e.g. "Amount 250.70 Qty 10")
  console.log(`  [MERGED_QTY] Backward scan failed, trying forward...`);
  for (let i = amountIdx + 1; i < tokens.length; i++) {
     const t = tokens[i];
     if (!/^\d+$/.test(t)) continue;
     const val = Number(t);
     
     // Basic validity
     if (val >= 1 && val <= 99999) {
         console.log(`  [MERGED_QTY] Found ${val} (FORWARD) at position ${i}`);
         return val;
     }
  }
  
  return null;
}



/**
 * MASTER QUANTITY EXTRACTION
 * Tries multiple strategies in order
 */
export function extractQuantity(text = "") {
  if (!text) return null;

  const clean = text.toUpperCase();
  
  console.log(`🔍 [QTY] Extracting from: "${text.substring(0, 80)}..."`);

  // 1️⃣ Explicit labels
  const labeled = clean.match(/\b(QTY|QUANTITY|NOS|PCS|BOX)\s*[:\-]?\s*(\d{1,6})\b/);
  if (labeled) {
    console.log(`  ✅ [QTY] Strategy 1 (Labeled): ${labeled[2]}`);
    return Number(labeled[2]);
  }

  // 2️⃣ 🔥 MERGED LINE (MOST IMPORTANT FOR PDFs)
  const mergedQty = extractQuantityFromMergedLine(clean);
  if (mergedQty) {
    console.log(`  ✅ [QTY] Strategy 2 (Merged): ${mergedQty}`);
    return mergedQty;
  }

  // 3️⃣ Qty-only line
  const qtyLineQty = extractQuantityFromQtyLine(clean);
  if (qtyLineQty) {
    console.log(`  ✅ [QTY] Strategy 3 (Qty Line): ${qtyLineQty}`);
    return qtyLineQty;
  }

  // 3.5️⃣ 🔥 TEXT FILE PATTERN (Micro Labs)
  // Pattern: "15's *30 600" or "* 30 600"
  // The asterix is key. It denotes box count, followed by Total Qty.
  // Supports optional +FREE suffix (e.g. "+10FREE" or "+FREE")
  const textPattern = clean.match(/[\*xX]\s*\d+\s+(\d+)(?:\s*\+\s*\d*\s*(?:FREE|F|BONUS|SCHEME))?\s*$/i);
  if (textPattern) {
      const val = Number(textPattern[1]);
      // Allow 1000-9999 (SAP codes) if matched by this strict pattern
      // Because "7000" might be a valid quantity here
      if (val >= 1 && val < 999999) {
          console.log(`  ✅ [QTY] Strategy 3.5 (Text Pattern): ${val}`);
          return val;
      }
  }

  // 4️⃣ LAST RESORT
  const fallback = extractQuantityOriginal(clean);
  if (fallback) {
    console.log(`  ✅ [QTY] Strategy 4 (Fallback): ${fallback}`);
  } else {
    console.log(`  ❌ [QTY] No quantity found`);
  }
  return fallback;
}





/* =====================================================
   PRODUCT NAME EXTRACTION
===================================================== */

export function extractProductName(text, qty) {
  let t = text;

  // 🔥 FIX 4: Normalize "naked" decimals FIRST (before anything else)
  // ".25" -> "0.25", " .5" -> " 0.5"
  t = t.replace(/(\s|^)\.(\d+)\b/g, "$10.$2");

  // 🔥 STEP 1: Split merged tokens
  t = t.replace(/([A-Z]{2,})(\d+X\d+[A-Z]?)/gi, '$1 $2');  // TAB1X10 -> TAB 1X10
  t = t.replace(/([A-Z]{2,})(\d+['`"]?S)/gi, '$1 $2');     // TAB15'S -> TAB 15'S
  t = t.replace(/([A-Z]{2,})(\d{3,})/g, '$1 $2');          // TAB2314 -> TAB 2314
  t = t.replace(/(\d+['`"]?S)(\d+X\d+)/gi, '$1 $2');      // 15'S10X15T -> 15'S 10X15T
  
  // 🔥 STEP 2: Remove leading pack info (15'S, 10X15T at start)
  t = t.replace(/^\d+['`"]?S\s+/i, "");
  t = t.replace(/^\d+X\d+[A-Z]?\s+/i, "");
  
  
  // 🔥 STEP 3: Detect reversed format (qty/price BEFORE product)
  // Pattern: "10 28 4876.76 1 110009 MECONERV 1500MG"
  // Normal: "1 110009 MECONERV 1500MG 10 28 4876.76"
  const hasEarlyPrice = /^\d+\s+\d+\s+\d+\.\d{2}/.test(t);
  
  if (hasEarlyPrice) {
    // Extract product from AFTER the price
    const priceMatch = t.match(/\d+\.\d{2}\s+(.+)/);
    if (priceMatch) {
      t = priceMatch[1]; // Everything after the price
      // Remove leading serial/code numbers
      while (/^\d+\s+/.test(t)) {
        t = t.replace(/^\d+\s+/, "");
      }
    }
  } else {
    // Normal format: Remove ALL leading numbers (serial, qty, codes)
    while (/^\d+\s+/.test(t)) {
      t = t.replace(/^\d+\s+/, "");
    }
  }

  // 🔥 STEP 4: Find form word and keep only up to it, UNLESS strength follows
  // Form words expanded: added SUS, SUSP, POWDER, SACHET, VI, VIAL, AMP
  const formMatch = t.match(/\b(TAB|TABLET|CAP|CAPSULE|INJ|INJECTION|SYP|SYRUP|DROPS|CREAM|GEL|OINT|SUS|SUSP|POWDER|SACHET|VI|VIAL|AMP)\b/i);
  
  if (formMatch) {
    const formWord = formMatch[0];
    const formIndex = formMatch.index;
    
    // Check if there is a strength immediately following the form word
    // e.g. "DOLO TAB 650 MG" -> keep "650 MG"
    const remaining = t.substring(formIndex + formWord.length);
    const strengthMatch = remaining.match(/^\s*\.?\d+(?:\.\d+)?\s*(MG|ML|GM|MCG|IU|%|G)\b/i);
    
    if (strengthMatch) {
       // Keep form word + strength
       t = t.substring(0, formIndex + formWord.length + strengthMatch[0].length);
    } else {
       // Keep everything up to and including the form word
       t = t.substring(0, formIndex + formWord.length);
    }
  } else {
    // No form word - extract from table row
    // Pattern: "NITROFIX 30SR 10,S 10 1957.50 50"
    
    // 🔥 FIX: Only remove qty if NOT reversed format
    // Reversed format: qty is BEFORE product, already removed
    // Normal format: qty is AFTER product, needs removal
    if (!hasEarlyPrice && qty) {
      // 🔥 FIX: Check for duplicate quantity numbers (Strength == Qty case)
      // e.g. "AVAS 20 ... 20" (Qty=20). First 20 is strength, second is qty.
      const qtyPattern = new RegExp(`\\b${qty}\\b`, 'g');
      const matches = t.match(qtyPattern);
      
      if (matches && matches.length > 1) {
         // Multiple occurrences: Cut from the SECOND occurrence
         let regex = new RegExp(`\\b${qty}\\b`, 'g');
         let match;
         let count = 0;
         while ((match = regex.exec(t)) !== null) {
           count++;
           if (count === 2) {
              t = t.substring(0, match.index);
              break;
           }
         }
      } else {
         // Single occurrence: Cut from the first occurrence (standard)
         t = t.replace(new RegExp(`\\b${qty}\\b.*$`), "");
      }
    }
    
    // Remove prices and large numbers
    // Remove prices (only large amounts or specific price formats like 1957.50)
    // BE CAREFUL: Don't remove small dosage decimals like 2.5 or 0.25
    t = t.replace(/\s*\d{3,}\.\d{2}.*$/," ");  // Remove clear prices (100.00+)
    
    // 🔥 FIXED: Only remove 4+ digit trailing numbers (likely pack qty or prices)
    // Preserve 3-digit numbers like 300, 500 which are common strengths
    // Pattern: "VALPRID CR 300 15" -> keep 300, would remove if we stripped 3-digit
    t = t.replace(/\s+\d{4,}\s*$/g, "");       // Remove trailing 4+ digit numbers only
    
    // Remove pack patterns
    t = t.replace(/\s+\d+X\d+[A-Z]?\s*$/gi, "");
    // 🔥 FIX 3: Remove pack patterns like "10,S" or "10'S" BEFORE splitting
    // This cleans the string so the "Smart Loop" below works on pure product+strength
    t = t.replace(/\s+\d{1,2}\s*[,`'"]\s*S\b/gi, ""); // Remove "10,S", "10'S"
    
    // 🔥 NEW: Also remove "30 10" pattern if 30 is strength and 10 is pack?
    // Hard to distinguish. Rely on loop.

    const words = t.trim().split(/\s+/);
    const productWords = [];
    let foundStrength = false;
    
    // Valid pharma strengths - same list as in cleanExtractedProductName
    const VALID_STRENGTHS = [
      0.2, 0.25, 0.3, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 
      100, 120, 150, 200, 250, 300, 325, 400, 500, 625, 650, 750, 875, 1000, 1500, 2000
    ];
    
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      
      // If it contains a slash, keep it (e.g. 50/500)
      if (w.includes('/')) {
         productWords.push(w);
         continue;
      }

      // If it's a letter-based word, always include
      if (/[A-Z]/i.test(w)) {
        productWords.push(w);
        continue;
      }
      
      // If it's a number
      if (/^\d+(\.\d+)?$/.test(w)) {
        const numVal = parseFloat(w);
        
        // If this is a valid pharma strength, keep it
        if (VALID_STRENGTHS.includes(numVal)) {
          productWords.push(w);
          foundStrength = true;
        } else if (!foundStrength) {
          // Not a valid strength but we haven't found one yet
          // Could be a non-standard strength, keep it tentatively
          productWords.push(w);
          foundStrength = true;
        } else {
          // We already have a strength, this is likely pack/qty - STOP
          break;
        }
      }
      
      if (productWords.length >= 6) break;
    }
    
    t = productWords.join(" ");
  }

  // ✅ NEW: Apply global cleaning
  // Don't strip form words (TABS etc) - let normalizeProductName handle them
  
  // 🔥 FIX 1: Repair split decimals common in PDF (e.g. "2 . 5" -> "2.5")
  t = t.replace(/(\d+)\s*\.\s*(\d+)/g, "$1.$2");
  
  // 🔥 FIX 2: Handle decimal units (e.g. "2.5 MG")
  // Previously only matched integers (\d+), leaving ".5" behind
  t = t
    // Remove ONLY generic count words, NOT dosage forms
    .replace(/\b(TABS?|TABLETS?|CAPS?|CAPSULES?|NO|NOS|PACK|KIT)\b/gi, "")

    // 🔥 FIXED: Preserve units! Do NOT strip MG/ML/etc.
    // .replace(/(\d+(?:\.\d+)?)\s*(?:MG|ML|MCG|GM|G|IU|KG)\b/gi, "$1") 
    // .replace(/\b(?:MG|ML|MCG|GM|G|IU|KG)\b/gi, "") 
    
    .replace(/\b(\d+)\s*['`"]?S\b/gi, "")
    // Fix dot packs in Text Mode (e.g. "TAB.15" -> "TAB")
    // 🔥 FIXED: Don't strip if it looks like a decimal strength (e.g. 2.5)
    // Only strip if it's .Number at the very end and NOT preceded by a digit (which would make it a decimal)
    .replace(/([^0-9])\s*\.\d+[\.\s]*$/g, "$1") 
    .replace(/\s+/g, " ")
    .trim();

  return normalizeProductName(t);
}




/* =====================================================
   🔥 ENHANCED PDF ROW MERGING - SMART 3-ROW DETECTION
===================================================== */

/**
 * Detect if a row looks like a quantity/price line
 * Pattern: "120 0 81.19 9742.80" or "2508 0 70.42 176652.36"
 */
function looksLikeQtyPriceLine(text) {
  if (!text) return false;

  const tokens = text.trim().split(/\s+/);

  // ❌ must be numeric-only
  if (tokens.some(t => /[A-Z]/i.test(t))) return false;

  const numeric = tokens.filter(t => /^\d+(\.\d+)?$/.test(t));

  // ✅ allow 2 numbers: QTY + AMOUNT
  if (numeric.length < 2) return false;

  // ✅ must contain amount
  if (!numeric.some(t => /\d+\.\d{2}$/.test(t))) return false;

  return true;
}


/**
 * Enhanced merging with 3-row pattern detection
 */
function mergePDFRows(rows) {
  const merged = [];
  const skip = new Set(); // Track rows to skip
  
  for (let i = 0; i < rows.length; i++) {
    // Skip if already merged
    if (skip.has(i)) continue;
    
    const r1 = rows[i]?.rawText?.trim();
    if (!r1) continue;
    
    // 🔥 FIX: Don't skip qty-price lines, they need to be merged with product
    const isQtyLine = looksLikeQtyPriceLine(r1);
    
    // If it's a standalone qty line without a product before it, skip it
    if (isQtyLine && merged.length === 0) {
      continue;
    }
    
    // Quick check: already complete?
    const qty1 = extractQuantity(r1);
    const isProd1 = looksLikeProduct(r1);
    
    if (isProd1 && qty1) {
      merged.push(r1);
      continue;
    }
    
    // Product without quantity - try to merge with next row(s)
    if (isProd1 && !qty1) {
      const r2 = rows[i + 1]?.rawText?.trim();
      const r3 = rows[i + 2]?.rawText?.trim();
      
      // 🔥 PATTERN A: 3-row split (Name → Pack → Qty)
      if (r2 && r3) {
        const r2FirstToken = r2.split(/\s+/)[0];
        
        // Check if r2 is pack line and r3 is qty line
        if (/^\d+['`"]?S$/i.test(r2FirstToken) && looksLikeQtyPriceLine(r3)) {
          debug(`  🔗 3-row: "${r1}" + "${r2}" + "${r3}"`);
          merged.push(`${r1} ${r2} ${r3}`);
          skip.add(i + 1);
          skip.add(i + 2);
          continue;
        }
      }
      
      // 🔥 PATTERN B: 2-row split (Product → Qty+Price)
      if (r2 && looksLikeQtyPriceLine(r2)) {
        debug(`  🔗 2-row: "${r1}" + "${r2}"`);
        merged.push(`${r1} ${r2}`);
        skip.add(i + 1);
        continue;
      }
    }
    
    // Default: keep row as-is (unless it's a standalone qty line)
    if (!isQtyLine) {
      merged.push(r1);
    }
  }
  
  return merged;
}

/* =====================================================
   PDF PARSING - WITH ENHANCED EXTRACTION
===================================================== */

async function parsePDF(file) {
  const { rows } = await extractTextFromPDFAdvanced(file.buffer);

  // Store raw rows for adjacent row quantity detection
  const rawRows = rows.map(r => r.rawText);

  debug(`\n📄 PDF: ${rows.length} raw rows`);
  
  // 🔥 DEBUG: Show raw rows where products should be
  // console.log(`\n🔍 DEBUG: Raw rows 1-50:`);
  // rows.slice(0, 50).forEach((r, i) => {
  //   console.log(`  ${i + 1}. "${r.rawText}"`);
  // });

  const mergedLines = mergePDFRowsTableAware(rows);
  debug(`📄 PDF: Merged into ${mergedLines.length} processing lines`);
  
  // 🔥 DEBUG: Show merged lines where products should be
  // console.log(`\n🔍 DEBUG: Merged lines (ALL):`);
  /*
  mergedLines.forEach((line, i) => {
    const hasForm = /\b(TAB|CAP|INJ|SYP|CAPS|TABLETS)\b/i.test(line);
    const hasMG = /\d+\s*(MG|ML|MCG)/i.test(line);
    const hasCode = /^\d{3,6}\s+[A-Z]/.test(line);
    const hasQty = /\b\d{1,4}\b/.test(line);
    
    let marker = '';
    if (hasForm || hasMG) marker = ' ⭐ HAS FORM/MG';
    else if (hasCode) marker = ' 🔢 HAS CODE';
    
    console.log(`  ${i + 1}. "${line}"${marker}`);
  });
  */

  const textLines = rows.map(r => r.rawText || "");
  const customerName = detectCustomerFromInvoice(textLines, file.originalname);

  const dataRows = [];
  const failed = [];
  let useRelaxedDetection = false;

  // 🔥 FIRST PASS: Strict detection
  for (let i = 0; i < mergedLines.length; i++) {
    let text = mergedLines[i]?.trim();
    if (!text) continue;

    if (isHardJunk(text)) {
      debug(`⛔ Row ${i + 1}: Junk "${text}"`);
      continue;
    }

    // 🔥 FIX: Strip common PDF prefixes that interfere with extraction
    // e.g. "MICR 30 P1..." -> "30 P1..."
    text = text.replace(/^MICR\s+/i, "");

    if (!looksLikeProduct(text, true)) {
      console.log(`  ❌ Row ${i + 1}: Skipped (No form/keyword) "${text.substring(0, 30)}..."`);
      failed.push({ row: i + 1, text, reason: "No product form keyword" });
      continue;
    }

    // 🔥 KEY FIX: Detect context and extract quantity
    let qty = extractQuantity(text);

    // 🔥 If qty missing, check NEXT line (qty-only)
    if (!qty && looksLikeProduct(text, true)) {
      const next = mergedLines[i + 1];
      if (looksLikeQtyPriceLine(next)) {
        qty = extractQuantity(next);
      }
    }

    // 🔥 STRATEGY 3: Adjacent Row Lookahead (SRI SABARI Fix)
    if (!qty && extractQuantityFromAdjacentRows) {
      qty = extractQuantityFromAdjacentRows(text, rawRows);
      if (qty) debug(`  🎯 Strategy 3 (Adjacent): Found Qty ${qty}`);
    }

    // ✅ DO NOT DROP PRODUCT IF QTY IS MISSING
    const rawDesc = extractProductName(text, qty);
    // 🔥 CLEANING: ensure junk is removed
    const itemDesc = cleanExtractedProductName(rawDesc);

    if (!itemDesc || itemDesc.length < 3) {
      console.log(`  ❌ Row ${i + 1} FAILED: Name too short/empty: "${itemDesc}"`);
      failed.push({ row: i + 1, text, reason: "Invalid product name" });
      continue;
    }

    // 🔥 FIXED: Use RELAXED validation for extracted names
    // "NITROFIX 30SR" might not have TAB/MG but is a valid product
    if (!looksLikeProduct(itemDesc, false)) {
      console.log(`  ❌ Row ${i + 1} FAILED: Validation failed for "${itemDesc}"`);
      failed.push({ row: i + 1, text, reason: "Not product-like" });
      continue;
    }

    debug(`✅ Row ${i + 1}: "${itemDesc}" | Qty: ${qty ?? "MISSING"}`);

    dataRows.push({
      ITEMDESC: itemDesc,
      ORDERQTY: qty ?? null,
      _rawText: text,
      _sourceRow: i + 1
    });
  }

  // 🔥 FALLBACK: If no products found, try relaxed detection
  if (dataRows.length === 0 && failed.length > 0) {
    console.log(`\n⚠️ No products with strict detection. Trying RELAXED mode...`);
    useRelaxedDetection = true;
    failed.length = 0;

    for (let i = 0; i < mergedLines.length; i++) {
      let text = mergedLines[i]?.trim();
      if (!text) continue;

      if (isHardJunk(text)) continue;

      if (!looksLikeProduct(text, false)) {
        failed.push({ row: i + 1, text, reason: "Not product-like (relaxed)" });
        continue;
      }

      let qty = extractQuantity(text);

      if (!qty && looksLikeProduct(text, false)) {
        const next = mergedLines[i + 1];
        if (looksLikeQtyPriceLine(next)) {
          qty = extractQuantity(next);
        }
      }

      const rawDesc = extractProductName(text, qty);
      // 🔥 APPLY CLEANING LOGIC (Fixing A4, 30049079 retention)
      const itemDesc = cleanExtractedProductName(rawDesc);

      if (!itemDesc || itemDesc.length < 5) {
        failed.push({ row: i + 1, text, reason: "Invalid product name" });
        continue;
      }

      const hasProductSignal = 
        /\b(TAB|CAP|INJ|SYP|DROPS|CREAM|GEL)\b/i.test(itemDesc) ||
        /\d+\s*(MG|ML|MCG|GM)\b/i.test(itemDesc) ||
        /\d+['"`]S\b/i.test(itemDesc) ||
        /^\d{3,6}\s+[A-Z]{3,}/i.test(itemDesc);

      if (!hasProductSignal) {
        failed.push({ row: i + 1, text, reason: "No product signal after cleaning" });
        continue;
      }

      debug(`✅ Row ${i + 1} [RELAXED]: "${itemDesc}" | Qty: ${qty ?? "MISSING"}`);

      dataRows.push({
        ITEMDESC: itemDesc,
        ORDERQTY: qty ?? null,
        _rawText: text,
        _sourceRow: i + 1
      });
    }
  }
  
  // 🔥 TIER-BASED FALLBACK: DISABLED (too many false positives)
  // TODO: Re-enable with better filtering after strict/relaxed detection is perfected
  /*
  if (dataRows.length > 0 && dataRows.length < 4) {
    console.log(`\n🔍 TIER-BASED FALLBACK: Checking for missed products...`);
    // ... tier fallback code ...
  }
  */

  console.log(`\n📄 PDF SUMMARY:`);
  console.log(`   Detection mode: ${useRelaxedDetection ? "RELAXED" : "STRICT"}`);
  console.log(`   Total rows: ${rows.length}`);
  console.log(`   ✅ Extracted: ${dataRows.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);

  if (dataRows.length === 0 && failed.length > 0) {
    console.log(`\n⚠️ All rows failed. Showing detailed analysis:`);
    
    // Group failures by reason
    const byReason = {};
    failed.forEach(f => {
      if (!byReason[f.reason]) byReason[f.reason] = [];
      byReason[f.reason].push(f);
    });

    Object.entries(byReason).forEach(([reason, items]) => {
      console.log(`\n   ${reason}: ${items.length} rows`);
      items.slice(0, 3).forEach(f => {
        console.log(`     Row ${f.row}: "${f.text.substring(0, 60)}..."`);
      });
    });
  }

  return {
    dataRows,
    meta: {
      customerName: customerName || "UNKNOWN",
      totalRows: rows.length,
      extracted: dataRows.length,
      failed: failed.length,
      detectionMode: useRelaxedDetection ? "RELAXED" : "STRICT"
    }
  };
}


/* =====================================================
   EXCEL COLUMN DETECTION
===================================================== */

function detectExcelColumns(rows) {
  console.log("🔍 Detecting Excel column structure...");
  
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    
    // Support both array rows and object rows
    let headers = [];
    
    if (Array.isArray(row)) {
      headers = row.map((cell, idx) => ({
        index: idx,
        name: normalizeColumnName(cell),
        original: String(cell || "").trim()
      }));
    } else if (typeof row === 'object') {
      headers = Object.keys(row).map((key, idx) => ({
        index: idx,
        name: normalizeColumnName(key),
        original: key
      }));
    }
    
    let itemNameCol = null;
    let qtyCol = null;
    let itemCodeCol = null;
    
    // Find columns with flexible matching
    for (const header of headers) {
      const norm = header.name;
      
      // Item Name / Product Name / Description
      if (!itemNameCol && (
        norm.includes("itemname") ||
        norm.includes("productname") ||
        norm.includes("itemdesc") ||
        norm.includes("description") ||
        norm === "product" ||  // 🔥 FIX: Match exact "product"
        norm === "item" ||     // 🔥 FIX: Match exact "item"
        norm === "particulars" || // 🔥 FIX: Match "particulars"
        norm === "name"
      )) {
        itemNameCol = header;
      }
      
      // Quantity (handles "Qty", "Qty.", "Quantity", "Order Qty")
      if (!qtyCol && (
        norm === "qty" ||
        norm === "quantity" ||
        norm.includes("orderqty") ||
        norm.includes("ordqty")
      )) {
        qtyCol = header;
      }
      
      // Item Code / SAP Code (optional but useful)
      if (!itemCodeCol && (
        norm.includes("itemcode") ||
        norm.includes("sapcode") ||
        norm.includes("productcode") ||
        norm === "code"
      )) {
        itemCodeCol = header;
      }
    }
    
    // If we found the required columns, return them
    if (itemNameCol && qtyCol) {
      console.log(`✅ Found columns at row ${i}:`);
      console.log(`   - Item Name: "${itemNameCol.original}" (col ${itemNameCol.index})`);
      console.log(`   - Qty: "${qtyCol.original}" (col ${qtyCol.index})`);
      if (itemCodeCol) {
        console.log(`   - Item Code: "${itemCodeCol.original}" (col ${itemCodeCol.index})`);
      }
      
      return {
        headerRow: i,
        itemNameCol: itemNameCol.index,
        itemNameKey: itemNameCol.original,
        qtyCol: qtyCol.index,
        qtyKey: qtyCol.original,
        itemCodeCol: itemCodeCol?.index,
        itemCodeKey: itemCodeCol?.original,
        dataStartRow: i + 1
      };
    }
  }
  
  console.log("⚠️ Could not detect columns");
  return null;
}

/**
 * CRITICAL FIXES FOR 90%+ MATCH RATE
 * These functions replace/enhance existing ones in unifiedParser.js
 * NO function signature changes - drop-in replacement
 */

/* =====================================================
   FIX 1: IMPROVED PRODUCT NAME CLEANING
   Problem: Removing too much (TAB, TABS, form words)
   Solution: Keep form words, they're part of product identity
===================================================== */

/**
 * Clean product name extracted from Excel
 * PRESERVES: Strength, form words, variants
 * REMOVES: Company codes, division names, product codes
 */
// 🔥 EXPORTED FOR TESTING (via bottom export list)
function cleanExtractedProductName(raw = "") {
  if (!raw) return "";
  
  // 🔥 FIX 4: Normalize "naked" decimals FIRST (before anything else)
  // ".25" -> "0.25", " .5" -> " 0.5"
  let cleaned = raw.trim().toUpperCase();
  cleaned = cleaned.replace(/(\s|^)\.(\d+)\b/g, "$10.$2");
  
  // Step 1: Remove company prefix (MICRO1, MICRO2, etc.)
  cleaned = cleaned.replace(/^MICRO\d+\s+/g, "");
  
  // Step 1b: Stripping leading numbers (Qty) to ensure Code regex at start works
  // e.g. "300 D4 DIBIZIDE..." -> "D4 DIBIZIDE..."
  cleaned = cleaned.replace(/^\d+\s+/, "");

  // Step 2: Remove division names
  // Pattern: "MICRO [DIVISION] RAJ DIST/DISTRIBUT"
  cleaned = cleaned.replace(
    /^MICRO\s+[A-Z\s\-()]+?\s+\(?\s*RAJ\s+(DIST|DISTRIBUT)[A-Z\s()\.]*\)?\s*/g, 
    ""
  );
  
  // 🔥 NEW: Remove Short Alphanumeric Codes at Start (e.g. "P1 ", "D4 ", "L1 ")
  // Also covers "300 D4" if 300 wasn't stripped
  // 1. Strip leading digits again just in case (e.g. Qty leftovers)
  cleaned = cleaned.replace(/^\d+\s+/, "");
  // 2. Strip D4, P1, M3, A4 (Letter+Digit)
  cleaned = cleaned.replace(/^[A-Z]\d+\b\s*/i, ""); 
  // 3. Strip Code-like starts (Letter+Letter+Digit e.g. CC1)
  cleaned = cleaned.replace(/^[A-Z]{2}\d+\b\s*/i, "");
  // 4. Strip Digit+Letter+Digit
  cleaned = cleaned.replace(/^[A-Z]\d+[A-Z]\b\s*/i, "");

  // Step 3: Remove standalone product codes (PROD#### or ####)
  // And long numeric codes at the end (e.g. 30049079) -- MOVED TO END
  cleaned = cleaned.replace(/^(PROD)?\d{4,6,}\s+/g, "");
  // cleaned = cleaned.replace(/\s+\d{6,}$/g, ""); // Moved to end of function
  
  // Step 4: Remove RAJ/DIST/DISTRIBUT remnants
  cleaned = cleaned.replace(/\b(RAJ|DIST|DISTRIBUT|DISTRIBUTOR)\b/gi, " ");
  
  // Step 5: Remove parentheses with RAJ inside
  cleaned = cleaned.replace(/\([^)]*RAJ[^)]*\)/gi, " ");
  
  // console.log(`DEBUG STEP 5: "${cleaned}"`);
  
  // Step 6: Remove "SUSP." but keep other abbreviations
  cleaned = cleaned.replace(/\bSUSP\./gi, "SUSPENSION");

  // 🔥 NEW: Replace hyphens with spaces (Requested by user: MICRODOX-LBX -> MICRODOX LBX)
  cleaned = cleaned.replace(/-/g, " ");
  
  // 🔥 FIX: Remove "TAB S", "CAP S" explicitly to prevent "10 S" pack detection
  cleaned = cleaned.replace(/\b(TAB|CAP)\s*S\b/gi, "");
  
  cleaned = cleaned.replace(/\bSYP\./gi, "SYRUP");

  // Step 6b: Remove standard pack patterns (15S, 1X10)
  // 🔥 UPDATED: User explicitly asked to REMOVE "other values" including pack size like "10S" in DIBIZIDE M 10S
  // Previously we kept "10" thinking it might be strength, but user says "10S" is unwanted pack info.
  // We will remove it if it has 'S' suffix.
  cleaned = cleaned.replace(/\b\d+\s*['"`]?\s*S\b/gi, ""); // Remove "10S", "10 S", "10'S"
  cleaned = cleaned.replace(/\b\d+X\d+[A-Z]?\b/gi, "");

  // Step 6c: Remove units (MG, ML, etc) but keep number (Integer OR Decimal)
  // 🔥 UPDATED: User wants to SEE units. Commenting out removal.
  // cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*(?:MG|ML|MCG|GM|G|IU|KG)\b/gi, "$1");
  
  // Step 6d: Remove standalone units (e.g. "MOXILONG MG") - DISABLED
  // cleaned = cleaned.replace(/\b(?:MG|ML|MCG|GM|G|IU|KG)\b/gi, "");

  // Step 6e: Remove Form words (SELECTIVE)
  // 1. Remove TABS/CAPS (User removed these from DB)
  cleaned = cleaned.replace(/\b(TABS?|TABLETS?|CAPS?|CAPSULES?|NO|NOS|PACK|KIT)\b/gi, "");
  
  // 2. PRESERVE SPECIAL FORMS (User kept these in DB: SYP, INJ, GEL, etc.)
  // We do NOT strip: INJ, INJECTION, SYP, SYRUP, SUSP, SUSPENSION, OINTMENT, GEL, CREAM, DROPS, SOL, SOLUTION, IV, INFUSION, AMP

  // Step 7: Remove trailing pack details
  // Case A: REMOVED (Was stripping valid decimals like 2.5)
  // Case C: Remove purely integer trailing numbers > 1000 (likely price/code) or specific patterns?
  // User wants "no other values".
  // Remove 3+ digit numbers at end (likely codes like 300) IF they are not part of name?
  // Be careful: "DIBIZIDE M 300" -> 300 might be strength?
  // User complained about "30049079". This is covered by code removal above.
  

  // cleaned = cleaned.replace(/\.\s*\d+[\.\s]*$/g, "");
  
  // Case B: Dot followed by digits, NOT preceded by digit (Safe)
  // 🔥 UPDATED: Only remove if it looks like a list index (e.g. "No.1") or purely punctuation
  // Because we normalized .25 -> 0.25, this regex shouldn't trigger on 0.25 (as 0 is a digit)
  cleaned = cleaned.replace(/([^0-9])\s*\.\d+[\.\s]*$/g, "$1");
  
  // Clean trailing punctuation
  cleaned = cleaned.replace(/[\.\s]+$/, "");

  // Case D: Double number heuristic (e.g. "50 15" -> "50", "2.5 15" -> "2.5")
cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s+(\d+)$/, (match, p1, p2) => {
  const strength = parseFloat(p1);
  const trailing = parseInt(p2, 10);

  // Valid pharma strengths
  const VALID_STRENGTHS = [
    0.2, 0.25, 0.3, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 
    100, 120, 150, 200, 250, 300, 325, 400, 500, 625, 650, 750, 875, 1000, 1500, 2000
  ];

  // 🔥 ONLY remove if there are TWO numeric tokens originally
  const nums = cleaned.match(/\d+(?:\.\d+)?/g) || [];

  if (
    nums.length >= 2 &&
    VALID_STRENGTHS.includes(strength) &&
    trailing < 100
  ) {
    return p1;
  }

  return match;
});


  // Step 8: Normalize spacing
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // 🔥 MOVED HERE: Remove long numeric codes (HSN/Barcodes) - ANYWHERE in string
  // e.g. 30049079
  cleaned = cleaned.replace(/\b\d{5,}\b/g, "");

  // Final trim
  cleaned = cleaned.trim();
  
  if (raw.includes("ARBITEL")) {
     console.log(`[Cleaner DEBUG] In: "${raw}" -> Out: "${cleaned}"`);
  }
  
  return cleaned;
}

/* =====================================================
   FIX 2: ENHANCED extractFromExcelColumns
   Problem: Not cleaning product names after extraction
   Solution: Apply cleaning to all extracted names
===================================================== */

function extractFromExcelColumns(rows, columnMap) {
  const { dataStartRow, itemNameCol, qtyCol, itemCodeCol, itemNameKey, qtyKey, itemCodeKey } = columnMap;
  const products = [];
  
  console.log(`\n📊 Extracting from row ${dataStartRow} onwards...`);
  
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    
    // Support both array and object rows
    let itemName, qty, itemCode;
    
    if (Array.isArray(row)) {
      itemName = String(row[itemNameCol] || "").trim();
      qty = row[qtyCol];
      itemCode = itemCodeCol !== undefined ? String(row[itemCodeCol] || "").trim() : null;
    } else if (typeof row === 'object') {
      itemName = String(row[itemNameKey] || "").trim();
      qty = row[qtyKey];
      itemCode = itemCodeKey ? String(row[itemCodeKey] || "").trim() : null;
    } else {
      continue;
    }
    
    // Parse quantity (Support Decimals)
    // Remove everything except digits and dots
    const cleanQty = String(qty || "").replace(/[^0-9.]/g, "");
    const qtyNum = parseFloat(cleanQty);
    
    // Validate
    if (!itemName || !qtyNum || qtyNum <= 0) {
      continue;
    }
    
    // Skip header-like rows
    if (/^(item|product|name|description|qty|quantity)/i.test(itemName)) {
      continue;
    }
    
    // 🔥 ENHANCED: Skip invalid product names (order numbers, headers, etc.)
    if (isInvalidProductName(itemName)) {
      console.log(`  ⚠️  Row ${i + 1}: Invalid product name - "${itemName}"`);
      continue;
    }
    
    // Skip if too short (before cleaning)
    if (itemName.length < 3) {
      continue;
    }
    
    // 🔥 CLEAN THE PRODUCT NAME
    const cleanedName = cleanExtractedProductName(itemName);
    
    // Skip if cleaning resulted in empty/too short name
    if (!cleanedName || cleanedName.length < 3) {
      console.log(`  ⚠️  Row ${i + 1}: Cleaned to empty - "${itemName}"`);
      continue;
    }
    
    console.log(`  ✅ Row ${i + 1}: "${cleanedName}" | Qty: ${qtyNum}${itemCode ? ` | Code: ${itemCode}` : ''}`);
    
    products.push({
      ITEMDESC: cleanedName,
      ORDERQTY: qtyNum,
      SAPCODE: itemCode || "",
      _rawText: itemName,  // Keep original for debugging
      _sourceRow: i + 1
    });
  }
  
  return products;
}

/* =====================================================
   FIX 3: RELAXED STRENGTH MATCHING
   Problem: "METAPRO 50MG" doesn't match "METAPRO 50MG TAB"
   Solution: More lenient strength extraction and comparison
===================================================== */


/**






/**
 * ENHANCED: Check if strengths are compatible (more lenient)
 */
function hasCompatibleStrength(invoiceText, productName) {
  const inv = normalizeStrength(extractStrength(invoiceText));
  const prod = normalizeStrength(extractStrength(productName));

  // both missing → ok
  if (!inv && !prod) return true;

  // both present → MUST match
  if (inv && prod) return inv === prod;

  // one missing, one present → ❌ BLOCK
  return false;
}


/* =====================================================
   FIX 4: IMPROVED BASE NAME MATCHING
   Problem: Missing matches due to form word differences
   Solution: More flexible base name comparison
===================================================== */

/**
 * ENHANCED: Extract base name (remove strength, forms, variants)
 */
function extractBaseName(text = "") {
  if (!text) return "";
  
  let base = text.toUpperCase();
  
  // Remove strength patterns
  base = base.replace(/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s*(?:MG|ML|MCG)?/g, " ");
  base = base.replace(/\d+(?:\.\d+)?\s*(?:MG|ML|MCG|GM|G|IU|KG)/g, " ");
  
  // Remove form words (but keep them in original for variant detection)
  base = base.replace(/\b(TABS?|TABLETS?|CAPS?|CAPSULES?|INJ|INJECTION|SYR|SYRUP|SUSP|SUSPENSION|DROPS?)\b/gi, " ");
  
  // Remove pack info
  base = base.replace(/\d+\s*['"`]?\s*S\b/gi, " ");
  
  // Clean up
  base = base.replace(/\s+/g, " ").trim();
  
  return base;
}

/**
 * ENHANCED: Similarity with better normalization
 */
function similarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const NOISE_WORDS = new Set([
    "MICRO", "MICRO1", "RAJ", "DIST", "DISTRIBUT",
    "DISTRIBUTOR", "LIMITED", "LTD", "PROD",
    "TABLET", "TABLETS", "TAB", "TABS",
    "CAP", "CAPS", "CAPSULE", "CAPSULES"
  ]);

  const normalize = (s) => {
    return s
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  const words1 = s1
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w));

  const words2 = s2
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w));

  if (words1.length === 0 || words2.length === 0) return 0;

  const set2 = new Set(words2);
  const common = words1.filter(w => set2.has(w));

  if (common.length === 0) return 0;

  // Boost for full containment
  if (words1.every(w => set2.has(w)) || words2.every(w => words1.includes(w))) {
    return 0.95;
  }

  // Standard Jaccard similarity
  const score = (common.length * 2) / (words1.length + words2.length);
  
  return score;
}

/* =====================================================
   FIX 5: ENHANCED EXACT MATCH (More Flexible)
===================================================== */

function exactMatch(invoiceText, product) {
  if (!invoiceText || !product?.productName) return 0;

  const inv = invoiceText.toUpperCase().replace(/\s+/g, " ").trim();
  const prod = product.productName.toUpperCase().replace(/\s+/g, " ").trim();

  // Direct exact match
  if (inv === prod) return 1.0;

  // Extract base names
  const invBase = extractBaseName(inv);
  const prodBase = extractBaseName(prod);

  // Check if base names match exactly
  if (invBase && prodBase && invBase === prodBase) {
    // Verify strength compatibility
    if (hasCompatibleStrength(inv, prod)) {
      return 1.0; // Perfect match
    }
  }

  // Check if one contains the other (after normalization)
  const invNorm = inv.replace(/[^A-Z0-9]/g, "");
  const prodNorm = prod.replace(/[^A-Z0-9]/g, "");
  
  if (invNorm === prodNorm) return 1.0;
  
  if (invNorm.length > 5 && prodNorm.length > 5) {
    if (invNorm.includes(prodNorm) || prodNorm.includes(invNorm)) {
      if (hasCompatibleStrength(inv, prod)) {
        return 0.95;
      }
    }
  }

  return 0;
}

/* =====================================================
   FIX 6: ENHANCED CLEANED MATCH
===================================================== */

function cleanedMatch(invoiceText, product) {
  if (!invoiceText || !product?.productName) return 0;

  // Use similarity function with relaxed threshold
  const score = similarity(invoiceText, product.productName);
  
  if (score >= 0.85) {
    // Verify strength compatibility
    if (hasCompatibleStrength(invoiceText, product.productName)) {
      return 0.85;
    }
  }
  
  // Check base name match
  const invBase = extractBaseName(invoiceText);
  const prodBase = extractBaseName(product.productName);
  
  if (invBase && prodBase) {
    const baseScore = similarity(invBase, prodBase);
    
    if (baseScore >= 0.90) {
      if (hasCompatibleStrength(invoiceText, product.productName)) {
        return 0.85;
      }
    }
  }

  return 0;
}

/* =====================================================
   FIX 7: LOWER MINIMUM THRESHOLDS
   Problem: Good matches being rejected
   Solution: Lower confidence thresholds
===================================================== */

// Add this to matchProductSmart function (replace the threshold section):

/*
  // UPDATED CONFIDENCE THRESHOLDS (more lenient)
  if (!best) {
    console.log(`  ❌ No match found`);
    return null;
  }

  // Lowered minimum score for better recall
  const MIN_SCORE = 0.35; // Reduced from 0.40/0.45

  if (bestScore < MIN_SCORE) {
    console.log(`  ❌ Best match too low: ${best.productName} (${bestScore.toFixed(2)} < ${MIN_SCORE})`);
    return null;
  }

  console.log(`  ✅ MATCHED: ${best.productName} (${matchType}, confidence: ${bestScore.toFixed(2)})`);

  return {
    ...best,
    confidence: bestScore,
    matchType,
    boxPack: best.boxPack || best.pack || 0
  };
*/

/* =====================================================
   EXPORT ALL ENHANCED FUNCTIONS
===================================================== */

export {
  cleanExtractedProductName,
  extractFromExcelColumns,
  hasCompatibleStrength,
  extractBaseName,
  similarity,
  exactMatch,
  cleanedMatch
};


/* =====================================================
   EXCEL PARSING
===================================================== */

function parseExcel(file) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const rowsArray = XLSX.utils.sheet_to_json(ws, {
    defval: "",
    header: 1,
    raw: false
  });

  const rowsObject = XLSX.utils.sheet_to_json(ws, {
    defval: "",
    raw: false
  });

  console.log(`📊 Excel: ${rowsArray.length} raw rows`);

  /* =====================================================
     1️⃣ COLUMN-BASED EXTRACTION (PRIMARY PATH)
  ===================================================== */

  let columnMap = detectExcelColumns(rowsArray);

  if (!columnMap && rowsObject.length > 0) {
    console.log("🔄 Trying object-based column detection...");
    columnMap = detectExcelColumns(rowsObject);
  }

  if (columnMap) {
    console.log("✅ Using COLUMN-BASED extraction");

    const sourceRows =
      columnMap.headerRow < rowsArray.length ? rowsArray : rowsObject;

    const products = extractFromExcelColumns(sourceRows, columnMap);

    const customerName = detectCustomerFromInvoice(
      rowsArray
        .slice(0, 20)
        .map(r => (Array.isArray(r) ? r.join(" ") : String(r))),
      file.originalname
    );

    return {
      dataRows: products,
      meta: {
        customerName: customerName || "UNKNOWN",
        totalRows: rowsArray.length,
        extracted: products.length,
        failed: Math.max(rowsArray.length - products.length, 0),
        structure: "COLUMN_BASED"
      }
    };
  }

  /* =====================================================
     2️⃣ TEXT-BASED FALLBACK (GUARANTEED RETURN)
  ===================================================== */

  console.log("⚠️ Using TEXT-BASED extraction (FALLBACK)");

  const textLines = rowsArray
    .map(r => (Array.isArray(r) ? r.join(" ") : String(r)))
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const customerName = detectCustomerFromInvoice(textLines, file.originalname);

  const dataRows = [];
  const failed = [];

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];

    if (!line || line.length < MIN_PRODUCT_LENGTH) continue;
    if (isHardJunk(line)) continue;
    if (/^(TOTAL|GRAND TOTAL|SUB TOTAL|NET AMOUNT)/i.test(line)) continue;

    const qty = extractQuantity(line);
    if (!qty) {
      failed.push({ row: i + 1, text: line, reason: "No qty" });
      continue;
    }

    const itemDesc = extractProductName(line, qty);
    if (!itemDesc || !looksLikeProduct(itemDesc)) {
      failed.push({ row: i + 1, text: line, reason: "Invalid product" });
      continue;
    }

    dataRows.push({
      ITEMDESC: itemDesc,
      ORDERQTY: qty,
      _rawText: line,
      _sourceRow: i + 1
    });
  }
  
  // 🔥 TIER-BASED FALLBACK for Excel
  console.log(`\n🔍 Excel Tier Fallback: Checking ${failed.length} failed rows...`);
  
  for (const failedRow of failed) {
    const text = failedRow.text;
    const qty = extractQuantity(text);
    
    // 🔥 CRITICAL: Skip invalid product names (headers, footers, order numbers)
    if (isInvalidProductName(text)) {
      continue;
    }
    
    // 🔥 CRITICAL: Skip division headers
    if (/MICRO[-\s].*?[-\s]DIV/i.test(text)) {
      continue;
    }
    
    // 🔥 CRITICAL: Skip total/summary lines
    if (/\b(TOTAL|VAL\.|DIVISION|SUMMARY|SUBTOTAL)\b/i.test(text)) {
      continue;
    }
    
    // 🔥 CRITICAL: Skip terms and conditions
    if (/\b(TERMS|CONDITIONS|ENCLOSED|CHEQUE)\b/i.test(text)) {
      continue;
    }
    
    // TIER 2: Structural patterns
    const hasBrandNumber = /\b[A-Z]{3,}\s+\d{1,4}\b/i.test(text);
    const words = text.toUpperCase().split(/\s+/).filter(w => w.length > 1);
    const capWords = words.filter(w => /^[A-Z]{2,}$/.test(w));
    const hasMultipleCaps = capWords.length >= 2;
    
    if (hasBrandNumber || hasMultipleCaps || qty) {
      const itemDesc = extractProductName(text, qty);
      
      // 🔥 FINAL VALIDATION: Check extracted name
      if (!itemDesc || itemDesc.length < 3) {
        continue;
      }
      
      // 🔥 FINAL VALIDATION: Check if extracted name is invalid
      if (isInvalidProductName(itemDesc)) {
        continue;
      }
      
      // 🔥 FINAL VALIDATION: Must look like a product
      if (!isHardJunk(itemDesc)) {
        console.log(`  ✅ [TIER FALLBACK] Row ${failedRow.row}: "${itemDesc}" | Qty: ${qty ?? "MISSING"}`);
        dataRows.push({
          ITEMDESC: itemDesc,
          ORDERQTY: qty ?? null,
          _rawText: text,
          _sourceRow: failedRow.row,
          _tier: qty ? 3 : 2
        });
      }
    }
  }

  console.log(`\n📊 EXCEL TEXT-BASED SUMMARY:`);
  console.log(`   Total rows: ${textLines.length}`);
  console.log(`   ✅ Extracted: ${dataRows.length}`);
  console.log(`   ❌ Still failed: ${failed.length - dataRows.filter(r => r._tier).length}`);

  return {
    dataRows,
    meta: {
      customerName: customerName || "UNKNOWN",
      totalRows: rowsArray.length,
      extracted: dataRows.length,
      failed: failed.length - dataRows.filter(r => r._tier).length,
      structure: "TEXT_FALLBACK"
    }
  };
}

/* =====================================================
   TEXT PARSING
===================================================== */

function parseText(file) {
  let text = file.buffer.toString("utf8");
  // 🔥 Strip BOM (Byte Order Mark) if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  
  const lines = text.split(/\r?\n/);
  
  debug(`\n📝 Text: ${lines.length} lines`);
  
  const customerName = detectCustomerFromInvoice(lines, file.originalname || "text.txt");
  const dataRows = [];
  const failed = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ").trim();
    
    if (!line || line.length < MIN_PRODUCT_LENGTH) continue;
    if (isHardJunk(line)) continue;
    if (/^(TOTAL|APPROXIMATE\s*VALUE)[\s:]/i.test(line)) continue;
    
    const qty = extractQuantity(line);
    if (!qty) {
      // Only check if looks like product after we have the description
      const tempDesc = extractProductName(line);
      if (tempDesc && looksLikeProduct(tempDesc)) {
        failed.push({ row: i + 1, text: line, reason: 'No qty' });
      }
      continue;
    }
    
    const itemDesc = extractProductName(line, qty);
    if (!itemDesc || itemDesc.length < MIN_PRODUCT_LENGTH) {
      console.log(`  ❌ Row ${i + 1}: Failed extraction (No name) from "${line}"`);
      failed.push({ row: i + 1, text: line, qty, reason: 'No name' });
      continue;
    }
    
    // 🔥 FIX: If extracted name looks weak (e.g. "DOLO 1000" has no unit/form), 
    // check the original line for context clues (like "10's")
    if (!looksLikeProduct(itemDesc) && !looksLikeProduct(line)) {
      console.log(`  ❌ Row ${i + 1}: Failed extraction (Not product-like) "${itemDesc}"`);
      failed.push({ row: i + 1, text: line, qty, reason: 'Not product-like' });
      continue;
    }
    
    debug(`  ✅ Row ${i + 1}: "${itemDesc}" | Qty: ${qty}`);
    
    dataRows.push({
      ITEMDESC: itemDesc,
      ORDERQTY: qty,
      _rawText: line,
      _sourceRow: i + 1
    });
  }
  
  console.log(`\n📝 TEXT SUMMARY: ${dataRows.length} extracted, ${failed.length} failed`);
  
  return {
    dataRows,
    meta: { 
      customerName: customerName || "UNKNOWN",
      totalRows: lines.length,
      extracted: dataRows.length,
      failed: failed.length
    }
  };
}

/* =====================================================
   MAIN EXPORT
===================================================== */

export async function unifiedExtract(file) {
  const name = file.originalname.toLowerCase();
  
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🚀 EXTRACTION: ${file.originalname}`);
  console.log(`${"=".repeat(70)}`);
  
  try {
    let result;
    
    if (name.endsWith(".pdf")) {
      result = await parsePDF(file);
    } else if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
      result = parseExcel(file);
    } else if (name.endsWith(".txt")) {
      result = parseText(file);
    } else {
      throw new Error(`Unsupported file format: ${name}`);
    }
    
    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ EXTRACTION COMPLETE`);
    console.log(`   Extracted: ${result.dataRows.length} products`);
    console.log(`   Customer: ${result.meta.customerName}`);
    console.log(`${"=".repeat(70)}\n`);
    
    return result;
    
  } catch (error) {
    console.error("❌ Extraction error:", error);
    throw error;
  }
}

export default { unifiedExtract };


