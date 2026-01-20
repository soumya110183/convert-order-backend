import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { unifiedExtract } from '../services/unifiedParser.js';
import { matchProductsBatch } from '../services/productMatcher.js';
import ProductMaster from '../models/productMaster.js';

dotenv.config();

const TEST_DIR = path.join(process.cwd(), 'test-files');

async function runTests() {
  console.log('🚀 STARTING COMPREHENSIVE TESTS...');
  
  // Connect to DB for matching
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Load all products for matching
  const allProducts = await ProductMaster.find({}).lean();
  console.log(`📦 Loaded ${allProducts.length} products from Master DB`);

  const files = fs.readdirSync(TEST_DIR);
  const results = [];

  for (const file of files) {
    if (file.startsWith('.')) continue; // skip hidden

    console.log(`\n---------------------------------------------------`);
    console.log(`📂 Processing: ${file}`);
    console.log(`---------------------------------------------------`);

    try {
      const filePath = path.join(TEST_DIR, file);
      const fileBuffer = fs.readFileSync(filePath);
      
      const fileObj = {
        buffer: fileBuffer,
        originalname: file,
        size: fileBuffer.length
      };

      // 1. EXTRACTION
      const extraction = await unifiedExtract(fileObj);
      const extractedCount = extraction.dataRows.length;
      
      if (extractedCount === 0) {
        console.error(`❌ EXTRACTION FAILED: 0 rows found`);
        results.push({ file, status: 'EXTRACTION_FAILED', extracted: 0 });
        continue;
      }

      console.log(`✅ Extracted: ${extractedCount} rows`);

      // 2. MATCHING
      const matchResult = matchProductsBatch(extraction.dataRows, allProducts);
      const matchedCount = matchResult.results.length;
      const failedCount = matchResult.failed.length;
      
      console.log(`✅ Matched: ${matchedCount} | ❌ Unmatched: ${failedCount}`);

      // Log specific failures for analysis
      if (failedCount > 0) {
        console.log(`\n⚠️  UNMATCHED SAMPLES:`);
        matchResult.failed.slice(0, 5).forEach(f => {
          console.log(`   - "${f.ITEMDESC}": ${f.reason || 'Low confidence'}`);
        });
      }

      results.push({
        file,
        status: 'SUCCESS',
        extracted: extractedCount,
        matched: matchedCount,
        failed: failedCount,
        successRate: ((matchedCount / extractedCount) * 100).toFixed(1) + '%'
      });

    } catch (err) {
      console.error(`❌ CRITICAL ERROR on ${file}:`, err.message);
      results.push({ file, status: 'ERROR', error: err.message });
    }
  }

  console.log(`\n\n===================================================`);
  console.log(`📊 FINAL REPORT`);
  console.log(`===================================================`);
  console.table(results);
  
  process.exit(0);
}

runTests();
