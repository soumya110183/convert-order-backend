export function isJunkLine(text = "") {
  return /^(NO\.?|DATE|PAGE|INVOICE|TOTAL|AMOUNT|GST|NET|REPORT)/i
    .test(text.trim());
}


export function stripLeadingCodes(text = "") {
  return text.replace(/^\d{4,}\s+/, "").trim();
}

export function cleanInvoiceDesc(text = "") {
  if (!text) return "";

  return text
    .toUpperCase()
    // remove FREE schemes
    .replace(/\+\s*\d+\s*(FREE|BONUS)/gi, " ")
    // remove multipliers
    .replace(/\*\s*\d+/g, " ")
    // remove pack sizes only
    .replace(/\b\d+\s*['`"]?\s*S\b/gi, " ")
    // remove trailing price/amounts
    .replace(/\s+\d{3,}\s*$/g, " ")
    // normalize
    .replace(/\s+/g, " ")
    .trim();
}


export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aw = a.split(" ");
  const bw = b.split(" ");
  const common = aw.filter(w => bw.includes(w));

  return common.length / Math.max(aw.length, bw.length);
}
