/**
 * CUSTOMER DETECTOR - ENHANCED VERSION
 * ✅ Multiple detection strategies
 * ✅ Handles various invoice formats
 */

/**
 * Detects customer name from invoice text
 * Uses multiple patterns for better detection
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

  // ✅ PATTERN 1: "TO:" or "CUSTOMER:" prefix
  const patterns = [
    /(?:TO|CUSTOMER|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)[:\s]+([A-Z][A-Z\s&.,'-]+(?:PHARMA|PHARMACY|MEDICAL|DRUGS?|LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?|CORPORATION|PRIVATE|LIMITED))/i,
    /(?:TO|CUSTOMER)[:\s]+\n?\s*([A-Z][A-Z\s&.,'-]{5,})/i,
    /CUSTOMER\s+NAME[:\s]+([A-Z][A-Z\s&.,'-]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = headerText.match(pattern);
    if (match) {
      const name = cleanCustomerName(match[1]);
      if (name.length >= 5) {
        console.log(`✅ Customer detected (Pattern match): "${name}"`);
        return name;
      }
    }
  }

  // ✅ PATTERN 2: Line containing pharmacy keywords
  const lines = headerText.split('\n');
  
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    
    // Skip obvious headers
    if (/^(INVOICE|PURCHASE\s+ORDER|TAX\s+INVOICE|BILL|ORDER|DATE|TOTAL|AMOUNT|PAGE|GSTIN|ADDRESS|PHONE|EMAIL|WEBSITE)/i.test(line)) {
      continue;
    }
    
    // Skip lines that are too short or too long
    if (line.length < 5 || line.length > 120) continue;
    
    // Look for pharmacy-related business names
    if (/(?:PHARMA|PHARMACY|MEDICAL|MEDICALS|DRUGS?|DRUG\s+LINES|STORES?|AGENCIES?|TRADERS?|DISTRIBUTORS?|ENTERPRISES?)/i.test(line)) {
      const name = cleanCustomerName(line);
      
      // Validate: should not be our company or generic text
      if (name.length >= 5 && 
          !name.includes('INVOICE') && 
          !name.includes('ORDER') &&
          !name.includes('TOTAL') &&
          !name.includes('AMOUNT')) {
        console.log(`✅ Customer detected (Keyword line): "${name}"`);
        return name;
      }
    }
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

  // ✅ PATTERN 4: Look for specific customer code format
  // Some invoices have: "CUST CODE: CT004 - THE CANNORE DRUG LINES"
  const codePattern = /(?:CUST|CUSTOMER)\s+(?:CODE|NO|#)[:\s]+([A-Z0-9]+)\s*[-–]\s*([A-Z][A-Z\s&.,'-]+)/i;
  const codeMatch = headerText.match(codePattern);
  
  if (codeMatch) {
    const name = cleanCustomerName(codeMatch[2]);
    if (name.length >= 5) {
      console.log(`✅ Customer detected (Code pattern): "${name}"`);
      return name;
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
  
  let cleaned = text
    .trim()
    // Remove leading prefixes
    .replace(/^(?:TO|CUSTOMER|BILL\s+TO|SHIP\s+TO|SOLD\s+TO)[:\s]+/i, '')
    // Remove trailing punctuation
    .replace(/[.,;:]+$/, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Title case conversion
  cleaned = cleaned
    .split(' ')
    .map(word => {
      // Keep abbreviations uppercase
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }
      // Keep if already mixed case (like PVT, Ltd)
      if (/^[A-Z][a-z]+$/.test(word)) {
        return word;
      }
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  return cleaned;
}

export default { detectCustomerFromInvoice };