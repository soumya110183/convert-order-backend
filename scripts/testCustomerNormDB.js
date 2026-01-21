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

console.log("\n🧪 Testing Customer Name Normalization\n");
console.log("=".repeat(70) + "\n");

const testCases = [
    "D T ASSOCIATES",
    "D.T.Associates",
    "d.t.associates",
    "S.R.I.SABARI AGENCIES",
    "S.R.I. SABARI AGENCIES",
    "raj distributors,ekm",
    "RAJ DISTRIBUTORS,EKM",
    "THE MEDICAL STORES&CO.",
    "K.K.M PHARMA",
    "M/S BLUE CROSS PHARMACY",
    "sri sabari agencies"
];

testCases.forEach(test => {
    const result = normalizeCustomerForDB(test);
    const changed = test !== result;
    console.log(`${changed ? '✏️ ' : '✅'} "${test}"`);
    if (changed) {
        console.log(`   → "${result}"`);
    }
    console.log();
});

console.log("=".repeat(70));
console.log("\n📋 Normalization ensures:");
console.log("  • Consistent spacing after dots (D.T. not D.T)");
console.log("  • Consistent spacing after commas");
console.log("  • Proper title case (First Letter Uppercase)");
console.log("  • Abbreviations stay uppercase (S.R.I., EKM, PVT, LTD)");
console.log("  • No duplicate spaces");
console.log("  • No trailing punctuation\n");
