/**
 * UNIVERSAL TABLE-AWARE PDF ROW MERGING
 * 
 * This module provides intelligent row merging for PDF extraction
 * that works universally across all pharma invoice formats.
 * 
 * Key Features:
 * - Groups text items by Y-position (same table row)
 * - Sorts by X-position (left to right)
 * - Handles split product data intelligently
 * - Works with multi-column layouts
 */

const ROW_Y_TOLERANCE = 1.8;
const MIN_ROW_LENGTH = 2;

/**
 * Universal table-aware row merging
 * Groups text items by Y-position and merges them left-to-right
 * 
 * @param {Array} rows - Array of row objects with rawText, x, y properties
 * @returns {Array} - Array of merged text strings
 */
export function mergePDFRowsTableAware(rows) {
  const merged = [];
  
  // STEP 1: Group rows by Y-position (table-aware)
  const rowGroups = [];
  let currentGroup = [];
  let lastY = null;
  
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const text = r?.rawText?.trim();
    if (!text) continue;
    
    const y = r.y || 0;
    
    // If Y-position changed significantly (new row in table), start new group
    if (lastY !== null && Math.abs(y - lastY) > ROW_Y_TOLERANCE) {
      if (currentGroup.length > 0) {
        rowGroups.push(currentGroup);
        currentGroup = [];
      }
    }
    
    currentGroup.push({ index: i, text, x: r.x || 0, y });
    lastY = y;
  }
  
  // Add last group
  if (currentGroup.length > 0) {
    rowGroups.push(currentGroup);
  }
  
  console.log(`\ud83d\udd17 Grouped ${rows.length} raw items into ${rowGroups.length} table rows`);
  
  // STEP 2: Merge items in each group (left to right)
  for (const group of rowGroups) {
    // Sort by X-position (left to right)
    group.sort((a, b) => a.x - b.x);
    
    // Combine texts with intelligent spacing
    const texts = [];
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const nextItem = group[i + 1];
      
      texts.push(item.text);
      
      // Add space between items if there's a gap
      if (nextItem) {
        // ALWAYS add at least one space to prevent "TAB1X10"
        // PDF parser usually separates tokens at word/column boundaries
        texts.push(' ');
        
        const gap = nextItem.x - item.x;
        // Larger gap = more spaces (visual separation for debugging)
        if (gap > 50) {
          texts.push('  '); 
        }
      }
    }
    
    const mergedText = texts.join('').replace(/\\s+/g, ' ').trim();
    if (mergedText.length >= MIN_ROW_LENGTH) {
      merged.push(mergedText);
    }
  }
  
  console.log(`✅ Merged into ${merged.length} complete rows`);
  return merged;
}

/**
 * Test the merging with sample data
 */
export function testTableAwareMerging() {
  const sampleRows = [
    { rawText: '1', x: 10, y: 100 },
    { rawText: '1013', x: 30, y: 100 },
    { rawText: 'DIANORM-OD- 60MG TAB', x: 80, y: 100 },
    { rawText: '1X10', x: 250, y: 100 },
    { rawText: '30', x: 300, y: 100 },
    { rawText: '2314.20', x: 350, y: 100 },
    
    { rawText: '2', x: 10, y: 115 },
    { rawText: '2348', x: 30, y: 115 },
    { rawText: 'ARNIV - 50MG TAB', x: 80, y: 115 },
    { rawText: '15\'S', x: 250, y: 115 },
    { rawText: '15', x: 300, y: 115 },
    { rawText: '3162.90', x: 350, y: 115 },
  ];
  
  const merged = mergePDFRowsTableAware(sampleRows);
  
  console.log('\n🧪 TEST RESULTS:');
  merged.forEach((row, i) => {
    console.log(`  ${i + 1}. "${row}"`);
  });
  
  return merged;
}

export default { mergePDFRowsTableAware, testTableAwareMerging };
