/**
 * FIX MALFORMED COMBINATION STRENGTH PRODUCTS
 * 
 * Problem: Some products have malformed combination strengths like:
 * - "VILDAPRIDE M /500MG 50MG" → Should be "VILDAPRIDE M 50/500"
 * - "PRODUCT /100MG 50MG" → Should be "PRODUCT 50/100"
 * 
 * This script:
 * 1. Finds all products with malformed combo strengths
 * 2. Fixes the format to proper "NUM/NUM" format
 * 3. Updates the database
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductMaster from '../models/productMaster.js';
import { splitProduct } from '../utils/splitProducts.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/order_convert_db');

async function fixMalformedComboStrengths() {
  try {
    console.log('🔍 Searching for malformed combination strength products...\n');

    // Find all products
    const products = await ProductMaster.find({}).lean();
    console.log(`📦 Total products: ${products.length}`);

    const malformed = [];
    const fixes = [];

    // Pattern to detect malformed combo strengths: /500MG 50MG or similar
    const malformedPattern = /\/(\d+(?:\.\d+)?)\s*MG\s+(\d+(?:\.\d+)?)\s*MG?/i;
    
    // Another pattern: Leading slash with no number before it
    const leadingSlashPattern = /\s\/(\d+)/;

    for (const product of products) {
      const name = product.productName || '';
      
      // Check for malformed patterns
      if (malformedPattern.test(name) || leadingSlashPattern.test(name)) {
        malformed.push(product);
        
        // Try to fix it
        let fixed = name;
        
        // Fix pattern 1: /500MG 50MG → 50/500
        const match1 = name.match(/^(.+?)\s*\/(\d+(?:\.\d+)?)\s*MG\s+(\d+(?:\.\d+)?)\s*MG?$/i);
        if (match1) {
          const baseName = match1[1].trim();
          const num1 = match1[2];
          const num2 = match1[3];
          fixed = `${baseName} ${num2}/${num1}`; // Swap to correct order
        }
        
        // Fix pattern 2: NAME /500 50 → NAME 50/500
        const match2 = name.match(/^(.+?)\s*\/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
        if (match2) {
          const baseName = match2[1].trim();
          const num1 = match2[2];
          const num2 = match2[3];
          fixed = `${baseName} ${num2}/${num1}`;
        }
        
        if (fixed !== name) {
          // Re-split to get proper structure
          const { name: baseName, strength, variant } = splitProduct(fixed);
          const properName = [baseName, strength, variant].filter(Boolean).join(' ');
          
          fixes.push({
            productCode: product.productCode,
            old: name,
            new: properName,
            baseName,
            strength,
            variant
          });
        }
      }
    }

    console.log(`\n❌ Found ${malformed.length} malformed products\n`);

    if (malformed.length > 0) {
      console.log('📋 Malformed products:');
      malformed.forEach((p, i) => {
        console.log(`${i + 1}. ${p.productCode}: "${p.productName}"`);
      });
    }

    if (fixes.length === 0) {
      console.log('\n✅ No fixes needed! All products are correctly formatted.\n');
      process.exit(0);
    }

    console.log(`\n\n🔧 Proposed fixes (${fixes.length}):\n`);
    fixes.forEach((fix, i) => {
      console.log(`${i + 1}. ${fix.productCode}`);
      console.log(`   OLD: "${fix.old}"`);
      console.log(`   NEW: "${fix.new}"`);
      console.log(`   → Base: "${fix.baseName}", Strength: "${fix.strength}", Variant: "${fix.variant || 'none'}"\n`);
    });

    console.log('\n⚠️  READY TO UPDATE DATABASE ⚠️\n');
    console.log('This will update the following products in your database.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🚀 Applying fixes...\n');

    // Apply fixes
    for (const fix of fixes) {
      await ProductMaster.updateOne(
        { productCode: fix.productCode },
        {
          $set: {
            productName: fix.new,
            baseName: fix.baseName,
            dosage: fix.strength || null,
            variant: fix.variant || null,
            cleanedProductName: fix.new
          }
        }
      );
      console.log(`✅ Updated: ${fix.productCode}`);
    }

    console.log(`\n✅ Successfully updated ${fixes.length} products!\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the script
fixMalformedComboStrengths();
