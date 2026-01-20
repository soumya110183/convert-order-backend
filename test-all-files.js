/**
 * COMPREHENSIVE EXTRACTION TEST
 * Tests ALL files (PDF, Excel, Text) for extraction accuracy
 */

// Use default import for unifiedParser based on file inspection
import unifiedParser from './services/unifiedParser.js';
const { unifiedExtract } = unifiedParser;

// Use named imports for matching (or default if named fails, but named usually works if exported)
import { matchProductsBatch } from './services/productMatcher.js';

import { splitProduct } from './utils/splitProducts.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx-js-style';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'test-files');

// Files to test
const TEST_FILES = [
  // PDFs
  '002610_25_OR_2500079821438.pdf',
  '308531_25_OR_2500079821602.pdf',
  'ORDER-RAJ.pdf',
  'SRI SABARI AGENCIES_Order_311.pdf',
  'raj 1497.pdf',
  
  // Excel files
  'Ord_802_1.xls',
  'Order Training (1).xls',
  'SRI SABARI AGENCIES_Order_311.xls',
  'THE  CANNANORE DRUG LINES  ( BRANCH )_Order_1734.xls',
  'order raj.xlsx',
  'order-492.xls',
  
  // Text files
  '577.MICROLABS.txt'
];

// Helper to preprocess products like the controller does
function preprocessProducts(products) {
  return products.map(p => {
    if (!p.baseName || !p.dosage) {
      const parts = splitProduct(p.productName);
      return {
        ...p,
        baseName: p.baseName || parts.name,
        dosage: p.dosage || parts.strength,
        variant: p.variant || parts.variant
      };
    }
    return p;
  });
}

