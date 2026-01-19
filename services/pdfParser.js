/**
 * PDF TEXT EXTRACTOR - PRODUCTION GRADE v3.0
 * ✅ Prevents header/data row merging
 * ✅ Smart row detection with font analysis
 * ✅ Preserves data integrity
 * ✅ Handles multi-column layouts
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/* =====================================================
   CONFIGURATION
===================================================== */

// Y-axis tolerance for grouping text into rows (tighter = less merging)
const ROW_Y_TOLERANCE = 1.8;

// Font size difference threshold (detects headers vs data)
const FONT_SIZE_THRESHOLD = 1.2;

// X-axis gap to insert space between words
const WORD_GAP_THRESHOLD = 3;

// Minimum text length to consider as valid row
const MIN_ROW_LENGTH = 2;

/* =====================================================
   UTILITIES
===================================================== */

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect if text looks like a header
 */
function isHeader(text, fontSize, medianSize) {
  const upper = text.toUpperCase();
  
  // Font-based detection
  if (fontSize > medianSize + FONT_SIZE_THRESHOLD) return true;
  
  // Content-based detection
  const headerPatterns = [
    /^(CODE|PRODUCT|ITEM|DESCRIPTION|QTY|QUANTITY|PRICE|AMOUNT|TOTAL)/i,
    /^(SR\.?\s*NO|S\.?\s*NO|SL\.?\s*NO)/i,
    /^(PACK|RATE|VALUE|GST|TAX)/i
  ];
  
  return headerPatterns.some(p => p.test(upper));
}

/**
 * Detect if row is likely a separator
 */
function isSeparator(text) {
  return /^[\-_=]{3,}$/.test(text.trim());
}

/* =====================================================
   ROW GROUPING WITH ANTI-MERGE LOGIC
===================================================== */

/**
 * Group text items into rows with intelligent merge prevention
 * Enhanced with position-based anti-merge for multi-column layouts
 */
function groupIntoRows(items, medianFontSize) {
  const rows = [];
  
  for (const item of items) {
    // Find compatible row
    let targetRow = null;
    
    for (const row of rows) {
      const yDiff = Math.abs(row.y - item.y);
      const fontDiff = Math.abs(row.fontSize - item.fontSize);
      const xDiff = Math.abs(row.x - item.x);
      
      // Basic Y-tolerance check
      if (yDiff > ROW_Y_TOLERANCE) continue;
      
      // ANTI-MERGE RULE 1: Prevent different font sizes from merging
      if (fontDiff > FONT_SIZE_THRESHOLD) continue;
      
      // ANTI-MERGE RULE 2: Prevent header from merging with data
      const rowIsHeader = isHeader(row.text, row.fontSize, medianFontSize);
      const itemIsHeader = isHeader(item.text, item.fontSize, medianFontSize);
      
      if (rowIsHeader !== itemIsHeader) continue;
      
      // ANTI-MERGE RULE 3: Prevent rows with many cells from accepting new items
      // (protects against merging product lines with totals)
      if (row.cells.length > 8 && yDiff > 0.8) continue;
      
      // ANTI-MERGE RULE 4: Prevent cross-column merging (NEW)
      // If X position differs significantly from row's leftmost position, likely different column
      if (row.cells.length > 0) {
        const rowLeftmost = Math.min(...row.cells.map(c => c.x));
        const rowRightmost = Math.max(...row.cells.map(c => c.x + c.width));
        
        // If item is far to the left or right of existing row content, it's likely a different row
        if (item.x < rowLeftmost - 50 || item.x > rowRightmost + 50) {
          continue;
        }
      }
      
      // Compatible row found
      targetRow = row;
      break;
    }
    
    // Create new row if no compatible row found
    if (!targetRow) {
      targetRow = {
        y: item.y,
        x: item.x,
        fontSize: item.fontSize,
        cells: [],
        text: item.text
      };
      rows.push(targetRow);
    }
    
    // Add item to row
    targetRow.cells.push(item);
  }
  
  return rows;
}

/**
 * Build text from cells with intelligent spacing
 */
function buildRowText(cells) {
  if (cells.length === 0) return "";
  
  // Sort cells left to right
  cells.sort((a, b) => a.x - b.x);
  
  let text = "";
  
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const nextCell = cells[i + 1];
    
    text += cell.text;
    
    // Add space if there's a gap to next cell
    if (nextCell) {
      const gap = nextCell.x - (cell.x + cell.width);
      
      // Insert space for significant gaps
      if (gap > WORD_GAP_THRESHOLD) {
        // Multiple spaces for larger gaps (column separation)
        const spaces = gap > 20 ? "    " : " ";
        text += spaces;
      }
    }
  }
  
  return cleanText(text);
}

/* =====================================================
   MAIN EXTRACTION FUNCTION
===================================================== */

/**
 * Extract text from PDF with advanced row detection
 */
export async function extractTextFromPDFAdvanced(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    standardFontDataUrl: null
  });

  const pdf = await loadingTask.promise;
  const allRows = [];
  const allLines = [];

  console.log(`📄 PDF: Processing ${pdf.numPages} page(s)`);

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    // Extract items with metadata
    const items = content.items
      .map(item => {
        const fontSize = Math.abs(item.transform?.[0] || 12);
        
        return {
          text: item.str || "",
          x: item.transform?.[4] || 0,
          y: item.transform?.[5] || 0,
          fontSize: fontSize,
          width: item.width || 0
        };
      })
      .filter(item => item.text.trim().length > 0);

    if (items.length === 0) {
      console.log(`📄 Page ${pageNo}: No text items`);
      continue;
    }

    // Calculate median font size for this page
    const fontSizes = items.map(i => i.fontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)];

    console.log(`📄 Page ${pageNo}: ${items.length} items, median font: ${medianFontSize.toFixed(1)}`);

    // Group items into rows
    const rows = groupIntoRows(items, medianFontSize);

    // Sort rows: top to bottom (higher Y first in PDF coordinates)
    rows.sort((a, b) => b.y - a.y);

    console.log(`📄 Page ${pageNo}: Grouped into ${rows.length} rows`);

    // Process each row
    for (const row of rows) {
      const rowText = buildRowText(row.cells);
      
      if (rowText.length < MIN_ROW_LENGTH) continue;
      
      // Skip separators
      if (isSeparator(rowText)) continue;
      
      const rowData = {
        rawText: rowText,
        cells: row.cells,
        y: row.y,
        fontSize: row.fontSize,
        isLargeFont: row.fontSize > medianFontSize + 2,
        isHeader: isHeader(rowText, row.fontSize, medianFontSize),
        cellCount: row.cells.length
      };
      
      allRows.push(rowData);
      allLines.push(rowText);
    }
  }

  await pdf.destroy();

  console.log(`📄 PDF Complete: ${allRows.length} total rows extracted`);

  return { 
    rows: allRows, 
    lines: allLines 
  };
}

/* =====================================================
   ALTERNATIVE: LINE-BY-LINE EXTRACTION
   Fallback method for problematic PDFs
===================================================== */

/**
 * Simple line-by-line extraction without row grouping
 * Use this if main method has issues with specific PDFs
 */
export async function extractTextFromPDFSimple(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    
    for (const item of textContent.items) {
      const text = cleanText(item.str || "");
      if (text.length >= MIN_ROW_LENGTH) {
        lines.push(text);
      }
    }
  }

  await pdf.destroy();

  return {
    rows: lines.map(text => ({ rawText: text })),
    lines: lines
  };
}

export default {
  extractTextFromPDFAdvanced,
  extractTextFromPDFSimple
};