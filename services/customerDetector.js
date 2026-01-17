/**
 * Safely detect customer name from invoice header rows
 * Handles PDF / OCR / text / excel safely
 */
export function detectCustomerFromInvoice(rows = []) {
  if (!Array.isArray(rows)) return null;

  const BLOCKLIST = [
    "GSTIN",
    "DL NO",
    "SUPPLIER",
    "DISTRIBUTOR",
    "ORDER NO",
    "INVOICE",
    "BILL",
    "APPROX VALUE",
    "TOTAL",
    "PRINTED BY",
    "PHONE",
    "TIN",
    "RAJ DISTRIBUTORS", // 🚫 supplier
    "BLUEFOX",
    "SOFTWARE"
  ];

  for (const row of rows.slice(0, 40)) {
    let raw = "";

    // ✅ SAFE NORMALIZATION
    if (typeof row === "string") {
      raw = row;
    } else if (row?.rawText && typeof row.rawText === "string") {
      raw = row.rawText;
    } else if (row?.text && typeof row.text === "string") {
      raw = row.text;
    } else {
      continue;
    }

    const text = raw
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    if (text.length < 8) continue;
    if (BLOCKLIST.some(b => text.includes(b))) continue;

    // 🎯 Pharma customer patterns
    if (
      /(DRUG\s+LINES|MEDICALS|PHARMA|ENTERPRISES|AGENCIES|TRADERS)/i.test(text)
    ) {
      return text;
    }
  }

  return null;
}
