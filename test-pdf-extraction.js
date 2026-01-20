/**
 * PDF EXTRACTION TEST SCRIPT
 * Tests extraction on multiple PDFs to identify universal patterns
 */

import { extractTextFromPDFAdvanced } from './services/pdfParser.js';
import { unifiedExtract } from './services/unifiedParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_FILES = [
  'test-files/SRI SABARI AGENCIES_Order_311.pdf',
  'test-files/ORDER-RAJ.pdf',
  'test-files/raj 1497.pdf'
];

async function analyzePDF(filePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 ANALYZING: ${path.basename(filePath)}`);
  console.log('='.repeat(80));

  try {
    const buffer = fs.readFileSync(filePath);
    const { rows } = await extractTextFromPDFAdvanced(buffer);

    console.log(`\n📊 STATISTICS:`);
    console.log(`   Total rows: ${rows.length}`);
    console.log(`   Median font size: ${calculateMedianFontSize(rows).toFixed(1)}`);

    // Show all rows with markers for potential products
    console.log(`\n📋 ALL ROWS (with product detection):`);
    rows.forEach((r, i) => {
      const text = r.rawText || '';
      const hasForm = /\b(TAB|CAP|INJ|SYP|CAPS|TABLETS)\b/i.test(text);
      const hasMG = /\d+\s*(MG|ML|MCG)/i.test(text);
      const hasCode = /^\d{3,6}\s+[A-Z]/.test(text);
      const hasQty = /\b\d{1,4}\b/.test(text) && !/^\d{10,}/.test(text);
      
      let marker = '';
      if (hasForm || hasMG) marker = ' ⭐ PRODUCT';
      else if (hasCode) marker = ' 🔢 CODE';
      else if (hasQty && text.length < 30) marker = ' #️⃣ QTY?';
      
      console.log(`  ${(i + 1).toString().padStart(3)}. "${text}"${marker}`);
    });

    // Try extraction
    console.log(`\n🔄 TESTING EXTRACTION...`);
    const file = {
      originalname: path.basename(filePath),
      buffer: buffer
    };
    
    const result = await unifiedExtract(file);
    
    console.log(`\n✅ EXTRACTION RESULTS:`);
    console.log(`   Products extracted: ${result.dataRows.length}`);
    console.log(`   Customer: ${result.meta.customerName}`);
    
    if (result.dataRows.length > 0) {
      console.log(`\n📦 EXTRACTED PRODUCTS:`);
      result.dataRows.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.ITEMDESC} | Qty: ${p.ORDERQTY || 'MISSING'}`);
      });
    } else {
      console.log(`\n⚠️ NO PRODUCTS EXTRACTED!`);
    }

  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
  }
}

function calculateMedianFontSize(rows) {
  const fontSizes = rows.map(r => r.fontSize || 12).sort((a, b) => a - b);
  return fontSizes[Math.floor(fontSizes.length / 2)];
}

async function main() {
  console.log('🧪 PDF EXTRACTION ANALYSIS');
  console.log('Testing multiple PDFs to identify universal patterns\n');

  for (const file of TEST_FILES) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      await analyzePDF(fullPath);
    } else {
      console.log(`\n⚠️ File not found: ${file}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ ANALYSIS COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
