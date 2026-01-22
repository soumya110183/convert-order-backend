/* =====================================================
   MASTER DATABASE UPLOAD (SINGLE EXCEL, MULTI SHEET)
   - Inserts customers/products if missing
   - Updates existing records
===================================================== */
import mongoose from "mongoose";
import XLSX from "xlsx-js-style";

import CustomerMaster from "../../models/customerMaster.js";
import ProductMaster from "../../models/productMaster.js";
import MasterOrder from "../../models/masterOrder.js";
import { readExcelSheets, readExcelMatrix } from "../../utils/readExcels.js";
import SchemeMaster from "../../models/schemeMaster.js";
import { splitProduct } from "../../utils/splitProducts.js";


/* =====================================================
   UTILITIES
===================================================== */
function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDivisionAlias(div = "") {
  const d = normalizeDivision(div);
  if (d === "GTF1") return "GTF";
  if (d === "DTF1") return "DTF";
  return d;
}

function normalizeMedicalTerms(str = "") {
  return str
    .toUpperCase()
    .replace(/\bSYP\b/g, "SUSPENSION")
    .replace(/\bSUSP\b/g, "SUSPENSION")
    .replace(/\bINJ\b/g, "INJECTION")
    .replace(/\bTAB\b/g, "TABLET")
    .replace(/\bCAP\b/g, "CAPSULE");
}

const findSheet = (sheets, keywords) =>
  Object.entries(sheets).find(([name]) =>
    keywords.some(k => name.includes(k))
  )?.[1] || [];

