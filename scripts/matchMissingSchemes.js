import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import XLSX from "xlsx-js-style";
import ProductMaster from "../models/productMaster.js";
import SchemeMaster from "../models/schemeMaster.js";
import { readExcelMatrix } from "../utils/readExcels.js";

dotenv.config();

function normalizeDivision(div) {
  if (!div) return "";
  return div
    .toUpperCase()
    .replace(/\\s+/g, "")
    .replace(/-/g, "");
}

async function matchAndLinkSchemes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to database\\n");

        // Read gap report
        if (!fs.existsSync("scheme_gap_report.json")) {
            console.error("❌ Gap report not found. Run analyzeSchemeGaps.js first.");
            process.exit(1);
        }

        const report = JSON.parse(fs.readFileSync("scheme_gap_report.json", "utf8"));
        console.log(`📊 Gap Report Summary:`);
        console.log(`  - Total Missing Schemes: ${report.summary.missingSchemes}`);
        console.log(`  - High Confidence: ${report.summary.highConfidence}`);
        console.log(`  - Medium Confidence: ${report.summary.mediumConfidence}\\n`);

        // Read Excel to extract scheme slabs
        const buffer = fs.readFileSync("test-files/Database.xls");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const schemeSheetName = wb.SheetNames.find(s => /scheme/i.test(s));
        const schemeRowsRaw = readExcelMatrix(buffer, schemeSheetName);

        // Get all products for matching
        const allProducts = await ProductMaster.find().lean();
        console.log(`📦 Loaded ${allProducts.length} products from database\\n`);

        // Parse schemes from Excel
        const excelSchemes = new Map(); // Key: productName|division → slabs[]
        let currentDivision = "";
        const BLOCK_SIZE = 4;

        for (let rIndex = 0; rIndex < schemeRowsRaw.length; rIndex++) {
            const row = schemeRowsRaw[rIndex];
            if (!row || row.length === 0) continue;

            const rowStr = row.map(c => c ? String(c).trim() : "").join(" ");

            // Track division headers
            if (/DIVISION\\s*:/i.test(rowStr)) {
                const match = rowStr.match(/DIVISION\\s*:\\s*([A-Z0-9\\-\\s]+)/i);
                if (match) {
                    currentDivision = match[1].trim().toUpperCase();
                }
                continue;
            }

            // Process 4-column blocks
            for (let i = 0; i < row.length; i += BLOCK_SIZE) {
                if (!currentDivision) continue;

                const productName = row[i] ? String(row[i]).trim() : null;
                const minQty = row[i + 1] ? Number(row[i + 1]) : 0;
                const freeQty = row[i + 2] ? Number(row[i + 2]) : 0;
                const pct = row[i + 3] ? String(row[i + 3]).replace("%", "").trim() : "";
                let schemePercent = Number(pct) / 100;

                if (!productName || productName.length < 3) continue;
                if (minQty === 0 && freeQty === 0 && schemePercent === 0) continue;
                if (/PRODUCT|MIN|QTY|SCHEME|DIVISION/i.test(productName)) continue;

                const key = `${productName}|${currentDivision}`;
                if (!excelSchemes.has(key)) {
                    excelSchemes.set(key, []);
                }

                excelSchemes.get(key).push({
                    minQty: Number(minQty) || 0,
                    freeQty: Number(freeQty) || 0,
                    schemePercent: Number(schemePercent.toFixed(4)) || 0
                });
            }
        }

        console.log(`📄 Extracted ${excelSchemes.size} unique scheme products from Excel\\n`);

        // Process high-confidence matches
        const highConfidence = report.gaps.filter(g => g.confidence === "HIGH");
        let applied = 0;
        let skipped = 0;

        console.log(`🚀 Applying ${highConfidence.length} HIGH confidence matches...\\n`);

        for (const gap of highConfidence) {
            const key = `${gap.excel}|${gap.division}`;
            const slabs = excelSchemes.get(key);

            if (!slabs || slabs.length === 0) {
                console.log(`  ⚠️ Skipped ${gap.excel} - no slabs found`);
                skipped++;
                continue;
            }

            // Find the matched product
            const product = allProducts.find(p => 
                p.productCode === gap.dbCode || 
                p.productName === gap.db
            );

            if (!product) {
                console.log(`  ⚠️ Skipped ${gap.excel} - product not found in DB`);
                skipped++;
                continue;
            }

            // Check if scheme already exists
            const existing = await SchemeMaster.findOne({
                productCode: product.productCode,
                division: normalizeDivision(gap.division)
            });

            if (existing) {
                console.log(`  ℹ️ Skipped ${gap.excel} - scheme already exists`);
                skipped++;
                continue;
            }

            // Create scheme
            await SchemeMaster.create({
                productCode: product.productCode,
                productName: product.productName,
                division: normalizeDivision(gap.division),
                slabs: slabs,
                isActive: true
            });

            console.log(`  ✅ Linked ${gap.excel} → ${product.productName} (${slabs.length} slabs)`);
            applied++;
        }

        console.log(`\\n✅ Matching Complete:`);
        console.log(`  - Applied: ${applied}`);
        console.log(`  - Skipped: ${skipped}`);
        console.log(`  - Medium/Low confidence: ${report.summary.mediumConfidence + report.summary.lowConfidence} (review manually)`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

matchAndLinkSchemes();
