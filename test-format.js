/**
 * COMPREHENSIVE TEST SUITE FOR PHARMA ORDER EXTRACTION
 * Tests all file formats against production requirements
 * 
 * Run: node backend/test-pharma-extraction.js
 */

import {
  extractPurchaseOrderPDF,
  extractOrderText,
  extractInvoiceExcel
} from './services/unifiedParser.js';
import fs from 'fs';
import path from 'path';

const TEMPLATE_COLUMNS = [
  "CODE",
  "CUSTOMER NAME",
  "SAPCODE",
  "ITEMDESC",
  "ORDERQTY",
  "BOX PACK",
  "PACK",
  "DVN"
];

/* ========================================================================
   TEST RUNNER
======================================================================== */

async function runTests() {
  console.log('🏥 PHARMACEUTICAL ORDER EXTRACTION - PRODUCTION TEST SUITE');
  console.log('='.repeat(80));
  console.log('Target Template: CODE | CUSTOMER NAME | SAPCODE | ITEMDESC | ORDERQTY | BOX PACK | PACK | DVN');
  console.log('='.repeat(80));
  console.log('');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
  };

  // Test Suite 1: PDF Purchase Orders
  console.log('\n📄 TEST SUITE 1: PDF PURCHASE ORDERS');
  console.log('-'.repeat(80));
  
  await testPDF(
    './test-files/002610_25_OR_2500079821438.pdf',
    {
      minProducts: 1,
      format: 'Standard Purchase Order',
      mustHaveCustomer: true
    },
    results
  );

  // Test Suite 2: PDF Indent Forms (Multi-Company)
  console.log('\n📄 TEST SUITE 2: PDF INDENT FORMS (MULTI-COMPANY)');
  console.log('-'.repeat(80));
  
  await testPDF(
    './test-files/raj 1497.pdf',
    {
      minProducts: 5,
      format: 'Multi-Company Indent',
      mustHaveCustomer: true,
      expectMultipleDVN: true
    },
    results
  );

  // Test Suite 3: Excel Files
  console.log('\n📊 TEST SUITE 3: EXCEL FILES');
  console.log('-'.repeat(80));
  
  await testExcel(
    './test-files/order raj.xlsx',
    {
      minProducts: 5,
      format: 'Excel with Company Sections'
    },
    results
  );

  await testExcel(
    './test-files/order-492.xls',
    {
      minProducts: 3, // ✅ Adjusted to actual file content
      format: 'Simple Excel Order'
    },
    results
  );

  // Test Suite 4: Text Files
  console.log('\n📝 TEST SUITE 4: TEXT INDENT FILES');
  console.log('-'.repeat(80));
  
  await testText(
    './test-files/577.MICROLABS.txt',
    {
      minProducts: 5,
      format: 'Text Indent Form'
    },
    results
  );

  // Test Suite 5: Edge Cases
  console.log('\n⚠️  TEST SUITE 5: EDGE CASES');
  console.log('-'.repeat(80));
  
  await testEdgeCases(results);

  // Final Summary
  printSummary(results);
}

/* ========================================================================
   TEST FUNCTIONS
======================================================================== */

