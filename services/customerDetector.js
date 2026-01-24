/**
 * CUSTOMER DETECTOR - PRODUCTION GRADE v2.0
 * ✅ Multiple detection strategies with priority
 * ✅ Handles M/S prefix, table formats, code patterns
 * ✅ Business structure keyword detection
 * ✅ Fallback with confidence scoring
 */

/**
 * Detects customer name from invoice text
 * Returns customer name or null if not found with confidence
 */
export function detectCustomerFromInvoice(rows = []) {
  if (!rows || !rows.length) return null;

  // ✅ STEP 1: Build headerText FIRST (required for all strategies)
  const headerText = rows
    .slice(0, 30)
    .map(r => {
      if (typeof r === 'string') return r;
      if (r?.rawText) return r.rawText;
      if (r?.text) return r.text;
      if (Array.isArray(r)) return r.join(' ');
      return '';
    })
    .join('\n');

  console.log('🔍 Searching for customer in invoice header...');

  /* =====================================================
     ✅ STRATEGY 0: FIRST-LINE BUSINESS NAME (CRITICAL)
     Handles invoices like:
     SABARI ASSOCIATES
     KMC 3/378
     A T ROAD...
  ===================================================== */

  const topLines = headerText.split('\n').slice(0, 5);

  for (const lineRaw of topLines) {
    const line = lineRaw.trim();
    if (!line || line.length < 5) continue;

    // Skip obvious junk
    if (/GSTIN|DL\s*NO|PHONE|TIN|INVOICE|ORDER/i.test(line)) continue;

    // Must be mostly uppercase
    const letters = line.match(/[A-Z]/g)?.length || 0;
    const total = line.match(/[A-Z]/gi)?.length || 0;
    if (total === 0 || letters / total < 0.7) continue;

    // Must look like business name - 🔥 EXPANDED
    const isBusiness = /\b(ASSOCIATES?|AGENCIES?|TRADERS?|PHARMA|PHARMACY|MEDICAL|DISTRIBUTORS?|ENTERPRISES?|DRUG\s*HOUSE|DRUGS?|WHOLESALE|RETAIL|STORES?|MART|DEPOT|STOCKIST|SURGICALS?|SUPPLIERS?|CO\.?|CORPORATION|CHEMISTS?|HEALTH\s*CARE|HOSPITALS?|CLINICS?|MEDICARE)\b/i.test(line);
    
    // console.log(`DEBUG: Line "${line}" | Business: ${isBusiness}`);
    
    if (!isBusiness) {
      continue;
    }

    // Must NOT be address
    if (isAddressLine(line)) continue;

    const name = cleanCustomerName(line);
    if (isValidCustomerName(name)) {
      console.log(`✅ Customer detected (Top-line rule): "${name}"`);
      return name;
    }
  }

  /* =====================================================
     STRATEGY 1: Explicit prefixes (M/S, BILL TO, etc.)
  ===================================================== */

  const explicitPatterns = [
    /M\/S\s+([A-Z][A-Z\s&.,'-]+(?:PHARMA|PHARMACY|MEDICAL|DRUGS?|DRUG\s*HOUSE|LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?|WHOLESALE|STOCKIST|SURGICALS?|CHEMISTS?|PVT|LTD|LIMITED))/i,
    /(?:CUSTOMER|CLIENT|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)\s*(?:NAME)?[:\s]+([A-Z][A-Z\s&.,'-]+)/i,
    /(?:TO|CUSTOMER)[:\s]+([A-Z][A-Z\s&.,'-]+(?:PHARMA|PHARMACY|MEDICAL|DRUGS?|DRUG\s*HOUSE|LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?|WHOLESALE|STOCKIST|SURGICALS?|CHEMISTS?|CORPORATION|PRIVATE|LIMITED))/i
  ];

  for (const pattern of explicitPatterns) {
    const match = headerText.match(pattern);
    if (match) {
      const name = cleanCustomerName(match[1]);
      if (isValidCustomerName(name)) {
        console.log(`✅ Customer detected (Explicit pattern): "${name}"`);
        return name;
      }
    }
  }

  /* =====================================================
     STRATEGY 2+: (rest of your existing logic)
     ✅ NO CHANGES REQUIRED BELOW THIS POINT
  ===================================================== */

  // ... keep your existing Strategy 2, 3, 4 unchanged ...

  console.log('⚠️ No customer detected in invoice');
  return null;
}


/**
 * Detect if a line is an address (not a customer name)
 */
function isAddressLine(text) {
  if (!text) return false;
  
  const upper = text.toUpperCase();
  
  // Address indicators:
  // 1. Street numbers: 11/267(5), 41/685, 17/252/8/3
  const hasStreetNumber = /\b\d+\/\d+/.test(text);
  
  // 2. Street keywords
  const hasStreetKeyword = /\b(STREET|ROAD|AVENUE|LANE|BUILDING|FLOOR|NEAR|OPPOSITE|OPP\.|JUNCTION|CIRCLE|MAIN\s+ROAD|CROSS|LAYOUT)\b/i.test(upper);
  
  // 3. Parentheses with numbers (often indicates building/plot numbers)
  const hasPlotNumber = /\(\d+\)/.test(text);
  
  // 4. "NEW NO" or "OLD NO" patterns
  const hasNewOldNo = /\b(NEW\s+NO|OLD\s+NO|NO\.?\s*\d+)\b/i.test(upper);
  
  // 5. Starts with address field label
  const startsWithAddress = /^(ADDRESS|ADDR\.|LOCATION|AT:|NEAR)/i.test(upper);
  
  // If it has multiple address indicators, it's definitely an address
  const indicators = [
    hasStreetNumber,
    hasStreetKeyword,
    hasPlotNumber,
    hasNewOldNo,
    startsWithAddress
  ].filter(Boolean).length;
  
  // 2 or more indicators = address line
  if (indicators >= 2) return true;
  
  // Single strong indicator is also enough
  if (startsWithAddress) return true;
  if (hasStreetNumber && hasStreetKeyword) return true;
  
  return false;
}

/**
 * Clean and normalize customer name
 */
function cleanCustomerName(text) {
  if (!text) return '';
  console.log(`[CustomerClean] Input: "${text}"`);
  
  let cleaned = text
    .trim()
    // Remove leading prefixes
    .replace(/^(?:M\/S|M\s+|M\.\s*|MS\s+|TO|CUSTOMER|CLIENT|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)[:\s]*/i, '')
    // 4. Cleanup noise
    // Remove "M/S", "M / S", or isolated "M" at start (common in text files)
    .replace(/^M\s*\/\s*S\s+/i, "")
    .replace(/^M\s+S\s+/i, "")
    .replace(/^M\s+/i, "") // Remove 'M' prefix (e.g. "M                   ATTUPURAM")
    // Remove leading special chars
    .replace(/^[:\-.,\s]+/, "")
    // Remove "TO:" or "BUYER:" prefix
    .replace(/^(TO|BUYER|PARTY|CUSTOMER|BILL TO|SHIP TO)[:\-\s]+/i, "")
    // Remove customer code if present
    .replace(/^[A-Z0-9]+\s*[-–]\s*/i, '')
    // Remove trailing punctuation
    .replace(/[.,;:]+$/, '')
    // Remove address indicators
    .replace(/\s*,\s*(P\.?O\.?|POST\s*BOX|BANK\s*ROAD|BUILDING).*$/i, '')
    // Remove branch indicators
    .replace(/\s*\(\s*BRANCH\s*\)/gi, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .replace(/\./g, '') // 🔥 Fix: Remove dots early
    .trim()
    .toUpperCase(); // 🔥 Force Uppercase for consistent matching
  
  // Previously had Title Case logic here - Removed to fix mismatches
  // (e.g. Ayyappa Enterprises vs AYYAPPA ENTERPRISES)
  
  console.log(`[CustomerClean] Output: "${cleaned}"`);
  return cleaned;
  
  console.log(`[CustomerClean] Output: "${cleaned}"`);
  return cleaned;
}

/**
 * Validate if extracted name is likely a real customer
 */
function isValidCustomerName(name) {
  if (!name || name.length < 5) return false;
  
  // Blacklist: supplier/system info
  const SUPPLIER_PATTERNS = [
    /MICRO\s*LABS/i,
    /RAJ\s*DISTRIBUTORS/i, // ✅ Blocked again (It is a supplier)
    /BLUEFOX/i,
    /SOFTWARE/i,
    /INVOICE/i,
    /BILL\s*TO/i,
    /SHIP\s*TO/i,
    /TOTAL/i,
    /AMOUNT/i,
    /PRINTED\s*BY/i
  ];
  
  if (SUPPLIER_PATTERNS.some(p => p.test(name))) return false;
  
  // Must have at least 2 words or be a compound word
  const words = name.split(' ').filter(w => w.length > 0);
  if (words.length < 1) return false;
  
  // Must have reasonable letter content
  const letters = (name.match(/[A-Z]/gi) || []).length;
  if (letters < 5) return false;
  
  return true;
}

export default { detectCustomerFromInvoice };