
import { unifiedExtract } from "../services/unifiedParser.js";
import fs from "fs";
import path from "path";

// Copy of the logic from orderController.js
const MIN_PRODUCT_LENGTH = 3;
function isJunkLine(text = "") {
  const upper = text.toUpperCase();
  // Using the UPDATED regex logic
  return (
    upper.length < MIN_PRODUCT_LENGTH ||
    /^(APPROX|PRINTED|SUPPLIER|GSTIN|DL NO|PAGE)/i.test(upper) ||
    /^MICRO\s+(LABS|DIVISION|HEALTHCARE)/i.test(upper) 
  );
}

const testFile = path.resolve("test-files/SRI SABARI AGENCIES_Order_311.xls");

async function runTest() {
  console.log(`Checking file: ${testFile}`);
  
  if (!fs.existsSync(testFile)) {
    console.error("File not found!");
    return;
  }
  
  const fileBuffer = fs.readFileSync(testFile);
  
  // Mock multer file object
  const mockFile = {
    buffer: fileBuffer,
    originalname: "SRI SABARI AGENCIES_Order_311.xls",
    mimetype: "application/vnd.ms-excel"
  };

  try {
    const result = await unifiedExtract(mockFile);
    
    console.log(`\nExtracted ${result.dataRows.length} rows.`);
    
    // Find the MICRO row
    const microRow = result.dataRows.find(r => r.ITEMDESC.toUpperCase().includes("MICRO"));
    
    if (microRow) {
        console.log("\n✅ Found 'MICRO' row in parser output:");
        console.log(microRow);
        
        // Test filtering logic
        const isJunk = isJunkLine(microRow.ITEMDESC);
        console.log(`\n🛡️ Safety Filter Test:`);
        console.log(`   Item: "${microRow.ITEMDESC}"`);
        console.log(`   isJunkLine? ${isJunk ? "❌ BLOCKED" : "✅ PASSED"}`);
        
        if (!isJunk && result.dataRows.length > 0) {
             console.log("\n✅ SUCCESS: Row extracted and passed filter.");
        } else {
             console.log("\n❌ FAILURE: Row extracted but BLOCKED by filter.");
        }
    } else {
        console.log("\n❌ FAILURE: 'MICRO' row NOT found in parser output.");
        console.log("Dumping all extracted descriptions:");
        result.dataRows.forEach((r, i) => console.log(`  ${i+1}: ${r.ITEMDESC}`));
    }

  } catch (error) {
    console.error("Extraction failed:", error);
  }
}

runTest();
