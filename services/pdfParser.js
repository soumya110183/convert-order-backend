/**
 * PRODUCTION-GRADE PDF TEXT EXTRACTOR v2.0
 * Enhanced row detection preventing header/data merging
 * File: backend/services/pdfParser.js
 * Dependency: pdfjs-dist
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/* ========================================================================
   CONFIGURATION
======================================================================== */

// Y-tolerance for grouping text items into rows
// Tighter tolerance prevents headers merging with data
const ROW_Y_TOLERANCE = 1.5;

// Font size difference threshold (indicates header vs data)
const FONT_SIZE_THRESHOLD = 1.5;

/* ========================================================================
   UTILITIES
======================================================================== */

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function isNumeric(str) {
  return /^\d+$/.test(String(str));
}

/* ========================================================================
   ENHANCED PDF EXTRACTION
======================================================================== */

export async function extractTextFromPDFAdvanced(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    standardFontDataUrl: null
  });

  const pdf = await loadingTask.promise;

  const rows = [];
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    // Extract items with enhanced metadata
    const items = content.items
      .map(item => {
        // Get font size from transform matrix
        const fontSize = item.transform?.[0] || 12;
        
        return {
          text: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          fontSize: fontSize,
          width: item.width || 0
        };
      })
      .filter(i => i.text && i.text.trim());

    if (items.length === 0) continue;

    // Calculate median font size for the page
    const fontSizes = items.map(i => i.fontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)];

    /* ========================================================================
       ROW GROUPING WITH ANTI-MERGE LOGIC
    ======================================================================== */
    
    const tempRows = [];

    for (const item of items) {
      // Find existing row within Y-tolerance
      let row = tempRows.find(r => {
        const yDiff = Math.abs(r.y - item.y);
        
        // Base Y-tolerance check
        if (yDiff > ROW_Y_TOLERANCE) return false;
        
        // Additional check: prevent merging if font sizes differ significantly
        const fontDiff = Math.abs(r.fontSize - item.fontSize);
        if (fontDiff > FONT_SIZE_THRESHOLD) return false;
        
        // Additional check: prevent merging if Y positions differ AND
        // the existing row already has substantial content
        if (yDiff > 0.5 && r.cells.length > 5) return false;
        
        return true;
      });

      if (!row) {
        row = { 
          y: item.y, 
          fontSize: item.fontSize,
          cells: [] 
        };
        tempRows.push(row);
      }

      row.cells.push(item);
    }

    // Sort rows: top to bottom (higher Y first in PDF coordinates)
    tempRows.sort((a, b) => b.y - a.y);

    // Process each row
    for (const row of tempRows) {
      // Sort cells left to right
      row.cells.sort((a, b) => a.x - b.x);

      // Smart text joining with spacing detection
      let rowText = "";
      
      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];
        const nextCell = row.cells[i + 1];
        
        rowText += cell.text;
        
        // Add space if there's a gap to next cell
        if (nextCell) {
          const gap = nextCell.x - (cell.x + cell.width);
          // Add space if gap is significant (more than 2 units)
          if (gap > 2) {
            rowText += " ";
          }
        }
      }

      const cleaned = clean(rowText);
      
      if (cleaned.length > 1) {
        rows.push({ 
          rawText: cleaned, 
          cells: row.cells,
          y: row.y,
          fontSize: row.fontSize,
          isLargeFont: row.fontSize > medianFontSize + 2
        });
        lines.push(cleaned);
      }
    }
  }

  await pdf.destroy();

  return { rows, lines };
}

/* ========================================================================
   ALTERNATIVE: VERTICAL CLUSTERING
   Use this if row detection still has issues
======================================================================== */

export async function extractTextFromPDFWithClustering(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;

  const allLines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const items = content.items
      .map(item => ({
        text: item.str,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        fontSize: item.transform?.[0] || 12
      }))
      .filter(i => i.text && i.text.trim());

    if (items.length === 0) continue;

    // Cluster by Y-coordinate using DBSCAN-like approach
    const clusters = [];
    const visited = new Set();

    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;

      const cluster = [items[i]];
      visited.add(i);

      for (let j = i + 1; j < items.length; j++) {
        if (visited.has(j)) continue;

        const yDiff = Math.abs(items[i].y - items[j].y);
        
        if (yDiff <= ROW_Y_TOLERANCE) {
          cluster.push(items[j]);
          visited.add(j);
        }
      }

      clusters.push(cluster);
    }

    // Sort clusters top to bottom
    clusters.sort((a, b) => b[0].y - a[0].y);

    // Build lines from clusters
    for (const cluster of clusters) {
      cluster.sort((a, b) => a.x - b.x);
      const text = clean(cluster.map(c => c.text).join(" "));
      
      if (text.length > 1) {
        allLines.push(text);
      }
    }
  }

  await pdf.destroy();

  return { 
    rows: allLines.map(text => ({ rawText: text })), 
    lines: allLines 
  };
}

export default {
  extractTextFromPDFAdvanced,
  extractTextFromPDFWithClustering
};