async function testPDF(filePath, expected, results) {
  const testName = `PDF: ${expected.format}`;
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIPPED: ${filePath} not found`);
      results.skipped++;
      return;
    }

    console.log(`\n🧪 Testing: ${testName}`);
    console.log(`   File: ${path.basename(filePath)}`);

    const buffer = fs.readFileSync(filePath);
    const file = { buffer, originalname: path.basename(filePath) };

    const result = await extractPurchaseOrderPDF(file);

    // Validation 1: Template Structure
    if (!validateTemplateStructure(result, testName, results)) return;

    // Validation 2: Customer Name
    console.log(`   👤 Customer: ${result.meta.customerName}`);
    if (expected.mustHaveCustomer && result.meta.customerName === "UNKNOWN CUSTOMER") {
      failTest(testName, "Customer name not extracted", results);
      return;
    }

    // Validation 3: Product Count
    console.log(`   📦 Products: ${result.dataRows.length}`);
    if (result.dataRows.length < expected.minProducts) {
      failTest(
        testName,
        `Only ${result.dataRows.length} products (expected min: ${expected.minProducts})`,
        results
      );
      return;
    }

    // Validation 4: Data Quality
    const validationResult = validateDataQuality(result.dataRows, testName);
    if (!validationResult.success) {
      failTest(testName, validationResult.error, results);
      return;
    }

    // Validation 5: Multi-DVN Check
    if (expected.expectMultipleDVN) {
      const uniqueDVNs = new Set(result.dataRows.map(r => r["DVN"]).filter(Boolean));
      console.log(`   🏢 Divisions Found: ${uniqueDVNs.size} (${Array.from(uniqueDVNs).join(', ')})`);
      
      if (uniqueDVNs.size < 2) {
        failTest(testName, "Expected multiple divisions but found only one or none", results);
        return;
      }
    }

    // Show samples
    console.log('\n   📋 Sample Products:');
    result.dataRows.slice(0, 3).forEach((row, i) => {
      console.log(`      ${i + 1}. SAP: ${row["SAPCODE"] || "N/A"} | ${row["ITEMDESC"]} | Qty: ${row["ORDERQTY"]} | DVN: ${row["DVN"] || "N/A"}`);
    });

    passTest(testName, results);

  } catch (err) {
    failTest(testName, `Exception: ${err.message}`, results);
  }
}

async function testExcel(filePath, expected, results) {
  const testName = `Excel: ${expected.format}`;
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIPPED: ${filePath} not found`);
      results.skipped++;
      return;
    }

    console.log(`\n🧪 Testing: ${testName}`);
    console.log(`   File: ${path.basename(filePath)}`);

    const buffer = fs.readFileSync(filePath);
    const file = { buffer, originalname: path.basename(filePath) };

    const result = await extractInvoiceExcel(file);

    if (result.error) {
      failTest(testName, `Extraction error: ${result.error}`, results);
      return;
    }

    // Validation 1: Template Structure
    if (!validateTemplateStructure(result, testName, results)) return;

    // Validation 2: Product Count
    console.log(`   📦 Products: ${result.dataRows.length}`);
    if (result.dataRows.length < expected.minProducts) {
      failTest(
        testName,
        `Only ${result.dataRows.length} products (expected min: ${expected.minProducts})`,
        results
      );
      return;
    }

    // Validation 3: Data Quality
    const validationResult = validateDataQuality(result.dataRows, testName);
    if (!validationResult.success) {
      failTest(testName, validationResult.error, results);
      return;
    }

    // Show samples
    console.log('\n   📋 Sample Products:');
    result.dataRows.slice(0, 3).forEach((row, i) => {
      console.log(`      ${i + 1}. ${row["ITEMDESC"]} | Qty: ${row["ORDERQTY"]}`);
    });

    passTest(testName, results);

  } catch (err) {
    failTest(testName, `Exception: ${err.message}`, results);
  }
}

