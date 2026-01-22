/**
 * TEST MG SUFFIX MATCHING
 * 
 * This test verifies that products match correctly whether MG suffix is present or not
 */

import { matchProductSmart } from '../services/productMatcher.js';
import fs from 'fs';

// Mock products in database (without MG)
const mockProducts = [
  {
    _id: '1',
    productCode: 'FTINV0381',
    productName: 'VILDAPRIDE M 50/500',
    baseName: 'VILDAPRIDE M',
    dosage: '50/500',
    variant: null,
    division: 'DTF1',
    pack: 0.33,
    boxPack: 3
  },
  {
    _id: '2',
    productCode: 'FTINA0123',
    productName: 'AMLONG 5',
    baseName: 'AMLONG',
    dosage: '5',
    variant: null,
    division: 'CC',
    pack: 1,
    boxPack: 10
  },
  {
    _id: '3',
    productCode: 'TEST001',
    productName: 'METAPRO 50 SR',
    baseName: 'METAPRO',
    dosage: '50',
    variant: 'SR',
    division: 'CAR1',
    pack: 1,
    boxPack: 10
  }
];

let output = '';
const log = (msg) => {
  console.log(msg);
  output += msg + '\n';
};

log('\n🧪 Testing Product Matching with MG Suffixes\n');
log('='.repeat(60));

// Test cases: invoice text WITH MG vs database WITHOUT MG
const testCases = [
  {
    invoice: 'VILDAPRIDE M 50/500MG',
    expected: 'VILDAPRIDE M 50/500',
    description: 'Combo strength with MG'
  },
  {
    invoice: 'VILDAPRIDE M 50/500',
    expected: 'VILDAPRIDE M 50/500',
    description: 'Combo strength without MG'
  },
  {
    invoice: 'AMLONG 5MG',
    expected: 'AMLONG 5',
    description: 'Single strength with MG'
  },
  {
    invoice: 'AMLONG 5',
    expected: 'AMLONG 5',
    description: 'Single strength without MG'
  },
  {
    invoice: 'METAPRO 50MG SR',
    expected: 'METAPRO 50 SR',
    description: 'Strength with MG and variant'
  },
  {
    invoice: 'METAPRO 50 SR',
    expected: 'METAPRO 50 SR',
    description: 'Strength without MG and variant'
  }
];

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  log(`\nTest ${i + 1}: ${test.description}`);
  log(`Invoice: "${test.invoice}"`);
  log(`Expected: "${test.expected}"`);
  
  const result = matchProductSmart(test.invoice, mockProducts);
  
  if (result && result.productName === test.expected) {
    log(`✅ PASS - Matched: "${result.productName}"`);
    log(`   Confidence: ${result.confidence?.toFixed(2)}, Type: ${result.matchType}`);
    passed++;
  } else if (result) {
    log(`❌ FAIL - Matched wrong product: "${result.productName}"`);
    failed++;
  } else {
    log(`❌ FAIL - No match found`);
    failed++;
  }
});

log('\n' + '='.repeat(60));
log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  log('\n✅ All tests passed! MG suffix matching works correctly.\n');
} else {
  log(`\n⚠️  ${failed} tests failed. Please review the matching logic.\n`);
}

fs.writeFileSync('mg-test-results.txt', output);
log('Results saved to mg-test-results.txt');

