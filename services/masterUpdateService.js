import MasterOrder from "../models/masterOrder.js";

/**
 * MASTER UPDATE SERVICE
 * Matches invoice items to master rows and updates ORDERQTY only
 * Silent identification using multiple strategies
 */

// Normalize for fuzzy matching
function normalize(text) {
  return String(text || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

// Calculate similarity score (0-1)
function similarity(str1, str2) {
  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  const common = words1.filter(w => words2.includes(w));
  if (common.length === 0) return 0;

  return (common.length * 2) / (words1.length + words2.length);
}

/**
 * Find matching master order for invoice item
 * Strategy priority:
 * 1. Exact SAPCODE match
 * 2. High-similarity ITEMDESC match (>0.85)
 * 3. Partial ITEMDESC match (>0.7)
 * 
 * @param {Object} invoiceItem - { itemIdentifier, sapcode, orderqty }
 * @param {String} customerName - Optional customer filter
 * @returns {Object|null} - Matched master order
 */
async function findMasterMatch(invoiceItem, customerName = null) {
  const { itemIdentifier, sapcode } = invoiceItem;

  // Strategy 1: SAPCODE match
  if (sapcode) {
    const match = await MasterOrder.findOne({
      sapcode: normalize(sapcode),
      isActive: true,
      ...(customerName && { customerName: normalize(customerName) })
    });

    if (match) {
      console.log(`✓ SAPCODE match: ${sapcode}`);
      return match;
    }
  }

  // Strategy 2: Fuzzy ITEMDESC match
  const query = {
    isActive: true,
    ...(customerName && { customerName: normalize(customerName) })
  };

  const candidates = await MasterOrder.find(query).lean();

  let bestMatch = null;
  let bestScore = 0.7; // Minimum threshold

  for (const candidate of candidates) {
    const score = similarity(itemIdentifier, candidate.itemdesc);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    console.log(`✓ Fuzzy match (${(bestScore * 100).toFixed(0)}%): ${itemIdentifier}`);
    return bestMatch;
  }

  console.log(`✗ No match: ${itemIdentifier}`);
  return null;
}

/**
 * Update master orders from parsed invoice
 * @param {Array} invoiceItems - Array of { itemIdentifier, sapcode, orderqty }
 * @param {String} customerName - Optional customer filter
 * @returns {Object} - Update statistics
 */
export async function updateMasterOrders(invoiceItems, customerName = null) {
  const updates = [];
  const unmatched = [];
  
  for (const item of invoiceItems) {
    const masterOrder = await findMasterMatch(item, customerName);

    if (!masterOrder) {
      unmatched.push({
        rawItemDesc: item.itemIdentifier,
        quantity: item.orderqty,
        reason: "NO_MATCH_FOUND"
      });
      continue;
    }

    // Calculate new values
    const newQty = item.orderqty;
    const newBoxPack = masterOrder.pack > 0 
      ? Math.round(newQty / masterOrder.pack) 
      : masterOrder.boxPack;

    // Update master order
    await MasterOrder.findByIdAndUpdate(masterOrder._id, {
      $set: {
        orderqty: newQty,
        boxPack: newBoxPack,
        lastUpdated: new Date()
      }
    });

    updates.push({
      masterOrderId: masterOrder._id,
      itemdesc: masterOrder.itemdesc,
      customerName: masterOrder.customerName,
      oldQty: masterOrder.orderqty,
      newQty,
      updatedAt: new Date()
    });

    console.log(`✓ Updated: ${masterOrder.itemdesc} (${masterOrder.orderqty} → ${newQty})`);
  }

  return {
    updatesApplied: updates,
    unmatchedItems: unmatched,
    stats: {
      totalItems: invoiceItems.length,
      matched: updates.length,
      unmatched: unmatched.length,
      qtyUpdated: updates.reduce((sum, u) => sum + u.newQty, 0)
    }
  };
}

export default { updateMasterOrders };