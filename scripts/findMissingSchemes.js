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
  return div.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

async function findMissingSchemes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to database\n");

        // Read Excel
        const buffer = fs.readFileSync("test-files/Database.xls");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const schemeSheetName = wb.SheetNames.find(s => /scheme/i.test(s));
        const schemeRowsRaw = readExcelMatrix(buffer, schemeSheetName);

        // Get all products and schemes from database
        const allProducts = await ProductMaster.find().lean();
        const allSchemes = await SchemeMaster.find().lean();

        console.log(`📊 Database:`);
        console.log(`  - Products: ${allProducts.length}`);
        console.log(`  - Schemes: ${allSchemes.length}\n`);

        // Parse Excel schemes
        const excelSchemes = [];
        const blockDivisions = {};
        const BLOCK_SIZE = 4;

        for (let rIndex = 0; rIndex < schemeRowsRaw.length; rIndex++) {
            const row = schemeRowsRaw[rIndex];
            if (!row || row.length === 0) continue;

            const totalCols = row.length;

            // Track division per column block
            for (let c = 0; c < totalCols; c++) {
                const cell = row[c] ? String(row[c]).trim() : "";
                if (/DIVISION\s*:/i.test(cell)) {
                    const match = cell.match(/DIVISION\s*:\s*([A-Z0-9\-\s]+)/i);
                    if (match) {
                        const divName = match[1].trim().toUpperCase();
                        const blockStart = Math.floor(c / BLOCK_SIZE) * BLOCK_SIZE;
                        blockDivisions[blockStart] = divName;
                    }
                    break;
                }
            }

            // Process 4-column blocks
            for (let i = 0; i < totalCols; i += BLOCK_SIZE) {
                const currentDivision = blockDivisions[i];
                if (!currentDivision) continue;

                const productName = row[i] ? String(row[i]).trim() : null;
                const minQty = row[i + 1] ? Number(row[i + 1]) : 0;
                const freeQty = row[i + 2] ? Number(row[i + 2]) : 0;
                const pct = row[i + 3] ? String(row[i + 3]).replace("%", "").trim() : "";
                let schemePercent = Number(pct) / 100;

                if (!productName || productName.length < 3) continue;
                if (/^\d+(\.\d+)?$/.test(productName)) continue; // Skip pure numbers
                if (/PRODUCT|MIN|QTY|SCHEME|DIVISION/i.test(productName)) continue;
                if (minQty === 0 && freeQty === 0 && schemePercent === 0) continue;

                // Find matching product in database
                const matchedProduct = allProducts.find(p => {
                    const nameMatch = p.productName.toUpperCase().includes(productName.toUpperCase()) ||
                                     productName.toUpperCase().includes(p.productName.toUpperCase());
                    const divMatch = normalizeDivision(p.division) === normalizeDivision(currentDivision);
                    return nameMatch && divMatch;
                });

                excelSchemes.push({
                    excelName: productName,
                    division: currentDivision,
                    minQty,
                    freeQty,
                    schemePercent,
                    matchedProduct: matchedProduct ? matchedProduct.productName : null,
                    matchedCode: matchedProduct ? matchedProduct.productCode : null
                });
            }
        }

        console.log(`📄 Excel contains ${excelSchemes.length} scheme entries\n`);

        // Group by product
        const schemesByProduct = {};
        for (const scheme of excelSchemes) {
            const key = `${scheme.excelName}|${scheme.division}`;
            if (!schemesByProduct[key]) {
                schemesByProduct[key] = {
                    excelName: scheme.excelName,
                    division: scheme.division,
                    matchedProduct: scheme.matchedProduct,
                    matchedCode: scheme.matchedCode,
                    slabs: []
                };
            }
            schemesByProduct[key].slabs.push({
                minQty: scheme.minQty,
                freeQty: scheme.freeQty,
                schemePercent: scheme.schemePercent
            });
        }

        // Check which ones are NOT in database
        const missing = [];
        const found = [];

        for (const [key, data] of Object.entries(schemesByProduct)) {
            if (!data.matchedCode) {
                missing.push({
                    ...data,
                    reason: "PRODUCT_NOT_FOUND"
                });
                continue;
            }

            // Check if scheme exists in database
            const dbScheme = allSchemes.find(s => 
                s.productCode === data.matchedCode &&
                normalizeDivision(s.division) === normalizeDivision(data.division)
            );

            if (!dbScheme) {
                missing.push({
                    ...data,
                    reason: "SCHEME_NOT_IN_DB"
                });
            } else {
                found.push(data);
            }
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`  ✅ Found in DB: ${found.length}`);
        console.log(`  ❌ Missing from DB: ${missing.length}\n`);

        if (missing.length > 0) {
            console.log(`\n❌ MISSING SCHEMES (${missing.length}):\n`);
            
            const productNotFound = missing.filter(m => m.reason === "PRODUCT_NOT_FOUND");
            const schemeNotInDb = missing.filter(m => m.reason === "SCHEME_NOT_IN_DB");

            if (productNotFound.length > 0) {
                console.log(`🔴 Product Not Found in Database (${productNotFound.length}):`);
                productNotFound.forEach((m, i) => {
                    console.log(`  ${i + 1}. ${m.excelName} (${m.division}) - ${m.slabs.length} slabs`);
                });
                console.log();
            }

            if (schemeNotInDb.length > 0) {
                console.log(`🟡 Product Exists But Scheme Missing (${schemeNotInDb.length}):`);
                schemeNotInDb.forEach((m, i) => {
                    console.log(`  ${i + 1}. ${m.excelName} → ${m.matchedProduct}`);
                    console.log(`      Division: ${m.division}, Code: ${m.matchedCode}`);
                    console.log(`      Slabs: ${m.slabs.length}`);
                    m.slabs.forEach(s => {
                        console.log(`        ${s.minQty}+${s.freeQty} (${s.schemePercent * 100}%)`);
                    });
                    console.log();
                });
            }
        }

        // Save detailed report
        fs.writeFileSync("missing_schemes_report.json", JSON.stringify({
            summary: {
                totalExcelSchemes: Object.keys(schemesByProduct).length,
                foundInDb: found.length,
                missingFromDb: missing.length,
                productNotFound: missing.filter(m => m.reason === "PRODUCT_NOT_FOUND").length,
                schemeNotInDb: missing.filter(m => m.reason === "SCHEME_NOT_IN_DB").length
            },
            missing: missing
        }, null, 2));

        console.log(`\n💾 Detailed report saved to: missing_schemes_report.json`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

findMissingSchemes();
