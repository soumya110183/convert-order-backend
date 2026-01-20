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

  // Join first 30 rows to search for customer info (increased from 20)
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

  // ✅ STRATEGY 1: Explicit prefix patterns (highest priority)
  const explicitPatterns = [
    // M/S prefix (common in Indian invoices)
    /M\/S\s+([A-Z][A-Z\s&.,'-]+(?:PHARMA|PHARMACY|MEDICAL|DRUGS?|LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?|PVT|LTD|LIMITED))/i,
    
    // Customer code with name
    /(?:CUST(?:OMER)?|CLIENT)\s*(?:CODE|NO|#)[:\s]+[A-Z0-9]+\s*[-–]\s*([A-Z][A-Z\s&.,'-]+)/i,
    
    // Table format labels
    /(?:CUSTOMER|CLIENT|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)\s*(?:NAME)?[:\s]+([A-Z][A-Z\s&.,'-]+)/i,
    
    // TO: prefix with business keywords
    /(?:TO|CUSTOMER)[:\s]+([A-Z][A-Z\s&.,'-]+(?:PHARMA|PHARMACY|MEDICAL|DRUGS?|LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?|CORPORATION|PRIVATE|LIMITED))/i,
  ];
  
  for (const pattern of explicitPatterns) {
    const match = headerText.match(pattern);
    if (match) {
      const name = cleanCustomerName(match[1]);
      if (name.length >= 5 && isValidCustomerName(name)) {
        console.log(`✅ Customer detected (Explicit pattern): "${name}"`);
        return name;
      }
    }
  }

  // ✅ STRATEGY 2: Business keyword detection with scoring
  const BUSINESS_KEYWORDS = [
    'PHARMA', 'PHARMACY', 'PHARMACEUTICAL',
    'MEDICAL', 'MEDICALS', 'MEDICARE',
    'DRUG', 'DRUGS', 'DRUG LINES', 'DRUG HOUSE',
    'STORES', 'AGENCIES', 'TRADERS', 'DISTRIBUTORS',
    'ENTERPRISES', 'CORPORATION',
    'PVT LTD', 'PRIVATE LIMITED', 'LLP', 'LIMITED'
  ];
  
  const lines = headerText.split('\n');
  const candidates = [];
  
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    
    // Skip obvious headers and system info
    if (/^(INVOICE|PURCHASE\s+ORDER|TAX\s+INVOICE|BILL|ORDER|DATE|TOTAL|AMOUNT|PAGE|GSTIN|DL\s*NO|ADDRESS|PHONE|EMAIL|WEBSITE|MICRO\s*LABS)/i.test(line)) {
      continue;
    }
    
    // Skip lines that are too short or too long
    if (line.length < 8 || line.length > 120) continue;
    
    // Count business keywords in this line
    const keywordCount = BUSINESS_KEYWORDS.filter(kw => 
      new RegExp(`\\b${kw}\\b`, 'i').test(line)
    ).length;
    
    if (keywordCount >= 1) {
      const name = cleanCustomerName(line);
      
      // Validate: should not be supplier or generic text
      if (name.length >= 5 && isValidCustomerName(name)) {
        candidates.push({ name, score: keywordCount, line: i });
      }
    }
  }
  
  // Return highest scoring candidate
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    console.log(`✅ Customer detected (Keyword score ${best.score}): "${best.name}"`);
    return best.name;
  }

  // ✅ PATTERN 3: Capitalized business name near top
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim();
    
    // Must be reasonable length
    if (line.length < 10 || line.length > 100) continue;
    
    // Skip obvious header lines
    if (/INVOICE|ORDER|TOTAL|AMOUNT|PAGE|GST|DATE|ADDRESS|PHONE|EMAIL/i.test(line)) {
      continue;
    }
    
    // Count uppercase letters
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const totalLetters = (line.match(/[A-Z]/gi) || []).length;
    
    // At least 60% uppercase letters (lowered threshold)
    if (totalLetters > 5 && upperCount / totalLetters >= 0.6) {
      const name = cleanCustomerName(line);
      
      if (name.length >= 5) {
        console.log(`✅ Customer detected (Uppercase line): "${name}"`);
        return name;
      }
    }
  }

  // ✅ STRATEGY 4: Fallback - first capitalized business name
  // Look for lines with high uppercase ratio and reasonable length
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    
    // Must be reasonable length
    if (line.length < 10 || line.length > 100) continue;
    
    // Skip obvious system lines
    if (/INVOICE|ORDER|TOTAL|AMOUNT|PAGE|GST|DATE|ADDRESS|PHONE|EMAIL|MICRO\s*LABS|RAJ\s*DISTRIBUTORS/i.test(line)) {
      continue;
    }
    
    // Count uppercase letters
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const totalLetters = (line.match(/[A-Z]/gi) || []).length;
    
    // At least 60% uppercase and has multiple words
    if (totalLetters > 8 && upperCount / totalLetters >= 0.6) {
      const name = cleanCustomerName(line);
      
      if (name.length >= 8 && isValidCustomerName(name)) {
        // Check if it has at least some business structure
        const hasStructure = /\b(PVT|LTD|LIMITED|LLP|AND|&)\b/i.test(name);
        if (hasStructure || name.split(' ').length >= 2) {
          console.log(`✅ Customer detected (Fallback capitalized): "${name}"`);
          return name;
        }
      }
    }
  }

  console.log('⚠️ No customer detected in invoice');
  return null;
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
    .trim();
  
  // Title case conversion
  cleaned = cleaned
    .split(' ')
    .map(word => {
      // Keep abbreviations uppercase (2-3 letters)
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }
      // Keep if already mixed case (like Pvt, Ltd)
      if (/^[A-Z][a-z]+$/.test(word)) {
        return word;
      }
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
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
    /RAJ\s*DISTRIBUTORS/i,
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