function normalize(text = "") {
  return text
    .toUpperCase()
    .replace(/[-_/]/g, " ")     // treat hyphen as space
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeDivision(div = "") {
  return div
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}


function getSchemeRowValues(row, lastProductName = "") {
  const values = Object.values(row)
    .map(v => (v ?? "").toString().trim())
    .filter(Boolean);

  let productName = "";
  let minQty = 0;
  let freeQty = 0;
  let schemePercent = 0;

  for (const v of values) {
    if (
      !/^\d+(\.\d+)?%?$/.test(v) &&
      !/i\.e/i.test(v) &&
      !/SCHEME/i.test(v)
    ) {
      productName = v;
      break;
    }
  }

  if (!productName) {
    productName = lastProductName; // ✅ carry forward
  }

  for (const v of values) {
    if (/^\d+$/.test(v) && minQty === 0) {
      minQty = Number(v);
    } else if (/^\d+$/.test(v) && freeQty === 0) {
      freeQty = Number(v);
    } else if (/%/.test(v)) {
      schemePercent = Number(v.replace("%", "")) / 100;
    }
  }

  return { productName, minQty, freeQty, schemePercent };
}





/* =====================================================
   MASTER DATABASE UPLOAD
===================================================== */
export const uploadMasterDatabase = async (req, res) => {
  let session = null;
  // const session = await mongoose.startSession();
  // session.startTransaction();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE_UPLOADED" });
    }

    const sheets = readExcelSheets(req.file.buffer);

    const customerRows =
      Object.entries(sheets).find(([k]) =>
        k.toLowerCase().includes("customer")
      )?.[1] || [];

    const productRows =
      Object.entries(sheets).find(([k]) =>
        k.toLowerCase().includes("sap") || k.toLowerCase().includes("product")
      )?.[1] || [];

    let inserted = { customers: 0, products: 0 };
    let updated = { customers: 0, products: 0 };

    /* ================= CUSTOMERS ================= */
    const customerOps = customerRows.map(r => {
      const customerCode = (r["customer code"] || r["code"] || r["sap code"])?.toString().trim();
      const customerType = (r["customer type"] || r["type"])?.toString().trim();
      const customerName = (r["customer name"] || r["name"])?.toString().trim();
      const address1 = r["address 1"]?.toString().trim();
      const address2 = r["address 2"]?.toString().trim();
      const address3 = r["address 3"]?.toString().trim();
      const city = r["city"]?.toString().trim();
      const pinCode = r["pin code"]?.toString().trim();
      const state = r["state"]?.toString().trim();
      const contactPerson = r["contact person"]?.toString().trim();
      const phoneNo1 = r["phone no1"]?.toString().trim();
      const phoneNo2 = r["phone no2"]?.toString().trim();
      const mobileNo = r["mobile no"]?.toString().trim();
      const drugLicNo = r["drug lic no"]?.toString().trim();
      const drugLicFromDt = r["drug lic from dt"]?.toString().trim();
      const drugLicToDt = r["drug lic to dt"]?.toString().trim();
      const drugLicNo1 = r["drug lic no1"]?.toString().trim();
      const drugLicFromDt1 = r["drug lic from dt1"]?.toString().trim();
      const drugLicToDt1 = r["drug lic to dt1"]?.toString().trim();
      const gstNo = r["gst no"]?.toString().trim();
      const email = r["e mail"]?.toString().trim();

      if (!customerCode || !customerName) return null;

      return {
        updateOne: {
          filter: { customerCode },
          update: {
            $set: {
              customerType: customerType || "",
              customerName: customerName || "",
              address1,
              address2,
              address3,
              city,
              pinCode,
              state,
              contactPerson,
              phoneNo1,
              phoneNo2,
              mobileNo,
              drugLicNo,
              drugLicFromDt,
              drugLicToDt,
              drugLicNo1,
              drugLicFromDt1,
              drugLicToDt1,
              gstNo,
              email
            }
          },
          upsert: true
        }
      };
    }).filter(Boolean);

    if (customerOps.length > 0) {
      const result = await CustomerMaster.bulkWrite(customerOps);
      inserted.customers = result.upsertedCount || 0;
      updated.customers = result.modifiedCount || 0;
    }

    /* ================= PRODUCTS ================= */
    // In masterDataController.js - update product processing
// In uploadMasterDatabase function, update productOps:

/* =====================================================
   PRODUCT UPLOAD SECTION - FIXED TO IMPORT PACK VALUES
   Add this to your uploadMasterDatabase function
===================================================== */

const productOps = productRows
  .map(r => {
    // Database.xls headers: Sap Code, Item Desc, Qty, Box Pack, Pack, DVN
    const productCode = (r["Sap Code"] || r["sap code"] || r["SAP CODE"])?.toString().trim();
    const rawProductName = (r["Item Desc"] || r["item desc"] || r["ITEM DESC"])?.toString().trim();
    const division = (r["DVN"] || r["dvn"] || r["Dvn"])?.toString().trim();
    
    // ✅ EXTRACT PACK AND BOX PACK FROM EXCEL (Strict matching)
    const pack = Number(r["Pack"] || r["pack"] || r["PACK"] || 0);
    const boxPack = Number(r["Box Pack"] || r["box pack"] || r["BOX PACK"] || 0);

    if (!productCode || !rawProductName) return null;

    // ✅ CLEAN PRODUCT NAME (Remove TABS, CAPS, etc.)
    // User wants "Only product name and its strength"
    // e.g. "TORSINEX 10 TABS" -> "TORSINEX 10"
    // e.g. "MECONERV PLUS OD CAPS" -> "MECONERV PLUS OD"
    
    function cleanNameForDB(name = "") {
        return name
          .replace(/\b(\d+)\s*['`"]?S\b/gi, "") // Remove 10's, 10S
          .replace(/\b\d+X\d+\b/gi, "")        // Remove 10X10
          .replace(/\s+/g, " ")
          .trim();
    }

    const cleanDBName = cleanNameForDB(rawProductName);

    // 🔥 FIX: Use cleanDBName (with TABLETS/15'S removed) for splitting
    const { name, strength, variant } = splitProduct(cleanDBName);

    if (!name) {
      console.warn(`❌ Invalid product skipped: ${rawProductName}`);
      return null;
    }

    // Reconstruct clean name: Name + Variant + Strength
    // e.g., "VILDAPRIDE M 50/500MG TABLETS (15'S)" → "VILDAPRIDE M 50/500MG"
    const reallyFinalName = [name, variant, strength].filter(Boolean).join(" ");
    
    // Let's use `reallyFinalName` as the stored productName.
    // It is cleaner and structured.

    const cleanedProductName = [name, strength, variant]
      .filter(Boolean)
      .join(" ");

    return {
      updateOne: {
        filter: { productCode },
        update: {
          $set: {
            productCode,
            productName: reallyFinalName, // ✅ STORE CLEANED NAME
            baseName: name,
            dosage: strength || null,
            variant: variant || null,
            cleanedProductName,
            division: division || "",
            pack: pack,
            boxPack: boxPack
          }
        },
        upsert: true
      }
    };
  })
  .filter(Boolean);

if (productOps.length) {
  const result = await ProductMaster.bulkWrite(productOps);
  inserted.products = result.upsertedCount;
  updated.products = result.modifiedCount;
  console.log(`✅ Products: ${inserted.products} inserted, ${updated.products} updated`);
}
    // Need to refresh products for scheme matching
    const allProducts = await ProductMaster.find({}).session(session).lean();

   /* =====================================================
   SCHEME PROCESSING SECTION (Add to uploadMasterDatabase)
   ===================================================== */

// This section goes AFTER product processing in your uploadMasterDatabase function

  // -------------------------------------------------------------
  // 3. PROCESS SCHEMES (Raw Matrix Mode)
  // -------------------------------------------------------------
 /* =====================================================
   COMPLETE SCHEME UPLOAD WITH FULL DIAGNOSTICS
   Replace entire scheme processing section in uploadMasterDatabase
===================================================== */

const rawSheets = readExcelMatrix(req.file.buffer);
  
const schemeRowsRaw = 
  Object.entries(rawSheets).find(([k]) =>
    k.toLowerCase().includes("scheme")
  )?.[1] || [];

console.log(`\n${"=".repeat(80)}`);
console.log(`📊 SCHEME PROCESSING STARTED`);
console.log(`${"=".repeat(80)}`);
console.log(`Raw rows in Excel: ${schemeRowsRaw.length}\n`);

const blockDivisions = {}; 
let skippedSchemes = 0;
let processedSlabs = 0;
const failedMatches = []; // Track what failed and why

// ✅ Map: productCode|division -> scheme data
const schemeMap = new Map(); 

// STEP 1: DETECT ALL DIVISIONS
console.log("STEP 1: Detecting divisions...\n");

for (let rIndex = 0; rIndex < schemeRowsRaw.length; rIndex++) {
    const row = schemeRowsRaw[rIndex];
    const rowStr = row.map(c => c ? String(c).trim() : "").join(" ");
    
    if (/DIVISION\s*:/i.test(rowStr)) {
        // Scan ALL columns
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cell = row[colIndex] ? String(row[colIndex]).trim() : "";
            if (/DIVISION\s*:/i.test(cell)) {
                const divMatch = cell.match(/DIVISION\s*:\s*([A-Z0-9\-\s]+)/i);
                if (divMatch) {
                    const divName = divMatch[1].trim().toUpperCase();
                    blockDivisions[colIndex] = divName;
                    console.log(`✅ Division at Column ${colIndex}: "${divName}"`);
                }
            }
        }
    }
}

const BLOCK_STARTS = Object.keys(blockDivisions).map(Number).sort((a, b) => a - b);

if (BLOCK_STARTS.length === 0) {
    console.warn("⚠️  NO DIVISIONS DETECTED! Using fallback columns [0, 5]");
    BLOCK_STARTS.push(0, 5);
    blockDivisions[0] = "DIVISION1";
    blockDivisions[5] = "DIVISION2";
} else {
    console.log(`\n✅ Block starts detected: [${BLOCK_STARTS.join(', ')}]`);
}

console.log(`\nTotal divisions found: ${Object.keys(blockDivisions).length}\n`);

// STEP 2: ENHANCED PRODUCT MATCHER WITH DIAGNOSTICS
function findBestProductMatch(searchName, currentDivision, allProducts, diagnostics = {}) {
    if (!searchName || searchName.length < 2) {
        diagnostics.reason = "Search name too short";
        return null;
    }
    
    const { name: baseName, strength: dosage, variant } = splitProduct(searchName);
    const normDivision = normalizeDivision(currentDivision);
    const normBase = normalizeMedicalTerms(baseName);
    const cleanedSearchName = [baseName, dosage, variant]
        .filter(Boolean).join(' ').trim().toUpperCase();

    diagnostics.parsed = { baseName, dosage, variant };
    diagnostics.normalized = { cleanedSearchName, normBase, normDivision };

    // Strategy 1: Product code exact match
    if (/^[A-Z0-9]{4,10}$/.test(searchName)) {
        const match = allProducts.find(p => p.productCode === searchName);
        if (match) {
            diagnostics.matchType = "PRODUCT_CODE_EXACT";
            return match;
        }
    }

    // Strategy 2: Exact name + division
    let match = allProducts.find(p =>
        normalizeMedicalTerms(p.cleanedProductName || p.productName) === normalizeMedicalTerms(cleanedSearchName) &&
        normalizeDivision(p.division) === normDivision
    );
    if (match) {
        diagnostics.matchType = "EXACT_NAME_DIVISION";
        return match;
    }

    // Strategy 3: Base name + division
    match = allProducts.find(p =>
        normalizeMedicalTerms(p.baseName || p.productName) === normBase &&
        normalizeDivision(p.division) === normDivision
    );
    if (match) {
        diagnostics.matchType = "BASE_NAME_DIVISION";
        return match;
    }

    // Strategy 4: Fuzzy division
    match = allProducts.find(p =>
        normalizeMedicalTerms(p.cleanedProductName || p.productName) === normalizeMedicalTerms(cleanedSearchName) &&
        normalizeDivisionAlias(p.division) === normalizeDivisionAlias(currentDivision)
    );
    if (match) {
        diagnostics.matchType = "FUZZY_DIVISION";
        return match;
    }

    // Strategy 5: Partial match + division
    match = allProducts.find(p => {
        const pBase = normalizeMedicalTerms(p.baseName || p.productName);
        return (pBase.includes(normBase) || normBase.includes(pBase)) &&
               normalizeDivisionAlias(p.division) === normalizeDivisionAlias(currentDivision) &&
               baseName.length > 3;
    });
    if (match) {
        diagnostics.matchType = "PARTIAL_NAME_DIVISION";
        return match;
    }

    // Strategy 6: Cross-division (single candidate)
    const candidates = allProducts.filter(p => {
        const pName = normalizeMedicalTerms(p.cleanedProductName || p.productName);
        const pBase = normalizeMedicalTerms(p.baseName || p.productName);
        return pName === normalizeMedicalTerms(cleanedSearchName) || pBase === normBase;
    });

    diagnostics.candidates = candidates.length;

    if (candidates.length === 1) {
        diagnostics.matchType = "CROSS_DIVISION_UNIQUE";
        return candidates[0];
    }

    if (candidates.length > 1) {
        const divMatch = candidates.find(c => 
            normalizeDivisionAlias(c.division) === normalizeDivisionAlias(currentDivision)
        );
        if (divMatch) {
            diagnostics.matchType = "CROSS_DIVISION_PREFER";
            return divMatch;
        }
        diagnostics.matchType = "CROSS_DIVISION_FIRST";
        return candidates[0];
    }

    diagnostics.reason = "NO_MATCH_FOUND";
    return null;
}

// STEP 3: PROCESS ALL ROWS
console.log(`${"=".repeat(80)}`);
console.log("STEP 2: Processing scheme rows...\n");

let lastProductName = "";
let rowsProcessed = 0;
let rowsSkipped = 0;

for (let rIndex = 0; rIndex < schemeRowsRaw.length; rIndex++) {
    const row = schemeRowsRaw[rIndex];
    const rowStr = row.map(c => c ? String(c).trim() : "").join(" ");

    // Skip headers
    if (/DIVISION\s*:/i.test(rowStr)) continue;
    if (/PRODUCT.*MIN.*QTY/i.test(rowStr)) continue;
    if (/^SCHEME\s*%$/i.test(rowStr)) continue;

    // Process each block
    for (const blockStart of BLOCK_STARTS) {
        const pName = row[blockStart];
        const minQ = row[blockStart + 1];
        const freeQ = row[blockStart + 2];
        const pct = row[blockStart + 3];

        if (!pName && !minQ && !freeQ && !pct) continue;
        
        let productName = pName ? String(pName).trim() : "";
        
        // Carry forward logic
        if ((!productName || /^\d+$/.test(productName)) && (minQ || freeQ || pct)) {
            productName = lastProductName;
        }
        
        // Validate
        if (!productName || 
            productName.length < 2 || 
            /^PRODUCT$/i.test(productName) || 
            /^MIN$/i.test(productName) ||
            /^QTY$/i.test(productName) ||
            /^FREE$/i.test(productName) ||
            (/^\d+$/.test(productName) && !lastProductName)) {
            continue;
        }

        // Update carry-forward
        if (productName && productName.length > 2 && !/^\d+$/.test(productName)) {
            lastProductName = productName;
        }

        let minQty = Number(minQ) || 0;
        let freeQty = Number(freeQ) || 0;
        let schemePercent = Number(pct) || 0;
        
        // Normalize percent
        if (schemePercent > 0 && schemePercent <= 1) {
            // Already decimal
        } else if (schemePercent > 1 && schemePercent <= 100) {
            schemePercent = schemePercent / 100;
        }

        if (minQty === 0 && freeQty === 0 && schemePercent === 0) {
            rowsSkipped++;
            continue;
        }

        rowsProcessed++;

        // Handle slash-separated products
        const cleanProductName = productName.replace(/\s+/g, " ").trim();
        let potentialNames = [];

        if (cleanProductName.includes("/")) {
            const slashMatch = cleanProductName.match(/^([A-Z\s\-]+?)\s+(\d+)\/(.+)$/i);
            if (slashMatch) {
                const base = slashMatch[1].trim();
                const first = slashMatch[2].trim();
                const rest = slashMatch[3].split("/").map(s => s.trim());
                
                potentialNames.push(`${base} ${first}`);
                rest.forEach(r => {
                    potentialNames.push(/^\d+$/.test(r) ? `${base} ${r}` : r);
                });
            } else {
                potentialNames = cleanProductName.split("/").map(s => s.trim());
            }
        } else {
            potentialNames.push(cleanProductName);
        }

        const currentDivision = blockDivisions[blockStart];
        if (!currentDivision) {
            console.warn(`⚠️  Row ${rIndex + 1}: No division for column ${blockStart}`);
            skippedSchemes++;
            continue;
        }

        // Process each variant
        for (const searchName of potentialNames) {
            if (!searchName || searchName.length < 2) continue;

            const diagnostics = {};
            const matchedProduct = findBestProductMatch(searchName, currentDivision, allProducts, diagnostics);

            if (!matchedProduct) {
                skippedSchemes++;
                
                // Store failure details
                if (failedMatches.length < 50) {
                    failedMatches.push({
                        row: rIndex + 1,
                        searchName,
                        division: currentDivision,
                        minQty,
                        freeQty,
                        diagnostics
                    });
                }
                
                // Log first 10 failures
                if (failedMatches.length <= 10) {
                    console.log(`❌ [Row ${rIndex + 1}] FAILED: "${searchName}" (${currentDivision})`);
                    console.log(`   Reason: ${diagnostics.reason || 'Unknown'}`);
                    if (diagnostics.candidates) {
                        console.log(`   Candidates found: ${diagnostics.candidates}`);
                    }
                }
                continue;
            }

            // Success - create slab
            const slab = {
                minQty,
                freeQty,
                schemePercent: Number(schemePercent.toFixed(4))
            };

            const normDiv = normalizeDivision(currentDivision);
            const key = `${matchedProduct.productCode}|${normDiv}`;
            
            if (!schemeMap.has(key)) {
                schemeMap.set(key, {
                    productCode: matchedProduct.productCode,
                    productName: matchedProduct.productName,
                    division: normDiv,
                    slabs: []
                });
            }
            
            schemeMap.get(key).slabs.push(slab);
            processedSlabs++;
            
            // Log first 20 successes
            if (processedSlabs <= 20) {
                console.log(`✅ [${processedSlabs}] "${searchName}" -> ${matchedProduct.productName} | ${minQty}+${freeQty} (${diagnostics.matchType})`);
            }
        }
    }
}

// STEP 4: CREATE BULK OPERATIONS
console.log(`\n${"=".repeat(80)}`);
console.log("STEP 3: Creating database operations...\n");

const schemeOps = [];
let totalUniqueSchemes = 0;
let totalSlabsStored = 0;

for (const [key, data] of schemeMap.entries()) {
    const uniqueSlabs = data.slabs.filter((slab, index, self) =>
        index === self.findIndex((t) => (
            t.minQty === slab.minQty &&
            t.freeQty === slab.freeQty &&
            Math.abs(t.schemePercent - slab.schemePercent) < 0.0001
        ))
    );

    uniqueSlabs.sort((a, b) => a.minQty - b.minQty);

    totalUniqueSchemes++;
    totalSlabsStored += uniqueSlabs.length;

    schemeOps.push({
        updateOne: {
            filter: {
                productCode: data.productCode,
                division: data.division
            },
            update: {
                $set: {
                    productCode: data.productCode,
                    productName: data.productName,
                    division: data.division,
                    isActive: true,
                    slabs: uniqueSlabs
                }
            },
            upsert: true
        }
    }); 
}

// STEP 5: COMPREHENSIVE SUMMARY
console.log(`${"=".repeat(80)}`);
console.log("📊 FINAL PROCESSING SUMMARY");
console.log(`${"=".repeat(80)}`);
console.log(`\n📥 INPUT:`);
console.log(`   Total Excel rows: ${schemeRowsRaw.length}`);
console.log(`   Divisions detected: ${Object.keys(blockDivisions).length}`);
console.log(`   Block positions: [${BLOCK_STARTS.join(', ')}]`);

console.log(`\n⚙️  PROCESSING:`);
console.log(`   Rows processed: ${rowsProcessed}`);
console.log(`   Rows skipped (empty): ${rowsSkipped}`);
console.log(`   Slabs extracted: ${processedSlabs}`);

console.log(`\n✅ SUCCESS:`);
console.log(`   Unique products matched: ${totalUniqueSchemes}`);
console.log(`   Total slabs stored: ${totalSlabsStored}`);
console.log(`   Avg slabs per product: ${(totalSlabsStored / Math.max(totalUniqueSchemes, 1)).toFixed(1)}`);

console.log(`\n❌ FAILURES:`);
console.log(`   Failed matches: ${skippedSchemes}`);
console.log(`   Success rate: ${((totalUniqueSchemes / Math.max(totalUniqueSchemes + skippedSchemes, 1)) * 100).toFixed(1)}%`);

// Show multi-slab products
const multiSlabProducts = Array.from(schemeMap.values())
    .filter(p => p.slabs.length > 1)
    .slice(0, 5);

if (multiSlabProducts.length > 0) {
    console.log(`\n📋 Sample Multi-Slab Products:`);
    multiSlabProducts.forEach(p => {
        console.log(`   ${p.productName} (${p.division}): ${p.slabs.length} slabs`);
    });
}

// Show top failures
if (failedMatches.length > 0) {
    console.log(`\n⚠️  TOP FAILED MATCHES (showing up to 10):`);
    failedMatches.slice(0, 10).forEach((f, idx) => {
        console.log(`\n${idx + 1}. Row ${f.row}: "${f.searchName}" (${f.division})`);
        console.log(`   Scheme: ${f.minQty}+${f.freeQty}`);
        console.log(`   Reason: ${f.diagnostics.reason || 'Unknown'}`);
        if (f.diagnostics.parsed) {
            console.log(`   Parsed: base="${f.diagnostics.parsed.baseName}", strength="${f.diagnostics.parsed.dosage}"`);
        }
        if (f.diagnostics.candidates !== undefined) {
            console.log(`   Candidates: ${f.diagnostics.candidates}`);
        }
    });
    
    console.log(`\n💡 SUGGESTIONS:`);
    if (failedMatches.some(f => f.diagnostics.reason === 'NO_MATCH_FOUND')) {
        console.log(`   • Add missing products to Product Master database`);
    }
    if (failedMatches.some(f => f.diagnostics.candidates > 1)) {
        console.log(`   • Check for duplicate products with different divisions`);
    }
    console.log(`   • Verify product names in scheme Excel match Product Master`);
}

console.log(`\n${"=".repeat(80)}\n`);

// STEP 6: WRITE TO DATABASE
if (schemeOps.length > 0) {
    console.log("💾 Writing to database...\n");
    const result = await SchemeMaster.bulkWrite(schemeOps);
    console.log(`✅ Database write complete:`);
    console.log(`   Inserted: ${result.upsertedCount || 0}`);
    console.log(`   Modified: ${result.modifiedCount || 0}`);
    console.log(`   Total operations: ${schemeOps.length}\n`);
}

// Return detailed response
res.json({
    success: true,
    message: "Master database uploaded successfully",
    inserted,
    updated,
    schemes: {
        documents: totalUniqueSchemes,
        totalSlabs: totalSlabsStored,
        avgSlabsPerProduct: (totalSlabsStored / Math.max(totalUniqueSchemes, 1)).toFixed(1),
        processedSlabs: processedSlabs,
        skipped: skippedSchemes,
        divisionsDetected: Object.keys(blockDivisions).length,
        blockPositions: BLOCK_STARTS,
        successRate: ((totalUniqueSchemes / Math.max(totalUniqueSchemes + skippedSchemes, 1)) * 100).toFixed(1) + '%',
        multiSlabCount: Array.from(schemeMap.values()).filter(p => p.slabs.length > 1).length,
        failedSamples: failedMatches.slice(0, 10)
    }
});

  } catch (err) {
    console.log("⚠️ CAUGHT ERROR IN CONTROLLER:", err.message);
    // await session.abortTransaction();
    // session.endSession();
    console.error("❌ Master upload error:", err);
    res.status(500).json({ 
      error: "MASTER_UPLOAD_FAILED", 
      details: err.message,
      stack: err.stack
    });
  }
};

