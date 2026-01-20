
// Mock strict config from unifiedParser.js
const MIN_QTY = 1;
const MAX_QTY = 9999;

function isPackToken(token = "") {
  return /^\d+['`"]?S$/i.test(token);
}

function extractQuantity(text) {
  if (!text) return null;

  const upper = text.toUpperCase();

  // Strategy 1: Explicit QTY label
  const qtyPrefixMatch = upper.match(/\b(?:QTY|QUANTITY|ORD\s*QTY)[:\s]+(\d+)/i);
  if (qtyPrefixMatch) {
    const qty = Number(qtyPrefixMatch[1]);
    if (qty >= MIN_QTY && qty <= MAX_QTY) return qty;
  }

  // Strategy 2: Smart integer detection
  let cleaned = text
    .replace(/\b\d{6,}\b/g, " ")  // Remove 6+ digit codes
    .replace(/\d+\.\d+/g, " ")     // Remove decimal numbers
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
    
    if (/^(MG|ML|MCG|GM|G|IU|KG)$/i.test(next)) continue;
    
    if (isPackToken(token)) continue;
    if (isPackToken(token + next)) continue;
    if (/^['\`]S$/i.test(next)) continue;
    
    if (i === 0 && val < 10) continue; // Serial number check
    if (val > 10000) continue;
    if (val < MIN_QTY) continue; // ✅ Enforce MIN_QTY
    
    // FILTER 5 check
    if (i <= 2 && /^[A-Z]+$/i.test(prev)) {
        if ([500, 250, 1000, 125].includes(val)) continue;
    }
    
    candidates.push({ value: val, pos: i, score: i > 2 ? 2 : 1 });
  }

  if (candidates.length === 0) return null;
  
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer "right-most" candidate for quantity usually? 
    // Actually the logic provided was b.pos - a.pos (right-most).
    return b.pos - a.pos;
  });
  
  return candidates[0].value;
}


function extractProductName(text) {
  if (!text) return "";

  let cleaned = text.toUpperCase();

  // ✅ 1. Remove Price (Strictly 2 decimal places to avoid removing "2.5 MG")
  cleaned = cleaned.replace(/\b\d+\.\d{2}\b/g, " ");

  // ✅ 2. Remove Serial and SAP
  cleaned = cleaned.replace(/^\s*\d{1,3}\s+/, ""); // Serial
  cleaned = cleaned.replace(/^\s*\d{5,8}\s+/, ""); // SAP

  // Preserve symbols
  cleaned = cleaned.replace(/\//g, "§SLASH§"); 
  cleaned = cleaned.replace(/-/g, "§DASH§");   
  cleaned = cleaned.replace(/\+/g, "§PLUS§");  

  // Remove other junk chars (keep alphanumeric and preserved symbols)
  cleaned = cleaned.replace(/[^A-Z0-9§\s\.]/g, " "); // Added dot for 2.5
  
  // Restore
  cleaned = cleaned.replace(/§SLASH§/g, "/");
  cleaned = cleaned.replace(/§DASH§/g, "-");
  cleaned = cleaned.replace(/§PLUS§/g, "+");
  
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const tokens = cleaned.split(" ");
  const result = [];
  
  // Track if we seem to have passed the main name part
  let sawPack = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1] || "";
    const next = tokens[i + 1] || "";

    // Skip empty
    if (!t) continue;

    // Stop at "0" (Price/Free/Disc usually)
    if (t === "0") break;

    // Check for PACK (10'S, 10S) or Split Pack (15 S)
    if (isPackToken(t)) {
        break; // Stop at pack
    }
    
    // Split Pack: "15" followed by "S"
    if (/^\d+$/.test(t) && /^[sS]$/i.test(next)) {
        break;
    }
    // "S" followed by previous number (should have broken above, but for safety)
    if (/^[sS]$/i.test(t) && /^\d+$/.test(prev)) {
        break;
    }

    // 2. Pure Alpha (ARBITEL) or Alpha-Dash (TOLFEN-P) or Alpha-Plus (DOLO+)
    //    Allowing numbers in middle like "M1" (DIAPRIDE) or "D3" (MICRO D3)
    if (/^[A-Z0-9\-\+\/]+$/.test(t)) {
       
       if (/^\d+$/.test(t)) {
           // Standalone number
           // If it resembles strength (common strengths 25, 40, 80, 500, 650, 1000)
           // Keep it.
           // NOTE: "15" might be strength OR pack. 
           // If next is "S", we checked above.
           // If next is "15'S" (pack), we check pack token.
           // If "15" is followed by Price? 
           // Generally assume it's part of name unless proven otherwise.
           result.push(t);
           continue;
       }
       
       // "2.5" (Decimal)
       if (/^\d+\.\d+$/.test(t)) {
           result.push(t);
           continue;
       }

       // Normal Word / Alphanumeric / Variant
       result.push(t);
       continue;
    }
    
    // 3. Dosage with units (40MG, 2.5MG, 50/500MG)
    if (/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?[A-Z]*$/.test(t)) {
         result.push(t);
         continue;
    }

    // Default stop?
    if (result.length > 0) break;
  }

  return result.join(" ").trim();
}

const samples = [
    "1 203034 ANORELIEF CREAM 30 GM 1265.80 10 0 0",
    "2 208024 MECONERV FORTE CAPS DTF 10S 2455.80 20 0 0",
    "3 203010 TOLFEN-P TAB 10'S 9874.80 120 0 0",
    "Company : 205(MICRO-CARDICARE) [Approx Value : 9174.600]",
    "1 205116 ARBITEL 40MG 15'S 15'S 742.60 10 0 0",
    "2 214154 ARBITEL CT 40 15'S 15'S 1350.00 10 0 0",
    "3 214136 ARBITEL -TRIO 50 15'S 15'S 3354.40 20 0 0",
    "4 205062 ARBITEL-MT 50 7S 989.50 10 0 0",
    "5 205114 BISOT 2.5 10'S 2738.10 30 0 0",
    "1 343030 DIAPRIDE M1 FORTE TAB 15S 15'S 1734.80 20 0 0",
    "6 208025 MECONERV PLUS 10S 2160.00 20 0 0",
    "7 214132 VILDAPRIDE M 50/500MG 15`S 15'S 4885.20 40 0 0",
    "1 207002 AMLONG 2.5MG 15'S 1965.00 100 0 0",
    "1 207062 OLMAT 20MG 15'S 15'S 1375.60 10 0 0",
    "4 214130 OLMAT AM 20 15`S 15'S 1552.50 10 0 0"
];

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const output = samples.map(s => {
    return `"${s}" \n   -> Qty: ${extractQuantity(s)} \n   -> Name: "${extractProductName(s)}"`;
}).join('\n\n');

fs.writeFileSync(path.join(__dirname, 'debug_output.txt'), output);
console.log("Written to debug_output.txt");
