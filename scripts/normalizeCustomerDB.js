import mongoose from "mongoose";
import dotenv from "dotenv";
import CustomerMaster from "../models/customerMaster.js";

dotenv.config();

/**
 * Normalize customer name for database storage
 * Ensures consistent formatting while keeping readable format
 */
function normalizeCustomerForDB(name) {
    if (!name) return name;
    
    let normalized = name.trim();
    
    // Step 1: Fix spacing around dots (D.T.Associates → D.T. Associates)
    normalized = normalized.replace(/\.([A-Z])/g, '. $1');
    
    // Step 2: Fix spacing around commas
    normalized = normalized.replace(/,([^\s])/g, ', $1');
    
    // Step 3: Remove duplicate spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Step 4: Apply title case (but keep abbreviations uppercase)
    normalized = normalized
        .split(' ')
        .map(word => {
            // Keep dots (abbreviations like S.R.I.)
            if (word.includes('.')) return word.toUpperCase();
            
            // Keep short words uppercase (M, S, etc.)
            if (word.length <= 2 && word === word.toUpperCase()) {
                return word;
            }
            
            // Keep known acronyms uppercase
            const acronyms = ['EKM', 'PKD', 'TVM', 'KKD', 'PVT', 'LTD', 'LLC', 'LLP'];
            if (acronyms.includes(word.toUpperCase())) {
                return word.toUpperCase();
            }
            
            // Title case everything else
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
    
    // Step 5: Clean up trailing/leading punctuation
    normalized = normalized.replace(/[,.\s]+$/, '');
    normalized = normalized.trim();
    
    return normalized;
}

async function normalizeAllCustomers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to database\n");
        
        const customers = await CustomerMaster.find().lean();
        console.log(`📊 Found ${customers.length} customers to normalize\n`);
        
        const updates = [];
        const changes = [];
        
        for (const customer of customers) {
            const original = customer.customerName;
            const normalized = normalizeCustomerForDB(original);
            
            if (original !== normalized) {
                updates.push({
                    updateOne: {
                        filter: { _id: customer._id },
                        update: { $set: { customerName: normalized } }
                    }
                });
                
                changes.push({
                    code: customer.customerCode,
                    before: original,
                    after: normalized
                });
            }
        }
        
        if (updates.length === 0) {
            console.log("✅ All customer names are already normalized!\n");
            process.exit(0);
        }
        
        console.log(`📝 Changes to be made (${updates.length} customers):\n`);
        changes.forEach((change, i) => {
            console.log(`${i + 1}. [${change.code}]`);
            console.log(`   Before: "${change.before}"`);
            console.log(`   After:  "${change.after}"`);
            console.log();
        });
        
        // Confirm before applying
        console.log("=".repeat(70));
        console.log("\n⚠️  This will update customer names in the database.");
        console.log("   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n");
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Apply updates
        const result = await CustomerMaster.bulkWrite(updates);
        
        console.log("\n✅ Normalization complete!");
        console.log(`   Modified: ${result.modifiedCount} customers`);
        console.log(`   Matched: ${result.matchedCount} customers\n`);
        
        // Show examples
        console.log("📋 Example normalizations:");
        console.log("   • D T ASSOCIATES → D.T. Associates");
        console.log("   • S.R.I.SABARI → S.R.I. Sabari");
        console.log("   • raj distributors,ekm → Raj Distributors, EKM");
        console.log("   • THE MEDICAL STORES&CO → The Medical Stores & Co\n");
        
        process.exit(0);
        
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

// Test function
function testNormalization() {
    const testCases = [
        "D T ASSOCIATES",
        "D.T.Associates",
        "S.R.I.SABARI AGENCIES",
        "raj distributors,ekm",
        "THE MEDICAL STORES&CO.",
        "K.K.M PHARMA",
        "M/S BLUE CROSS PHARMACY"
    ];
    
    console.log("\n🧪 Testing normalization:\n");
    testCases.forEach(test => {
        const result = normalizeCustomerForDB(test);
        console.log(`Input:  "${test}"`);
        console.log(`Output: "${result}"`);
        console.log();
    });
}

// Uncomment to test first:
// testNormalization();

// Run normalization:
normalizeAllCustomers();
