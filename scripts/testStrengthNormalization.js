import { extractStrength, normalizeStrength, hasCompatibleStrength } from '../utils/extractionUtils.js';

console.log('\n🧪 Testing Strength Normalization Fix\n');
console.log('='.repeat(60));

// Test cases
const tests = [
  {
    invoice: 'MECONERV 1500MG',
    database: 'MECONERV 1500',
    description: 'Invoice has MG, database does not'
  },
  {
    invoice: 'VILDAPRIDE M 50/500MG',
    database: 'VILDAPRIDE M 50/500',
    description: 'Combo strength with MG vs without'
  },
  {
    invoice: 'AMLONG 5',
    database: 'AMLONG 5',
    description: 'Both without MG'
  }
];

tests.forEach((test, i) => {
  console.log(`\nTest ${i + 1}: ${test.description}`);
  console.log(`-`.repeat(60));
  console.log(`Invoice:  "${test.invoice}"`);
  console.log(`Database: "${test.database}"`);
  
  const invStrength = extractStrength(test.invoice);
  const dbStrength = extractStrength(test.database);
  
  console.log(`\nExtracted:`);
  console.log(`  Invoice:  "${invStrength}"`);
  console.log(`  Database: "${dbStrength}"`);
  
  const invNorm = normalizeStrength(invStrength);
  const dbNorm = normalizeStrength(dbStrength);
  
  console.log(`\nNormalized:`);
  console.log(`  Invoice:  "${invNorm}"`);
  console.log(`  Database: "${dbNorm}"`);
  
  const compatible = hasCompatibleStrength(test.invoice, test.database);
  
  console.log(`\nResult: ${compatible ? '✅ COMPATIBLE - Will auto-match!' : '❌ NOT COMPATIBLE'}`);
  console.log(`Match: ${invNorm === dbNorm ? '✅ Normalized strengths match' : '❌ Normalized strengths differ'}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ Test complete!\n');