// Load Master Database from Excel
function loadMasterDB() {
    try {
        const dbPath = path.join(TEST_DIR, 'Database.xls');
        if (!fs.existsSync(dbPath)) {
            console.warn("⚠️ Database.xls not found in test-files. Matching will be skipped.");
            return [];
        }

        const workbook = XLSX.readFile(dbPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Get all rows as arrays to find header
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // Find header row index
        const headerRowIdx = rows.findIndex(row => 
            row.some(cell => /PRODUCT|NAME|DESC/i.test(String(cell)))
        );
        
        if (headerRowIdx === -1) {
            console.error("❌ Could not find header row in Database.xls");
            return [];
        }
        
        const headers = rows[headerRowIdx];
        const nameIdx = headers.findIndex(h => /PRODUCT|NAME|DESC/i.test(String(h)));
        const codeIdx = headers.findIndex(h => /CODE|SAP/i.test(String(h)));
        
        if (nameIdx === -1) {
             console.error("❌ Could not find Product Name column");
             return [];
        }
        
        console.log(`✅ Found headers at row ${headerRowIdx + 1}: ${headers[nameIdx]} (Idx: ${nameIdx})`);
        
        const products = rows.slice(headerRowIdx + 1).map(row => {
            return {
                productName: row[nameIdx] || "UNKNOWN",
                productCode: codeIdx !== -1 ? row[codeIdx] : "000000"
            };
        }).filter(p => p.productName !== "UNKNOWN");

        return preprocessProducts(products);
    } catch (e) {
        console.error("❌ Failed to load master DB:", e.message);
        return [];
    }
}

async function testFile(fileName, masterProducts) {
  const filePath = path.join(TEST_DIR, fileName);
  const fileType = fileName.endsWith('.pdf') ? 'PDF' : 
                   fileName.endsWith('.txt') ? 'TEXT' : 'EXCEL';
  
  console.log(`\n${'━'.repeat(100)}`);
  console.log(`📄 ${fileType}: ${fileName}`);
  console.log('━'.repeat(100));
  
  try {
    const buffer = fs.readFileSync(filePath);
    const file = {
      originalname: fileName,
      buffer: buffer
    };
    
    // Extract
    const result = await unifiedExtract(file);
    
    // Statistics
    const totalProducts = result.dataRows.length;
    const withQuantity = result.dataRows.filter(p => p.ORDERQTY && p.ORDERQTY > 0).length;
    const missingQuantity = totalProducts - withQuantity;
    
    console.log(`\n📊 EXTRACTION SUMMARY:`);
    console.log(`   Customer: ${result.meta.customerName || 'NOT DETECTED'}`);
    console.log(`   Products Extracted: ${totalProducts}`);
    console.log(`   With Quantity: ${withQuantity}`);
    console.log(`   Missing Quantity: ${missingQuantity}`);
    
    // Match with database
    let matches = 0;
    let unmatched = 0;
    
    if (totalProducts > 0 && masterProducts.length > 0) {
        const { results: matchedResults } = matchProductsBatch(result.dataRows, masterProducts);
        
        matches = matchedResults.length;
        unmatched = totalProducts - matches;
        
        console.log(`\n🎯 MATCHING RESULTS:`);
        console.log(`   Matched: ${matches} (${((matches/totalProducts)*100).toFixed(1)}%)`);
        console.log(`   Unmatched: ${unmatched} (${((unmatched/totalProducts)*100).toFixed(1)}%)`);
    }
    
    // Show extracted products
    const displayLimit = 15;
    if (totalProducts > 0) {
      console.log(`\n📦 EXTRACTED PRODUCTS (First ${Math.min(displayLimit, totalProducts)}):`);
      result.dataRows.slice(0, displayLimit).forEach((p, i) => {
        const qty = p.ORDERQTY || '❌ MISSING';
        const qtyStatus = p.ORDERQTY ? '✅' : '❌';
        console.log(`   ${(i + 1).toString().padStart(2)}. ${qtyStatus} ${p.ITEMDESC.padEnd(50)} | Qty: ${qty}`);
      });
      if (totalProducts > displayLimit) {
          console.log(`   ... and ${totalProducts - displayLimit} more`);
      }
    } else {
        console.log(`\n⚠️ NO PRODUCTS EXTRACTED!`);
    }
    
    // Identify issues
    const issues = [];
    if (!result.meta.customerName) issues.push('⚠️ Customer name not detected');
    if (totalProducts === 0) issues.push('❌ CRITICAL: No products extracted');
    if (missingQuantity > 0) issues.push(`⚠️ ${missingQuantity} products missing quantity`);
    if (missingQuantity === totalProducts && totalProducts > 0) issues.push('❌ CRITICAL: ALL quantities missing');
    
    return {
      file: fileName,
      type: fileType,
      success: totalProducts > 0 && missingQuantity < totalProducts, // Basic success criteria
      totalProducts,
      withQuantity,
      missingQuantity,
      matches,
      unmatched,
      issues: issues.length + (issues.length > 0 ? 1 : 0) // rough count
    };
    
  } catch (error) {
    console.error(`\n❌ EXTRACTION FAILED: ${error.message}`);
    // console.error(error.stack);
    
    return {
      file: fileName,
      type: fileType,
      success: false,
      error: error.message,
      totalProducts: 0,
      withQuantity: 0,
      missingQuantity: 0,
      issues: 1
    };
  }
}

async function main() {
  // Write to log file helper
  const logFile = path.join(__dirname, 'test-results.log');
  fs.writeFileSync(logFile, ''); // Clear file
  
  function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
  }

  log('╔' + '═'.repeat(98) + '╗');
  log('║' + ' '.repeat(30) + '🧪 COMPREHENSIVE EXTRACTION TEST' + ' '.repeat(36) + '║');
  log('║' + ' '.repeat(25) + `Testing ${TEST_FILES.length} files across all formats` + ' '.repeat(36) + '║');
  log('╚' + '═'.repeat(98) + '╝');
  
  // Load Master Data
  log('\n⏳ Loading Master Database...');
  const masterProducts = loadMasterDB();
  log(`✅ Loaded ${masterProducts.length} products from Master DB`);

  const results = [];
  
  for (const fileName of TEST_FILES) {
      const result = await testFile(fileName, masterProducts);
      results.push(result);
  }
  
  // Overall summary
  log(`\n\n${'═'.repeat(100)}`);
  log('📊 OVERALL TEST RESULTS');
  log('═'.repeat(100));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalProducts = results.reduce((sum, r) => sum + r.totalProducts, 0);
  const totalWithQty = results.reduce((sum, r) => sum + r.withQuantity, 0);
  
  log(`\n📈 STATISTICS:`);
  log(`   Files Tested: ${TEST_FILES.length}`);
  log(`   Successful: ${successful} (${((successful/TEST_FILES.length)*100).toFixed(1)}%)`);
  log(`   Failed: ${failed}`);
  log(`   Total Products Extracted: ${totalProducts}`);
  log(`   Products with Quantity: ${totalWithQty} (${((totalWithQty/totalProducts)*100).toFixed(1)}%)`);
  
  // Files with issues
  const filesWithIssues = results.filter(r => r.issues > 0 || !r.success);
  if (filesWithIssues.length > 0) {
    log(`\n⚠️ FILES WITH ISSUES (${filesWithIssues.length}):`);
    filesWithIssues.forEach(r => {
      const status = r.success ? '⚠️' : '❌';
      log(`   ${status} ${r.file} (${r.type})`);
      if (r.error) log(`      Error: ${r.error}`);
      if (r.missingQuantity > 0) log(`      Missing quantities: ${r.missingQuantity}/${r.totalProducts}`);
      if (r.unmatched > 0) log(`      Unmatched products: ${r.unmatched}/${r.totalProducts}`);
    });
  } else {
    log(`\n✅ ALL FILES EXTRACTED SUCCESSFULLY WITH NO ISSUES!`);
  }
  
  log(`\n${'═'.repeat(100)}`);
}

main().catch(console.error);
