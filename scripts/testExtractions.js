import fs from "fs";
import path from "path";
import { unifiedExtract } from "../services/unifiedParser.js";

const testFiles = [
    "577.MICROLABS.txt",           // Text file
    "raj 1497.pdf",                 // PDF file  
    "order raj.xlsx",               // Excel file
    "SRI SABARI AGENCIES_Order_311.xls"  // Old Excel
];

async function testExtractions() {
    console.log("🧪 Testing Extraction from All File Types\n");
    console.log("=".repeat(80));

    for (const filename of testFiles) {
        const filePath = path.join("test-files", filename);
        
        if (!fs.existsSync(filePath)) {
            console.log(`\n⚠️ File not found: ${filename}`);
            continue;
        }

        console.log(`\n📄 Testing: ${filename}`);
        console.log(`   Type: ${path.extname(filename).toUpperCase()}`);
        console.log("-".repeat(80));

        try {
            const buffer = fs.readFileSync(filePath);
            const mockFile = {
                buffer: buffer,
                originalname: filename,
                mimetype: getMimeType(filename),
                size: buffer.length
            };

            const result = await unifiedExtract(mockFile);

            if (result && result.dataRows && result.dataRows.length > 0) {
                console.log(`   ✅ SUCCESS - Extracted ${result.dataRows.length} rows`);
                console.log(`\n   Sample rows (first 3):`);
                result.dataRows.slice(0, 3).forEach((row, i) => {
                    const desc = row.DESCRIPTION || row.description || row.productName || "N/A";
                    const qty = row.ORDERQTY || row.QTY || row.qty || row.quantity || "N/A";
                    console.log(`   ${i + 1}. ${desc.substring(0, 50)}`);
                    console.log(`      Qty: ${qty}`);
                });
            } else {
                console.log(`   ❌ FAILED - No rows extracted`);
                if (result) {
                    console.log(`   Debug: ${JSON.stringify(result).substring(0, 200)}`);
                }
            }

        } catch (err) {
            console.log(`   ❌ ERROR - ${err.message}`);
            console.log(`   Stack: ${err.stack.split('\n')[0]}`);
        }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("\n✅ Extraction test complete\n");
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.txt': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

testExtractions().catch(err => {
    console.error("\n💥 Fatal error:", err);
    process.exit(1);
});
