import { normalizeKey } from "../utils/normalizeKey.js";

/**
 * Hybrid Auto-Mapper: Combines simple matching with enhanced fuzzy matching
 * This gives you the best of both worlds - speed and accuracy
 */

// Pharmaceutical industry column aliases
const COLUMN_ALIASES = {
  sapcode: ["sap code", "sap", "code", "product code", "item code", "sku"],
  itemdesc: [
    "item desc",
    "item description",
    "description",
    "desc",
    "product name",
    "item name",
    "product",
    "item",
    "medicine",
    "drug name",
    "medicine name",
  ],
  orderqty: [
    "order qty",
    "quantity",
    "qty",
    "order quantity",
    "ordered qty",
    "qty ordered",
    "order",
  ],
  "box pack": ["box pack", "box", "boxes", "pack size", "box size", "carton"],
  pack: ["pack", "packs", "unit pack", "inner pack", "strip"],
  "customer name": [
    "customer name",
    "customer",
    "party name",
    "party",
    "buyer",
    "bill to",
    "ship to",
    "supplier",
  ],
  dvn: ["dvn", "division", "div"],
  code: ["code", "unique code", "internal code", "ref code"],
};

/**
 * Simple matching (fast) - your original logic
 */
function simpleMatch(fieldNorm, normalizedTemplate) {
  for (const t of normalizedTemplate) {
    // Exact match
    if (fieldNorm === t.norm) {
      return { column: t.original, confidence: "high" };
    }

    // Substring match
    if (fieldNorm.includes(t.norm) || t.norm.includes(fieldNorm)) {
      return { column: t.original, confidence: "medium" };
    }
  }

  return null;
}

/**
 * Alias matching (pharmaceutical-specific)
 */
function aliasMatch(fieldNorm, trainingColumns) {
  for (const [targetCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normalizedTarget = normalizeKey(targetCol);

    // Find if this target exists in training columns
    const matchingTrainingCol = trainingColumns.find(
      (col) => normalizeKey(col) === normalizedTarget
    );

    if (!matchingTrainingCol) continue;

    // Check each alias
    for (const alias of aliases) {
      const normalizedAlias = normalizeKey(alias);
      
      // Exact alias match
      if (fieldNorm === normalizedAlias) {
        return { column: matchingTrainingCol, confidence: "high" };
      }

      // Partial alias match
      if (fieldNorm.includes(normalizedAlias) || normalizedAlias.includes(fieldNorm)) {
        return { column: matchingTrainingCol, confidence: "medium" };
      }
    }
  }

  return null;
}

/**
 * Calculate similarity score (0 to 1) using simple algorithm
 */
function calculateSimilarity(str1, str2) {
  const s1 = normalizeKey(str1);
  const s2 = normalizeKey(str2);

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Word overlap scoring
  const words1 = s1.split(/\s+/).filter(w => w.length > 0);
  const words2 = s2.split(/\s+/).filter(w => w.length > 0);

  if (words1.length === 0 || words2.length === 0) return 0;

  const commonWords = words1.filter((w) => words2.includes(w));
  if (commonWords.length > 0) {
    return (commonWords.length * 2) / (words1.length + words2.length);
  }

  return 0;
}

/**
 * Fuzzy matching (slower but more accurate)
 */
function fuzzyMatch(fieldName, trainingColumns) {
  let bestMatch = null;
  let bestScore = 0;

  for (const col of trainingColumns) {
    const score = calculateSimilarity(fieldName, col);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = col;
    }

    // Also check against aliases
    const normalizedCol = normalizeKey(col);
    if (COLUMN_ALIASES[normalizedCol]) {
      for (const alias of COLUMN_ALIASES[normalizedCol]) {
        const aliasScore = calculateSimilarity(fieldName, alias);
        if (aliasScore > bestScore) {
          bestScore = aliasScore;
          bestMatch = col;
        }
      }
    }
  }

  if (bestMatch && bestScore >= 0.8) {
    return { column: bestMatch, confidence: "high" };
  } else if (bestMatch && bestScore >= 0.6) {
    return { column: bestMatch, confidence: "medium" };
  } else if (bestMatch && bestScore >= 0.4) {
    return { column: bestMatch, confidence: "low" };
  }

  return null;
}

/**
 * Main auto-mapping function (Hybrid approach)
 */
export const autoMapWithTemplate = (extractedFields, trainingColumns) => {
  const normalizedTemplate = trainingColumns.map((col) => ({
    original: col,
    norm: normalizeKey(col),
  }));

  console.log("🔍 Auto-mapping", extractedFields.length, "fields...");

  return extractedFields.map((field) => {
    const fieldNorm = normalizeKey(field.fieldName);

    // Step 1: Try simple matching (your original logic - FAST)
    const simpleResult = simpleMatch(fieldNorm, normalizedTemplate);
    if (simpleResult) {
      console.log(
        `  ✅ ${field.fieldName} → ${simpleResult.column} (${simpleResult.confidence}, simple)`
      );
      return {
        ...field,
        autoMapped: simpleResult.column,
        confidence: simpleResult.confidence,
      };
    }

    // Step 2: Try alias matching (pharmaceutical-specific)
    const aliasResult = aliasMatch(fieldNorm, trainingColumns);
    if (aliasResult) {
      console.log(
        `  ✅ ${field.fieldName} → ${aliasResult.column} (${aliasResult.confidence}, alias)`
      );
      return {
        ...field,
        autoMapped: aliasResult.column,
        confidence: aliasResult.confidence,
      };
    }

    // Step 3: Try fuzzy matching (enhanced accuracy)
    const fuzzyResult = fuzzyMatch(field.fieldName, trainingColumns);
    if (fuzzyResult) {
      console.log(
        `  ⚠️ ${field.fieldName} → ${fuzzyResult.column} (${fuzzyResult.confidence}, fuzzy)`
      );
      return {
        ...field,
        autoMapped: fuzzyResult.column,
        confidence: fuzzyResult.confidence,
      };
    }

    // Step 4: No match found
    console.log(`  ❌ ${field.fieldName} → No match`);
    return {
      ...field,
      autoMapped: "",
      confidence: "low",
    };
  });
};

/**
 * Validate required mappings are present
 */
export function validateRequiredMappings(mappings, requiredColumns) {
  const missingColumns = [];

  for (const required of requiredColumns) {
    const normalizedRequired = normalizeKey(required);
    const found = Object.values(mappings).some(
      (mapped) => normalizeKey(mapped) === normalizedRequired
    );

    if (!found) {
      missingColumns.push(required);
    }
  }

  return {
    valid: missingColumns.length === 0,
    missingColumns,
  };
}

export default {
  autoMapWithTemplate,
  validateRequiredMappings,
};