import { unifiedExtract } from './services/unifiedParser.js';
import fs from 'fs';

console.log('='.repeat(70));
console.log('TESTING SAP CODE BLOCKING FIX');
console.log('='.repeat(70));

// Test SRI SABARI AGENCIES PDF
const testFile = async (filename, expectedProducts, expectedQtys) => {
  console.log(`\n📄 Testing: ${filename}`);
  console.log('-'.repeat(70));
  
  try {
    const buffer = fs.readFileSync(`test-files/${filename}`);
    const result = await unifiedExtract({ originalname: filename, buffer });
    
    console.log(`✅ Extracted: ${result.dataRows.length} products`);
    console.log(`   Expected: ${expectedProducts} products\n`);
    
    result.dataRows.forEach((p, i) => {
      const expected = expectedQtys[i];
      const match = p.ORDERQTY === expected;
      const icon = match ? '✅' : '❌';
      console.log(`   ${icon} ${i + 1}. ${p.ITEMDESC} | Qty: ${p.ORDERQTY} (expected: ${expected})`);
    });
    
    const allCorrect = result.dataRows.every((p, i) => p.ORDERQTY === expectedQtys[i]);
    const countCorrect = result.dataRows.length === expectedProducts;
    
    if (allCorrect && countCorrect) {
      console.log('\n🎉 PASS: All products and quantities correct!');
      return true;
    } else {
      console.log('\n❌ FAIL: Some products or quantities incorrect!');
      return false;
    }
  } catch (error) {
    console.log(`\n❌ ERROR: ${error.message}`);
    return false;
  }
};

// Run tests
const results = [];

// Test 1: SRI SABARI AGENCIES (the problematic one)
results.push(await testFile(
  'SRI SABARI AGENCIES_Order_311.pdf',
  4,
  [30, 15, 45, 120]
));

// Test 2: raj 1497.pdf (should still work)
results.push(await testFile(
  'raj 1497.pdf',
  23,
  [120, 10, 10, 20, 10, 30, 100, 100, 120, 20, 20, 20, 10, 20, 20, 150, 10, 10, 10, 20, 110, 10, 20]
));

console.log('\n' + '='.repeat(70));
console.log('FINAL RESULTS');
console.log('='.repeat(70));
console.log(`SRI SABARI: ${results[0] ? '✅ PASS' : '❌ FAIL'}`);
console.log(`raj 1497: ${results[1] ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Overall: ${results.every(r => r) ? '🎉 ALL TESTS PASS' : '❌ SOME TESTS FAIL'}`);
