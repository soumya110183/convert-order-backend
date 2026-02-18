/**
 * IMAGE PARSER - OCR-based text extraction for JPG/PNG order images
 * Uses Tesseract.js for optical character recognition
 * Returns text in the same format as pdfParser.js for seamless integration
 */

import Tesseract from "tesseract.js";

/* =====================================================
   CONFIGURATION
===================================================== */

// Tesseract language (English)
const OCR_LANG = "eng";

/* =====================================================
   MAIN EXTRACTION FUNCTION
===================================================== */

/**
 * Extract text from an image buffer using OCR
 * @param {Buffer} buffer - Image file buffer
 * @returns {{ rows: Array, lines: string[] }} - Same format as pdfParser
 */
export async function extractTextFromImage(buffer) {
  console.log(`🖼️  IMAGE OCR: Starting text recognition...`);

  const startTime = Date.now();

  const { data } = await Tesseract.recognize(buffer, OCR_LANG, {
    logger: (info) => {
      if (info.status === "recognizing text") {
        const pct = (info.progress * 100).toFixed(0);
        if (pct % 25 === 0) {
          console.log(`   🔍 OCR Progress: ${pct}%`);
        }
      }
    },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`🖼️  IMAGE OCR: Completed in ${elapsed}s`);
  console.log(`   Confidence: ${data.confidence}%`);

  // Split recognized text into lines
  const rawLines = (data.text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1);

  console.log(`🖼️  IMAGE OCR: Extracted ${rawLines.length} text lines`);

  // Build rows in the same format pdfParser returns
  const rows = rawLines.map((text) => ({
    rawText: text,
    cells: [],
    y: 0,
    fontSize: 12,
    isLargeFont: false,
    isHeader: false,
    cellCount: 0,
  }));

  return {
    rows,
    lines: rawLines,
  };
}

export default { extractTextFromImage };
