/**
 * PRODUCT MATCHER - ENHANCED VERSION
 * ✅ Returns boxPack from master DB for pack calculation
 */

import { splitProduct } from "../utils/splitProducts.js";
import { cleanInvoiceDesc } from "../utils/invoiceUtils.js";
import { similarity } from "../utils/invoiceUtils.js";

function normalize(text = "") {
  return text
    .toUpperCase()
    .replace(/\+FREE/g, "")
    .replace(/['"*]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Smart product matching with confidence scoring
 * Returns matched product with boxPack from master DB
 */
export function matchProductSmart(invoiceDesc, products) {
  if (!invoiceDesc || !products?.length) return null;

  const cleanedInvoice = cleanInvoiceDesc(invoiceDesc);
  const inv = normalize(cleanedInvoice);
  const invParts = splitProduct(cleanedInvoice);



  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const master = normalize(p.productName);
    if (!master) continue;

    // ✅ STRATEGY 1: Exact match
    if (inv === master) {
      return {
        ...p,
        confidence: 1.0,
        matchType: 'EXACT'
      };
    }

    // ✅ STRATEGY 2: Cleaned name match
    if (p.cleanedProductName) {
      const cleanMaster = normalize(p.cleanedProductName);
      if (inv === cleanMaster) {
        return {
          ...p,
          confidence: 0.95,
          matchType: 'CLEANED_EXACT'
        };
      }
    }

    // ✅ STRATEGY 3: Base name + dosage match
    if (invParts.name && p.baseName) {
      const invBase = normalize(invParts.name);
      const masterBase = normalize(p.baseName);
      
      if (invBase === masterBase) {
        // Check dosage match
        const dosageMatch = invParts.strength === p.dosage;
        
        if (dosageMatch) {
          const score = 0.90;
          if (score > bestScore) {
            bestScore = score;
            best = {
              ...p,
              confidence: score,
              matchType: 'BASE_DOSAGE'
            };
          }
        }
      }
    }

    // ✅ STRATEGY 4: Contains match
    if (inv.includes(master) || master.includes(inv)) {
      const score = 0.80;
      if (score > bestScore) {
        bestScore = score;
        best = {
          ...p,
          confidence: score,
          matchType: 'CONTAINS'
        };
      }
      continue;
    }

    // ✅ STRATEGY 5: Word overlap scoring
    const invWords = inv.split(" ").filter(w => w.length > 2);
    const masterWords = master.split(" ").filter(w => w.length > 2);

    const common = invWords.filter(w => masterWords.includes(w));
    const score = common.length > 0 
      ? (common.length * 2) / (invWords.length + masterWords.length)
      : 0;

    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      best = {
        ...p,
        confidence: score,
        matchType: 'FUZZY'
      };
    }
  }

  return best;
}

/**
 * Legacy loose matcher (for backward compatibility)
 */
export function matchProductLoose(invoiceDesc, products) {
  const result = matchProductSmart(invoiceDesc, products);
  
  if (!result) return null;
  
  return {
    product: {
      ITEMDESC: result.productName,
      SAPCODE: result.productCode,
      PACK: result.pack || 0,
      "BOX PACK": result.boxPack || 0,
      DVN: result.division || ""
    },
    score: result.confidence
  };
}

export default { matchProductSmart, matchProductLoose };