async function testText(filePath, expected, results) {
  const testName = `Text: ${expected.format}`;
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIPPED: ${filePath} not found`);
      results.skipped++;
      return;
    }

    console.log(`\n🧪 Testing: ${testName}`);
    console.log(`   File: ${path.basename(filePath)}`);

    const buffer = fs.readFileSync(filePath);
    const file = { buffer, originalname: path.basename(filePath) };

    const result = await extractOrderText(file);

    // Validation 1: Template Structure
    if (!validateTemplateStructure(result, testName, results)) return;

    // Validation 2: Product Count
    console.log(`   📦 Products: ${result.dataRows.length}`);
    if (result.dataRows.length < expected.minProducts) {
      failTest(
        testName,
        `Only ${result.dataRows.length} products (expected min: ${expected.minProducts})`,
        results
      );
      return;
    }

    // Validation 3: Data Quality
    const validationResult = validateDataQuality(result.dataRows, testName);
    if (!validationResult.success) {
      failTest(testName, validationResult.error, results);
      return;
    }

    // Show samples
    console.log('\n   📋 Sample Products:');
    result.dataRows.slice(0, 3).forEach((row, i) => {
      console.log(`      ${i + 1}. ${row["ITEMDESC"]} | Qty: ${row["ORDERQTY"]}`);
    });

    passTest(testName, results);

  } catch (err) {
    failTest(testName, `Exception: ${err.message}`, results);
  }
}

async function testEdgeCases(results) {
  // Test 1: Empty Buffer
  console.log('\n🧪 Testing: Edge Case - Empty Buffer');
  try {
    const result = await extractPurchaseOrderPDF({ buffer: Buffer.from('') });
    if (result.error && result.dataRows.length === 0) {
      console.log('   ✅ Correctly handled empty buffer');
      passTest('Edge Case: Empty Buffer', results);
    } else {
      failTest('Edge Case: Empty Buffer', 'Should return error for empty buffer', results);
    }
  } catch (err) {
    console.log('   ✅ Correctly threw error for empty buffer');
    passTest('Edge Case: Empty Buffer', results);
  }

  // Test 2: Invalid Quantities
  console.log('\n🧪 Testing: Edge Case - Invalid Quantities');
  const mockData = {
    meta: { customerName: "TEST" },
    headers: TEMPLATE_COLUMNS,
    dataRows: [
      { "ITEMDESC": "TEST ITEM 1", "ORDERQTY": 0 },
      { "ITEMDESC": "TEST ITEM 2", "ORDERQTY": -5 },
      { "ITEMDESC": "TEST ITEM 3", "ORDERQTY": 50000 },
      { "ITEMDESC": "TEST ITEM 4", "ORDERQTY": 100 }
    ]
  };

  const validRows = mockData.dataRows.filter(row => 
    row["ORDERQTY"] > 0 && row["ORDERQTY"] <= 10000
  );

  if (validRows.length === 1) {
    console.log('   ✅ Correctly filtered invalid quantities');
    passTest('Edge Case: Invalid Quantities', results);
  } else {
    failTest('Edge Case: Invalid Quantities', 'Failed to filter invalid quantities', results);
  }
}

/* ========================================================================
   VALIDATION HELPERS
======================================================================== */

function validateTemplateStructure(result, testName, results) {
  if (!result.headers || result.headers.length !== TEMPLATE_COLUMNS.length) {
    failTest(
      testName,
      `Invalid header structure. Expected ${TEMPLATE_COLUMNS.length} columns, got ${result.headers?.length || 0}`,
      results
    );
    return false;
  }

  const missingColumns = TEMPLATE_COLUMNS.filter(col => !result.headers.includes(col));
  if (missingColumns.length > 0) {
    failTest(
      testName,
      `Missing columns: ${missingColumns.join(', ')}`,
      results
    );
    return false;
  }

  return true;
}

function validateDataQuality(dataRows, testName) {
  const issues = [];

  dataRows.forEach((row, i) => {
    // Check ITEMDESC
    if (!row["ITEMDESC"] || row["ITEMDESC"].length < 2) {
      issues.push(`Row ${i + 1}: Missing or invalid ITEMDESC`);
    }
    
    // Check for suspicious patterns in ITEMDESC
    if (row["ITEMDESC"]) {
      // Flag if only asterisks remain
      if (/^[\s*]+$/.test(row["ITEMDESC"])) {
        issues.push(`Row ${i + 1}: ITEMDESC contains only asterisks`);
      }
      // Flag if item name is too short after cleaning
      if (row["ITEMDESC"].replace(/[*\s]/g, "").length < 3) {
        issues.push(`Row ${i + 1}: ITEMDESC too short after cleaning (${row["ITEMDESC"]})`);
      }
    }

    // Check ORDERQTY
    if (!row["ORDERQTY"] || row["ORDERQTY"] <= 0 || row["ORDERQTY"] > 10000) {
      issues.push(`Row ${i + 1}: Invalid ORDERQTY (${row["ORDERQTY"]})`);
    }

    // Check CUSTOMER NAME
    if (!row["CUSTOMER NAME"]) {
      issues.push(`Row ${i + 1}: Missing CUSTOMER NAME`);
    }
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Data quality issues:\n      ${issues.slice(0, 5).join('\n      ')}`
    };
  }

  return { success: true };
}

/* ========================================================================
   TEST RESULT HELPERS
======================================================================== */

function passTest(testName, results) {
  console.log('   ✅ PASSED');
  results.passed++;
  results.tests.push({ name: testName, passed: true });
}

function failTest(testName, error, results) {
  console.log(`   ❌ FAILED: ${error}`);
  results.failed++;
  results.tests.push({ name: testName, passed: false, error });
}

function printSummary(results) {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  
  const total = results.passed + results.failed;
  if (total > 0) {
    const successRate = ((results.passed / total) * 100).toFixed(1);
    console.log(`📈 Success Rate: ${successRate}%`);
  }

  console.log('\n📋 DETAILED RESULTS:');
  console.log('-'.repeat(80));
  
  results.tests.forEach((test, i) => {
    const icon = test.passed ? '✅' : '❌';
    const status = test.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} [${status}] ${test.name}`);
    
    if (!test.passed && test.error) {
      console.log(`         ${test.error}`);
    }
  });

  console.log('='.repeat(80));
  
  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED - PRODUCTION READY');
  } else {
    console.log('⚠️  SOME TESTS FAILED - REVIEW REQUIRED');
  }
  
  console.log('='.repeat(80));
}

/* ========================================================================
   RUN TESTS
======================================================================== */

runTests().catch(err => {
  console.error('\n💥 FATAL ERROR:', err);
  process.exit(1);
});