// Helper function to extract pack size (add this outside the main function)
function extractPackSize(desc) {
  if (!desc) return null;
  
  const patterns = [
    /\((\d+)\s*['`"]?\s*S?\)/i,    // (30'S)
    /\b(\d+)\s*['`"]?\s*S\b/i,     // 30'S, 30S
    /\bPACK\s*OF\s*(\d+)\b/i,      // PACK OF 10
    /\b(\d+)\s*TABLETS?\b/i,       // 10 TABLETS
    /\b(\d+)\s*CAPSULES?\b/i       // 10 CAPSULES
  ];
  
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (match) {
      return {
        value: parseInt(match[1], 10),
        text: match[0]
      };
    }
  }
  
  return null;
}

/* =====================================================
   EXPORT MASTER DATABASE
===================================================== */
export const exportMasterDatabase = async (req, res) => {
  try {
    const customers = await CustomerMaster.find().sort({ customerCode: 1 }).lean();
    const products = await ProductMaster.find().sort({ productName: 1 }).lean();

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Customer sheet with full format
    const customerData = customers.map(c => ({
      "Code": c.customerCode || "",
      "Customer Type": c.customerType || "",
      "Customer Name": c.customerName || "",
      "Address 1": c.address1 || "",
      "Address 2": c.address2 || "",
      "Address 3": c.address3 || "",
      "City": c.city || "",
      "Pin Code": c.pinCode || "",
      "State": c.state || "",
      "Contact Person": c.contactPerson || "",
      "Phone No1": c.phoneNo1 || "",
      "Phone No2": c.phoneNo2 || "",
      "Mobile No": c.mobileNo || "",
      "Drug Lic No": c.drugLicNo || "",
      "Drug Lic From Dt": c.drugLicFromDt || "",
      "Drug Lic To Dt": c.drugLicToDt || "",
      "Drug Lic No1": c.drugLicNo1 || "",
      "Drug Lic From Dt1": c.drugLicFromDt1 || "",
      "Drug Lic To Dt1": c.drugLicToDt1 || "",
      "Gst No": c.gstNo || "",
      "E Mail": c.email || ""
    }));
    const customerSheet = XLSX.utils.json_to_sheet(customerData);
    XLSX.utils.book_append_sheet(wb, customerSheet, "customer db");

    // Product sheet
    const productData = products.map(p => ({
      "SAP Code": p.productCode,
      "Item Desc": p.productName,
      "Dvn": p.division || ""
    }));
    const productSheet = XLSX.utils.json_to_sheet(productData);
    XLSX.utils.book_append_sheet(wb, productSheet, "product db");
const schemes = await SchemeMaster.find().lean();

const schemeData = schemes.flatMap(s =>
  (s.slabs || []).map(slab => ({
    "Division": s.division,
    "Product Code": s.productCode,
    "Product": s.productName,
    "Min Qty": slab.minQty,
    "Free Qty": slab.freeQty,
    "Scheme %": slab.schemePercent * 100
  }))
);

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(schemeData),
  "scheme db"
);

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=master-data-${Date.now()}.xlsx`
    );
    res.send(buffer);

  } catch (err) {
    console.error("EXPORT FAILED:", err);
    res.status(500).json({ error: "EXPORT_FAILED", details: err.message });
  }
};

/* =====================================================
   CUSTOMERS – CRUD
===================================================== */

export const getCustomers = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = req.query.search || "";

    const rawSearch = req.query.search || "";
const safeSearch = escapeRegex(rawSearch);

const query = safeSearch
  ? {
      $or: [
        { customerName: { $regex: safeSearch, $options: "i" } },
        { customerCode: { $regex: safeSearch, $options: "i" } },
        { city: { $regex: safeSearch, $options: "i" } },
        { state: { $regex: safeSearch, $options: "i" } }
      ]
    }
  : {};

    const [data, total] = await Promise.all([
      CustomerMaster.find(query)
        .sort({ customerCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      CustomerMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      total,
      page,
      limit
    });

  } catch (err) {
    console.error("GET CUSTOMERS FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_CUSTOMERS" });
  }
};


export const createCustomer = async (req, res) => {
  try {
    const {
      customerCode,
      customerType,
      customerName,
      address1,
      address2,
      address3,
      city,
      pinCode,
      state,
      contactPerson,
      phoneNo1,
      phoneNo2,
      mobileNo,
      drugLicNo,
      drugLicFromDt,
      drugLicToDt,
      drugLicNo1,
      drugLicFromDt1,
      drugLicToDt1,
      gstNo,
      email
    } = req.body;

    if (!customerCode || !customerName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await CustomerMaster.findOne({ customerCode: customerCode.trim() });

    if (exists) {
      return res.status(409).json({ error: "CUSTOMER_CODE_ALREADY_EXISTS" });
    }

    const customer = await CustomerMaster.create({
      customerCode: customerCode?.trim(),
      customerType: customerType?.trim(),
      customerName: customerName?.trim(),
      address1: address1?.trim(),
      address2: address2?.trim(),
      address3: address3?.trim(),
      city: city?.trim(),
      pinCode: pinCode?.trim(),
      state: state?.trim(),
      contactPerson: contactPerson?.trim(),
      phoneNo1: phoneNo1?.trim(),
      phoneNo2: phoneNo2?.trim(),
      mobileNo: mobileNo?.trim(),
      drugLicNo: drugLicNo?.trim(),
      drugLicFromDt: drugLicFromDt?.trim(),
      drugLicToDt: drugLicToDt?.trim(),
      drugLicNo1: drugLicNo1?.trim(),
      drugLicFromDt1: drugLicFromDt1?.trim(),
      drugLicToDt1: drugLicToDt1?.trim(),
      gstNo: gstNo?.trim(),
      email: email?.trim()
    });

    res.json({ success: true, customer });
  } catch (err) {
    console.error("CREATE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_CUSTOMER" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    const customer = await CustomerMaster.findById(id);
    if (!customer) {
      return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    }

    // Update all provided fields
    Object.keys(updateFields).forEach(key => {
      if (updateFields[key] !== undefined) {
        customer[key] = updateFields[key]?.toString().trim();
      }
    });

    await customer.save();
    res.json({ success: true, customer });
  } catch (err) {
    console.error("UPDATE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_CUSTOMER" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await CustomerMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE CUSTOMER FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_CUSTOMER" });
  }
};

/* =====================================================
   PRODUCTS – CRUD
===================================================== */

export const getProducts = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
  { productName: { $regex: search, $options: "i" } },
  { cleanedProductName: { $regex: search, $options: "i" } },
  { productCode: { $regex: search, $options: "i" } }
]

        }
      : {};

    const [data, total] = await Promise.all([
      ProductMaster.find(query)
        .sort({ productName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      ProductMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      total,
      page,
      limit
    });

  } catch (err) {
    console.error("GET PRODUCTS FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_PRODUCTS" });
  }
};


export const createProduct = async (req, res) => {
  try {
    const { productCode, productName, division } = req.body;

    if (!productCode || !productName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await ProductMaster.findOne({
      productCode: productCode.trim()
    });

    if (exists) {
      return res.status(409).json({ error: "PRODUCT_ALREADY_EXISTS" });
    }

const { name, strength, variant } = splitProduct(productName);

const product = await ProductMaster.create({
  productCode: productCode.trim(),
  baseName: name,
  dosage: strength || null,
  variant: variant || "",
  productName: productName.trim(),
  division: division?.trim()
});


    res.json({ success: true, product });
  } catch (err) {
    console.error("CREATE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_PRODUCT" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, division } = req.body;

    const product = await ProductMaster.findById(id);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    if (division !== undefined) product.division = division.trim();

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    console.error("UPDATE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_PRODUCT" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ProductMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_PRODUCT" });
  }
};

export const transferProduct = async (req, res) => {
  try {
    const { productCode, newDivision } = req.body;

    if (!productCode || !newDivision) {
      return res.status(400).json({ error: "CODE_AND_DIVISION_REQUIRED" });
    }

    const product = await ProductMaster.findOneAndUpdate(
      { productCode: productCode.trim() },
      { division: newDivision.trim() },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("TRANSFER PRODUCT FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_TRANSFER_PRODUCT" });
  }
};
/* =====================================================
   SCHEMES – READ ONLY (ADMIN)
===================================================== */


/* =====================================================
   GET SCHEMES (PAGINATED)
===================================================== */
export const getSchemes = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = (req.query.search || "").trim();

    const query = search
      ? {
          $or: [
            { productCode: { $regex: search, $options: "i" } },
            { productName: { $regex: search, $options: "i" } },
            { division: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const schemes = await SchemeMaster.find(query)
      .sort({ division: 1, productName: 1 })
      .lean();

    // 🔥 FLATTEN SLABS FOR UI
   const rows = schemes.flatMap(s =>
  (s.slabs || []).map((slab, index) => ({
    _id: `${s._id}-${index}`, // ✅ UNIQUE
    productCode: s.productCode,
    productName: s.productName,
    division: s.division,
    minQty: slab.minQty,
    freeQty: slab.freeQty,
    schemePercent: slab.schemePercent,
    isActive: s.isActive
  }))
);

    res.json({
      success: true,
      data: rows,
      total: schemes.length,  // ✅ DOCUMENT COUNT (199)
      totalRows: rows.length, // SLAB COUNT (159) for pagination
      page,
      limit
    });
  } catch (err) {
    console.error("GET SCHEMES FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_FETCH_SCHEMES" });
  }
};



/* =====================================================
   CREATE SCHEME
===================================================== */
export const createScheme = async (req, res) => {
  try {
    const { schemeCode, schemeName } = req.body;

    if (!schemeCode || !schemeName) {
      return res.status(400).json({ error: "CODE_AND_NAME_REQUIRED" });
    }

    const exists = await SchemeMaster.findOne({ schemeCode });
    if (exists) {
      return res.status(409).json({ error: "SCHEME_ALREADY_EXISTS" });
    }

    const scheme = await SchemeMaster.create(req.body);
    res.json({ success: true, scheme });

  } catch (err) {
    console.error("CREATE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_CREATE_SCHEME" });
  }
};

/* =====================================================
   UPDATE SCHEME
===================================================== */
export const updateScheme = async (req, res) => {
  try {
    const { id } = req.params;

    const scheme = await SchemeMaster.findById(id);
    if (!scheme) {
      return res.status(404).json({ error: "SCHEME_NOT_FOUND" });
    }

    Object.assign(scheme, req.body);
    await scheme.save();

    res.json({ success: true, scheme });

  } catch (err) {
    console.error("UPDATE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_UPDATE_SCHEME" });
  }
};

/* =====================================================
   DELETE SCHEME
===================================================== */
export const deleteScheme = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await SchemeMaster.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "SCHEME_NOT_FOUND" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE SCHEME FAILED:", err);
    res.status(500).json({ error: "FAILED_TO_DELETE_SCHEME" });
  }
};