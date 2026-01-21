import fs from "fs";
import path from "path";
import { unifiedExtract } from "../services/unifiedParser.js";

async function quickTest() {
    console.log("\n🧪 EXTRACTION TEST - PDF, EXCEL, TEXT\n");
    console.log("=".repeat(70) + "\n");

    const testFiles = [
        { name: "577.MICROLABS.txt", type: "TEXT" },
        { name: "raj 1497.pdf", type: "PDF" },
        { name: "order raj.xlsx", type: "EXCEL" },
        { name: "SRI SABARI AGENCIES_Order_311.xls", type: "EXCEL (OLD)" }
    ];

    const results = [];

    for (const file of testFiles) {
        const filePath = path.join("test-files", file.name);
        
        if (!fs.existsSync(filePath)) {
            console.log(`❌ NOT FOUND: ${file.name}\n`);
            continue;
        }

        try {
            console.log(`Testing: ${file.name} (${file.type})`);
            
            const buffer = fs.readFileSync(filePath);
            const mockFile = {
                buffer: buffer,
                originalname: file.name,
                mimetype: getMimeType(file.name),
                size: buffer.length
            };

            // Suppress verbose logs temporarily
            const originalLog = console.log;
            console.log = () => {};

            const result = await unifiedExtract(mockFile);

            console.log = originalLog;

            if (result && result.dataRows && result.dataRows.length > 0) {
                console.log(`✅ SUCCESS - ${result.dataRows.length} rows extracted`);
                
                // Show first 2 samples
                console.log(`   Samples:`);
                result.dataRows.slice(0, 2).forEach((row, i) => {
                    const desc = (row.ITEMDESC || row.DESCRIPTION || row.description || "N/A").substring(0, 40);
                    const qty = row.ORDERQTY || row.QTY || row.qty || "N/A";
                    console.log(`   ${i + 1}. ${desc}`);
                    console.log(`      Qty: ${qty}`);
                });
                
                results.push({
                    file: file.name,
                    type: file.type,
                    status: "SUCCESS",
                    rows: result.dataRows.length
                });
            } else {
                console.log(`❌ FAILED - No rows extracted`);
                results.push({
                    file: file.name,
                    type: file.type,
                    status: "FAILED",
                    rows: 0
                });
            }

        } catch (err) {
            console.log(`❌ ERROR - ${err.message.substring(0, 100)}`);
            results.push({
                file: file.name,
                type: file.type,
                status: "ERROR",
                error: err.message.substring(0, 100)
            });
        }
        
        console.log();
    }

    console.log("=".repeat(70));
    console.log("\n📊 SUMMARY:\n");
    
    results.forEach(r => {
        const status = r.status === "SUCCESS" ? "✅" : "❌";
        console.log(`${status} ${r.type.padEnd(15)} ${r.file.padEnd(40)} ${r.rows ? `${r.rows} rows` : r.status}`);
    });
    
    const successCount = results.filter(r => r.status === "SUCCESS").length;
    console.log(`\n${successCount}/${results.length} files extracted successfully\n`);
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

quickTest().catch(err => {
    console.error("\n💥 Fatal:", err.message);
    process.exit(1);
});
