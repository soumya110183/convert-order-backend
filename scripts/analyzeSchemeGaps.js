import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import XLSX from "xlsx-js-style";
import ProductMaster from "../models/productMaster.js";
import SchemeMaster from "../models/schemeMaster.js";

dotenv.config();

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function similarity(a, b) {
    const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
    const maxLen = Math.max(a.length, b.length);
    return ((maxLen - distance) / maxLen) * 100;
}

function normalizeName(name) {
    return name
        .toUpperCase()
        .replace(/CAPSULES?/gi, "CAP")
        .replace(/TABLETS?/gi, "TAB")
        .replace(/INJECTION?S?/gi, "INJ")
        .replace(/SYRUP?S?/gi, "SYP")
        .replace(/\s+/g, " ")
        .trim();
}

function splitProduct(name) {
    // Simple extraction - just get base name by removing numbers and common forms
    const baseName = name
        .replace(/\d+(\.\d+)?\s*(MG|ML|GM|KG|MCG|%)/gi, "")
        .replace(/(CAPSULE|TABLET|INJECTION|SYRUP|CAP|TAB|INJ|SYP)S?/gi, "")
        .trim();
    return { name: baseName };
}

async function analyzeGaps() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to database\n");

        // Read Excel file
        const buffer = fs.readFileSync("test-files/Database.xls");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const schemeSheet = wb.Sheets[wb.SheetNames.find(s => /scheme/i.test(s))];
        const rawData = XLSX.utils.sheet_to_json(schemeSheet, { header: 1, defval: null });

        // Get all products and schemes from DB
        const products = await ProductMaster.find().lean();
        const schemes = await SchemeMaster.find().lean();
        
        console.log(`📊 Database Stats:`);
        console.log(`  - Products: ${products.length}`);
        console.log(`  - Schemes: ${schemes.length}\n`);

        // Extract unique product names from Excel with proper division tracking
        const excelProducts = new Set();
        const blockDivisions = {}; // Track division per column block
        const BLOCK_SIZE = 4;
        
        for (let rIndex = 0; rIndex < rawData.length; rIndex++) {
            const row = rawData[rIndex];
            if (!row || row.length === 0) continue;
            
            const totalCols = row.length;
            
            // Check if this ROW contains division info
            for (let c = 0; c < totalCols; c++) {
                const cell = row[c] ? String(row[c]).trim() : "";
                if (/DIVISION\\s*:/i.test(cell)) {
                    const match = cell.match(/DIVISION\\s*:\\s*([A-Z0-9\\-\\s]+)/i);
                    if (match) {
                        const divName = match[1].trim().toUpperCase();
                        // Find which block this column belongs to
                        const blockStart = Math.floor(c / BLOCK_SIZE) * BLOCK_SIZE;
                        blockDivisions[blockStart] = divName;
                        console.log(`  📌 Found division: ${divName} at column ${c} (block ${blockStart})`);
                    }
                    break; // Division row, skip processing
                }
            }
            
            // Skip header-like rows
            const rowStr = row.map(c => c ? String(c).trim() : "").join(" ");
            if (/PRODUCT|MIN|QTY|SCHEME|FREE/i.test(rowStr) && rowStr.length < 100) continue;
            
            // Process 4-column blocks
            for (let i = 0; i < totalCols; i += BLOCK_SIZE) {
                const currentDivision = blockDivisions[i];
                if (!currentDivision) continue;
                
                const productName = row[i] ? String(row[i]).trim() : null;
                const minQty = row[i + 1] ? Number(row[i + 1]) : 0;
                
                if (!productName || productName.length < 3) continue;
                if (/^\\d+(\\.\\d+)?$/.test(productName)) continue; // Skip pure numbers
                if (/PRODUCT|MIN|QTY|SCHEME|DIVISION/i.test(productName)) continue;
                
                excelProducts.add(JSON.stringify({ name: productName, division: currentDivision }));
            }
        }
        
        // Convert Set back to array of objects
        const uniqueExcelProds = Array.from(excelProducts).map(str => JSON.parse(str));

        console.log(`📄 Excel contains ${uniqueExcelProds.length} unique scheme products\n`);

        // Find gaps
        const gaps = [];
        const matched = [];
        
        for (const excelProd of uniqueExcelProds) {
            const normalizedExcel = normalizeName(excelProd.name);
            const { name: baseName } = splitProduct(excelProd.name);
            
            // Try to find match in database
            let bestMatch = null;
            let bestScore = 0;
            
            for (const dbProd of products) {
                if (dbProd.division.toUpperCase() !== excelProd.division) continue;
                
                const normalizedDB = normalizeName(dbProd.productName);
                const score = similarity(normalizedExcel, normalizedDB);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = dbProd;
                }
            }
            
            // Check if product has scheme
            const hasScheme = schemes.some(s => 
                s.productCode === bestMatch?.productCode && 
                s.division.toUpperCase() === excelProd.division
            );
            
            if (bestScore >= 80 && hasScheme) {
                matched.push({
                    excel: excelProd.name,
                    db: bestMatch.productName,
                    score: bestScore.toFixed(1),
                    hasScheme: "✅"
                });
            } else if (bestScore >= 80 && !hasScheme) {
                gaps.push({
                    excel: excelProd.name,
                    division: excelProd.division,
                    db: bestMatch.productName,
                    dbCode: bestMatch.productCode,
                    score: bestScore.toFixed(1),
                    confidence: bestScore >= 95 ? "HIGH" : bestScore >= 85 ? "MEDIUM" : "LOW"
                });
            } else {
                gaps.push({
                    excel: excelProd.name,
                    division: excelProd.division,
                    db: "NOT FOUND",
                    dbCode: "N/A",
                    score: "0",
                    confidence: "MANUAL"
                });
            }
        }

        // Generate report
        console.log(`\\n📝 GAP ANALYSIS REPORT`);
        console.log(`${"=".repeat(100)}`);
        console.log(`✅ Matched (with schemes): ${matched.length}`);
        console.log(`❌ Missing Schemes: ${gaps.length}\\n`);
        
        // Group by confidence
        const high = gaps.filter(g => g.confidence === "HIGH");
        const medium = gaps.filter(g => g.confidence === "MEDIUM");
        const low = gaps.filter(g => g.confidence === "LOW");
        const manual = gaps.filter(g => g.confidence === "MANUAL");
        
        console.log(`🟢 HIGH Confidence (>=95%): ${high.length}`);
        console.log(`🟡 MEDIUM Confidence (85-94%): ${medium.length}`);
        console.log(`🟠 LOW Confidence (80-84%): ${low.length}`);
        console.log(`🔴 MANUAL Review Required: ${manual.length}\\n`);

        // Save detailed report
        const report = {
            summary: {
                totalExcelProducts: uniqueExcelProds.length,
                matched: matched.length,
                missingSchemes: gaps.length,
                highConfidence: high.length,
                mediumConfidence: medium.length,
                lowConfidence: low.length,
                manualReview: manual.length
            },
            gaps: gaps.sort((a, b) => b.score - a.score)
        };
        
        fs.writeFileSync("scheme_gap_report.json", JSON.stringify(report, null, 2));
        console.log(`💾 Detailed report saved to: scheme_gap_report.json\\n`);
        
        // Display top 10 gaps
        console.log(`Top 10 Missing Schemes:`);
        gaps.slice(0, 10).forEach((g, i) => {
            console.log(`${i + 1}. [${g.confidence}] ${g.excel} → ${g.db} (${g.score}%)`);
        });

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

analyzeGaps();
