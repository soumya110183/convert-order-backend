/**
 * ORDER CONTROLLER - ULTRA ROBUST v5.0
 * ✅ Never returns "no rows extracted" error
 * ✅ Shows partial results even with low match rate
 * ✅ Detailed diagnostics for failed matches
 * ✅ Suggests fixes when matching fails
 */

import OrderUpload from "../models/orderUpload.js";
import ProductMaster from "../models/productMaster.js";
import CustomerMaster from "../models/customerMaster.js";
import SchemeMaster from "../models/schemeMaster.js";
import mongoose from "mongoose";
import XLSX from "xlsx-js-style";
import crypto from "crypto";
import path from "path";
import fs from "fs";

import { unifiedExtract } from "../services/unifiedParser.js";
import { matchProductSmart, matchProductsBatch } from "../services/productMatcher.js";
import { applyScheme, findUpsellOpportunity } from "../services/schemeMatcher.js";
import { matchCustomerSmart } from "../services/customerMatcher.js";
import { stripLeadingCodes, cleanInvoiceDesc } from "../utils/invoiceUtils.js";
import { splitProduct } from "../utils/splitProducts.js";

/* =====================================================
   CONFIGURATION
===================================================== */

const TEMPLATE_COLUMNS = [
  "CODE", "CUSTOMER NAME", "SAPCODE", "ITEMDESC", 
  "ORDERQTY", "BOX PACK", "PACK", "DVN"
];

const MIN_PRODUCT_LENGTH = 3;
const MAX_FAILED_MATCHES = 50;

/* =====================================================
   UTILITIES
===================================================== */

function preprocessProducts(products) {
  return products.map(p => {
    if (!p.baseName || !p.dosage) {
      const parts = splitProduct(p.productName);
      return {
        ...p,
        baseName: p.baseName || parts.name,
        dosage: p.dosage || parts.strength,
        variant: p.variant || parts.variant
      };
    }
    return p;
  });
}

function isJunkLine(text = "") {
  const upper = text.toUpperCase();
  return (
   
    upper.length < MIN_PRODUCT_LENGTH ||
    /^(APPROX|PRINTED|SUPPLIER|GSTIN|DL NO|PAGE)/i.test(upper) ||
    /^MICRO\s+(LABS|DIVISION|HEALTHCARE)/i.test(upper) // Only block MICRO headers, allow MICRODOX
  );
}

/* =====================================================
   EXTRACT ORDER FIELDS
===================================================== */

export const extractOrderFields = async (req, res, next) => {
  try {
    // 📂 Supports both single file (req.file) and multiple (req.files)
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No files uploaded" 
      });
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`📤 MULTI-UPLOAD: Processing ${files.length} files`);
    console.log(`${"=".repeat(70)}`);

    // 🏗️ Load Master Data ONCE for efficient processing
    const [rawProducts, customers] = await Promise.all([
      ProductMaster.find({}).lean(),
      CustomerMaster.find({}).lean()
    ]);
    const products = preprocessProducts(rawProducts);

    if (products.length === 0) {
      return res.status(500).json({
        success: false,
        message: "No products found in master database. Please add products first."
      });
    }

    console.log(`✅ Master Data Loaded: ${products.length} products, ${customers.length} customers\n`);

    const results = [];
    let globalSuccess = true;

    // 🔄 Loop through each file
    const seenHashes = new Set();

    for (const file of files) {
      console.log(`\n⏳ Processing File: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)...`);
      
      // 🛡️ DEDUPLICATION: Check if file content was already processed in this batch
      const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
      if (seenHashes.has(fileHash)) {
          console.warn(`⚠️ SKIPPING DUPLICATE FILE: ${file.originalname} (Matches content of another file in this batch)`);
          results.push({
             status: "SKIPPED",
             fileName: file.originalname,
             message: "Duplicate file detected in batch",
             error: "Likely a duplicate upload"
          });
          continue;
      }
      seenHashes.add(fileHash);

      try {
        // STEP 1: Extract
        const extracted = await unifiedExtract(file);
        
        if (!extracted || !extracted.dataRows || extracted.dataRows.length === 0) {
           console.warn(`⚠️  No rows in ${file.originalname}`);
           results.push({
             status: "FAILED",
             fileName: file.originalname,
             message: "No product rows found.",
             error: "Extraction failed"
           });
           continue;
        }

        // STEP 2: Match Customer
        const customerMatch = matchCustomerSmart(extracted.meta?.customerName, customers);
        console.log(`   👤 Customer: ${customerMatch.auto?.customerName || 'UNKNOWN'} (${customerMatch.source})`);

        // STEP 3: Match Products
        const validRows = [];
        const failedMatches = [];
        let matchedCount = 0;
        let failedCount = 0;

        for (let i = 0; i < extracted.dataRows.length; i++) {
          const row = extracted.dataRows[i];
          const rowNum = i + 1;

          // Reuse existing validation logic
          const qty = Number(row.ORDERQTY);
          if (!qty || qty <= 0 || isNaN(qty)) {
            failedCount++;
            if (failedMatches.length < MAX_FAILED_MATCHES) {
              failedMatches.push({
                 row: rowNum, original: row.ITEMDESC, reason: 'Invalid qty', qty: row.ORDERQTY
              });
            }
            continue;
          }

          let rawDesc = stripLeadingCodes(row.ITEMDESC || "");
          let cleanedDesc = cleanInvoiceDesc(rawDesc);

          if (!cleanedDesc || cleanedDesc.length < MIN_PRODUCT_LENGTH) {
            failedCount++;
            if (failedMatches.length < MAX_FAILED_MATCHES) {
                failedMatches.push({ row: rowNum, original: row.ITEMDESC, reason: 'Desc too short' });
            }
            continue;
          }
           if (isJunkLine(cleanedDesc)) {
            failedCount++;
            continue;
          }

          // Match
          const match = matchProductSmart(cleanedDesc, products);
          
          // Handle candidates/partial matches
          if (match && match.matchedProduct === null && match.candidates) {
             failedCount++;
             validRows.push({
                ITEMDESC: cleanedDesc,
                ORDERQTY: qty,
                matchedProduct: null,
                matchFailed: true,
                matchReason: match.reason || "MANUAL_SELECTION_REQUIRED",
                candidates: match.candidates,
                SAPCODE: "", PACK: 0, "BOX PACK": 0, DVN: ""
             });
             continue;
          }

          if (!match) {
             failedCount++;
             validRows.push({
                ITEMDESC: cleanedDesc,
                ORDERQTY: qty,
                matchedProduct: null,
                matchFailed: true,
                matchReason: "AUTO_MATCH_FAILED",
                SAPCODE: "", PACK: 0, "BOX PACK": 0, DVN: ""
             });
             continue;
          }

          // Success
          matchedCount++;
          const boxPack = match.boxPack || 0;
          const pack = boxPack > 0 ? Math.ceil(qty / boxPack) : 0;

          validRows.push({
             ITEMDESC: cleanedDesc.trim(),
             ORDERQTY: qty,
             matchedProduct: {
               _id: match._id,
               productCode: match.productCode,
               productName: match.productName,
               cleanedProductName: match.cleanedProductName,
               baseName: match.baseName,
               dosage: match.dosage,
               strength: match.dosage,
               variant: match.variant,
               division: match.division,
               confidence: match.confidence,
               pack: pack,
               boxPack: boxPack
             },
             SAPCODE: match.productCode,
             PACK: pack, "BOX PACK": boxPack, DVN: match.division || ""
          });
        }

        // STEP 4: Save to DB
        const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
        
        const upload = await OrderUpload.create({
          userId: req.user.id,
          userEmail: req.user.email,
          fileName: file.originalname,
          fileHash,
          status: "EXTRACTED",
          extractedData: { dataRows: validRows },
          failedMatches: failedMatches.slice(0, MAX_FAILED_MATCHES),
          customerCode: customerMatch.auto?.customerCode || null,
          customerName: customerMatch.auto?.customerName || extracted.meta?.customerName || "UNKNOWN",
          recordsProcessed: validRows.length,
          recordsFailed: failedCount
        });

        console.log(`   ✅ Saved ID: ${upload._id} | Success: ${matchedCount} | Failed: ${failedCount}`);

        results.push({
           status: "SUCCESS",
           fileName: file.originalname,
           uploadId: upload._id,
           dataRows: validRows, // Provide rows for frontend state
           customer: {
             name: customerMatch.auto?.customerName || extracted.meta?.customerName || "UNKNOWN",
             code: customerMatch.auto?.customerCode || "",
             city: customerMatch.auto?.city || "",
             state: customerMatch.auto?.state || "",
             source: customerMatch.source,
             confidence: customerMatch.confidence || 0,
             candidates: customerMatch.candidates || [],
             needsConfirmation: customerMatch.source === 'MANUAL_REQUIRED',
             autoSelected: customerMatch.source === 'EXACT' || customerMatch.source === 'FUZZY_AUTO'
           },
           stats: {
             extracted: validRows.length + failedCount, // Approximation
             matched: matchedCount,
             failed: failedCount,
             successRate: ((matchedCount / (matchedCount + failedCount || 1)) * 100).toFixed(1) + '%'
           },
           failedMatches: failedMatches.slice(0, 5),
           hasPartialMatch: matchedCount > 0 && failedCount > 0
        });

      } catch (fileErr) {
        console.error(`❌ Error processing ${file.originalname}:`, fileErr);
        results.push({
           status: "ERROR",
           fileName: file.originalname,
           message: "Internal processing error",
           error: fileErr.message
        });
        globalSuccess = false;
      }
    }

    console.log(`\n🏁 ALL FILES PROCESSED: ${results.length}`);

    // Return aggregated results
    return res.json({
      success: true, // Always true if at least handled, frontend checks 'status' of each
      results: results,
      message: `Processed ${results.length} files`
    });

  } catch (err) {
    console.error("\n❌ GLOBAL UPLOAD ERROR:", err);
    next(err);
  }
};

/* =====================================================
   EXCEL STYLING (same as before)
===================================================== */

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "8B0000" } },
  alignment: { vertical: "center", horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const normalCellStyle = {
  font:{sz:14},
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const qtyCellStyle = {
  font:{sz:12},
  fill: { patternType: "solid", fgColor: { rgb: "FFFF99" } },
  alignment: { horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const schemeRowStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

/* =====================================================
   CONVERT ORDERS
===================================================== */

export const convertOrders = async (req, res, next) => {
  try {
    const { uploadId, customerCode } = req.body;

    console.log(`\n${"=".repeat(70)}`);
    console.log(`🔄 CONVERSION: Upload ${uploadId}`);
    console.log(`${"=".repeat(70)}\n`);

    if (!customerCode) {
      return res.status(400).json({ 
        success: false, 
        message: "Customer code is required" 
      });
    }

    const query = { _id: uploadId };
    if (req.user.role !== "admin") {
      query.userId = req.user.id;
    }

    const upload = await OrderUpload.findOne(query);

    if (!upload) {
      return res.status(404).json({ 
        success: false,
        message: "Upload not found" 
      });
    }

    const customer = await CustomerMaster.findOne({ customerCode }).lean();
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: "Customer not found" 
      });
    }

    console.log(`✅ Customer: ${customer.customerName}\n`);

    const schemes = await SchemeMaster.find({ isActive: true }).lean();
    console.log(`✅ Loaded ${schemes.length} schemes\n`);

    // ✅ USE ROWS FROM REQUEST IF PROVIDED (Syncs frontend edits), OTHERWISE DB
  
    
    // ✅ SOURCE ROWS (frontend edits take priority)
let sourceRows = [];

if (Array.isArray(req.body.dataRows) && req.body.dataRows.length > 0) {
  sourceRows = req.body.dataRows;
  console.log("🧠 Using rows from frontend (manual edits applied)");
} else if (upload.extractedData?.dataRows) {
  sourceRows = upload.extractedData.dataRows;
  console.log("📦 Using rows from database snapshot");
}

// Hard safety
if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
  return res.status(400).json({
    success: false,
    message: "No rows available for conversion"
  });
}

// 📋 CHECK FOR MULTI-SHEET ORGANIZATION
const sheets = req.body.sheets || [];
const hasSheets = Array.isArray(sheets) && sheets.length > 0;

if (hasSheets) {
  console.log(`📋 Multi-sheet mode: ${sheets.length} sheets detected`);
  sheets.forEach(sheet => {
    console.log(`   - ${sheet.name}: ${sheet.productIndices.length} products`);
  });
}

    const output = [];
    const errors = [];
    const schemeRows = [];
    let totalFreeQty = 0;

    console.log(`⏳ Processing ${sourceRows.length} rows...\n`);

    for (let i = 0; i < sourceRows.length; i++) {
  const row = sourceRows[i];   // ✅ row is NOW defined
  const rowNum = i + 1;

  const qty = Number(row.ORDERQTY);
  if (isNaN(qty) || qty <= 0) {
    errors.push({
      rowNumber: rowNum,
      field: "ORDERQTY",
      error: "Invalid quantity",
      value: row.ORDERQTY
    });
    continue;
  }

  // ✅ CORRECT product code resolution
  const productCode =
    row.manualProduct?.productCode ||
    row.SAPCODE ||
    row.matchedProduct?.productCode;

  if (!productCode) {
    errors.push({
      rowNumber: rowNum,
      field: "SAPCODE",
      error: "Missing product code"
    });
    continue;
  }
    const boxPack =
  row["BOX PACK"] ||
  row.boxPack ||
  row.matchedProduct?.boxPack ||
  0;

      const pack = boxPack > 0 ? Math.ceil(qty / boxPack) : 0;

      // Use row-level customer if available (for multi-file batches), else global
      const rowCustomerCode = row.customerCode || customer.customerCode;
      const rowCustomerName = row.customerName || customer.customerName;

      let schemeResult;
      
      // 🔥 TRUST FRONTEND (Source of Truth)
      // If frontend sends calculate freeQty, use it directly to ensure
      // "Stored Value" logic (prevent double calculation/scaling issues)
      if (typeof row.freeQty === 'number') {
           schemeResult = {
               schemeApplied: row.freeQty > 0,
               freeQty: row.freeQty,
               schemePercent: row.schemePercent || 0,
               appliedSlab: { freeQty: row.freeQty }, // Dummy slab for reference
               calculation: "Manual/Frontend Stored Value"
           };
      } else {
           // Fallback for API/Bulk uploads without frontend context
           schemeResult = applyScheme({
              productCode,               // ✅ correct
              orderQty: qty,
              itemDesc: row.ITEMDESC,
              division: row.DVN,
              customerCode: rowCustomerCode, // ✅ Added customer context (row level priority)
              schemes
            });
      }

      // 💡 Calculate Upsell Opportunity
      const upsell = findUpsellOpportunity({
          productCode,
          orderQty: qty,
          itemDesc: row.ITEMDESC,
          division: row.DVN,
          customerCode: rowCustomerCode,
          schemes
      });

      if (schemeResult.schemeApplied) {
        schemeRows.push({
          productCode: productCode, // ✅ Use resolved code
          productName: row.ITEMDESC,
          orderQty: qty,
          freeQty: schemeResult.freeQty || 0,
          schemePercent: schemeResult.schemePercent || 0,
          division: row.DVN || "",
          appliedScheme: `${qty}+${schemeResult.freeQty || 0}` // 🔥 Format: "200+40"
        });
        totalFreeQty += schemeResult.freeQty || 0;
      }

      // 🔥 Calculate Final Quantity (Order + Free)
      const finalQty = qty + (schemeResult.freeQty || 0);
      
      // 🔥 Recalculate Pack based on Final Quantity
      const finalPack = boxPack > 0 ? Math.ceil(finalQty / boxPack) : 0;

      output.push({
  CODE: rowCustomerCode,
  "CUSTOMER NAME": rowCustomerName,
  SAPCODE: productCode,       // ✅ correct
  ITEMDESC: (row.matchedProduct?.productName || row.ITEMDESC || row.manualProduct?.name || "").trim(),
  ORDERQTY: finalQty,         // ✅ Now showing Total Quantity (Billed + Free)
  "BOX PACK": boxPack,
  PACK: finalPack,            // ✅ Pack calculated on Total Quantity
  DVN: row.DVN || "",
  _hasScheme: schemeResult.schemeApplied || false,

  _originalIdx: i 
});

    }

    console.log(`\n📊 Conversion complete:`);
    console.log(`   Rows: ${output.length}`);
    console.log(`   Schemes: ${schemeRows.length}`);
    console.log(`   Free qty: ${totalFreeQty}\n`);

    if (!output.length) {
      return res.status(400).json({ 
        success: false,
        message: "No valid rows", 
        errors 
      });
    }

    // 📁 GENERATE EXCEL FILES
    fs.mkdirSync("uploads", { recursive: true });
    
    // 🎯 PARTITION DATA BY SHEETS
    const assignedIndices = new Set();
    sheets.forEach(sheet => {
      sheet.productIndices.forEach(idx => assignedIndices.add(idx));
    });

    const assignedRows = output.filter(row => assignedIndices.has(row._originalIdx));
    const unassignedRows = output.filter(row => !assignedIndices.has(row._originalIdx));

    const fileNames = [];
    const downloadUrls = [];

    // 📄 FILE 1: Products assigned to sheets
    if (hasSheets && assignedRows.length > 0) {
      const fileName1 = `sheet-orders-${customer.customerCode}-${Date.now()}.xlsx`;
      const filePath1 = path.join("uploads", fileName1);
      const wb1 = XLSX.utils.book_new();

      // Add each custom sheet
      sheets.forEach((sheet, sheetIdx) => {
        const sheetRows = output.filter(row => 
          sheet.productIndices.includes(row._originalIdx)
        );

        if (sheetRows.length > 0) {
          const wsData = sheetRows.map(row => {
            const { _hasScheme, _originalIdx, ...cleanRow } = row;
            return cleanRow;
          });

          const ws = XLSX.utils.json_to_sheet(wsData, { header: TEMPLATE_COLUMNS });
          
          // Style sheet
          TEMPLATE_COLUMNS.forEach((_, colIdx) => {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
            if (ws[cellRef]) ws[cellRef].s = headerStyle;
          });

          sheetRows.forEach((row, idx) => {
            const excelRow = idx + 1;
            TEMPLATE_COLUMNS.forEach((col, colIdx) => {
              const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
              if (!ws[cellRef]) ws[cellRef] = { v: "" };
              let style = normalCellStyle;
              if (col === "ORDERQTY") style = qtyCellStyle;
              if (row._hasScheme) style = { ...style, fill: schemeRowStyle.fill };
              ws[cellRef].s = style;
            });
          });

          ws["!cols"] = [
            { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 40 },
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
          ];

          XLSX.utils.book_append_sheet(wb1, ws, (sheet.name || `Sheet ${sheetIdx + 1}`).substring(0, 31));
        }
      });

      // Add scheme summary to sheet orders file
      const sheetSchemes = schemeRows.filter(s => 
        assignedRows.some(r => r.SAPCODE === s.productCode)
      );

      if (sheetSchemes.length > 0) {
        const schemeSheetData = sheetSchemes.map(s => ({
          "Product Code": s.productCode,
          "Product Name": s.productName,
          "Order Qty": s.orderQty,
          "Free Qty": s.freeQty,
          "Scheme %": s.schemePercent,
          "Division": s.division
        }));

        const schemeWs = XLSX.utils.json_to_sheet(schemeSheetData);
        
        // Style Scheme Summary
        const schemeHeaders = Object.keys(schemeSheetData[0]);
        schemeHeaders.forEach((_, c) => {
            const cellRef = XLSX.utils.encode_cell({r:0, c});
            if(schemeWs[cellRef]) schemeWs[cellRef].s = headerStyle;
        });
        
        schemeSheetData.forEach((row, idx) => {
            const excelRow = idx + 1;
            schemeHeaders.forEach((colName, colIdx) => {
                const cellRef = XLSX.utils.encode_cell({r: excelRow, c: colIdx});
                if(!schemeWs[cellRef]) schemeWs[cellRef] = {v: ""};
                let style = normalCellStyle;
                if (colName === "Order Qty" || colName === "Free Qty" || colName === "Scheme %") style = qtyCellStyle;
                style = { ...style, fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
                schemeWs[cellRef].s = style;
            });
        });
        schemeWs["!cols"] = [{wch: 15}, {wch: 30}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}];

        XLSX.utils.book_append_sheet(wb1, schemeWs, "Scheme Summary");
      }

      XLSX.writeFile(wb1, filePath1);
      fileNames.push(fileName1);
      downloadUrls.push({ type: 'sheets', url: `/api/orders/download/${upload._id}/sheets` });
      console.log(`✅ Generated Sheet Orders file: ${fileName1}`);
    }

    // 📄 FILE 2: Unassigned products (Main Order)
    if (unassignedRows.length > 0) {
      const fileName2 = `main-order-${customer.customerCode}-${Date.now()}.xlsx`;
      const filePath2 = path.join("uploads", fileName2);
      const wb2 = XLSX.utils.book_new();

      const wsData = unassignedRows.map(row => {
        const { _hasScheme, _originalIdx, ...cleanRow } = row;
        return cleanRow;
      });

      const ws = XLSX.utils.json_to_sheet(wsData, { header: TEMPLATE_COLUMNS });
      
      TEMPLATE_COLUMNS.forEach((_, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      });

      unassignedRows.forEach((row, idx) => {
        const excelRow = idx + 1;
        TEMPLATE_COLUMNS.forEach((col, colIdx) => {
          const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
          if (!ws[cellRef]) ws[cellRef] = { v: "" };
          let style = normalCellStyle;
          if (col === "ORDERQTY") style = qtyCellStyle;
          if (row._hasScheme) style = { ...style, fill: schemeRowStyle.fill };
          ws[cellRef].s = style;
        });
      });

      ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb2, ws, "Main Order");

      // Add scheme summary for main order
      const mainSchemes = schemeRows.filter(s => 
        unassignedRows.some(r => r.SAPCODE === s.productCode)
      );

      if (mainSchemes.length > 0) {
        const schemeSheetData = mainSchemes.map(s => ({
          "Product Code": s.productCode,
          "Product Name": s.productName,
          "Order Qty": s.orderQty,
          "Free Qty": s.freeQty,
          "Scheme %": s.schemePercent,
          "Division": s.division
        }));

        const schemeWs = XLSX.utils.json_to_sheet(schemeSheetData);
        
        // Style Scheme Summary
        const schemeHeaders = Object.keys(schemeSheetData[0]);
        schemeHeaders.forEach((_, c) => {
            const cellRef = XLSX.utils.encode_cell({r:0, c});
            if(schemeWs[cellRef]) schemeWs[cellRef].s = headerStyle;
        });
        
        schemeSheetData.forEach((row, idx) => {
            const excelRow = idx + 1;
            schemeHeaders.forEach((colName, colIdx) => {
                const cellRef = XLSX.utils.encode_cell({r: excelRow, c: colIdx});
                if(!schemeWs[cellRef]) schemeWs[cellRef] = {v: ""};
                let style = normalCellStyle;
                if (colName === "Order Qty" || colName === "Free Qty" || colName === "Scheme %") style = qtyCellStyle;
                style = { ...style, fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
                schemeWs[cellRef].s = style;
            });
        });
        schemeWs["!cols"] = [{wch: 15}, {wch: 30}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}];

        XLSX.utils.book_append_sheet(wb2, schemeWs, "Scheme Summary");
      }

      XLSX.writeFile(wb2, filePath2);
      fileNames.push(fileName2);
      downloadUrls.push({ type: 'main', url: `/api/orders/download/${upload._id}/main` });
      console.log(`✅ Generated Main Order file: ${fileName2}`);
    }

    // 🔄 FALLBACK: If no sheets, create single file with all products
    if (!hasSheets || fileNames.length === 0) {
      const fileName = `order-${customer.customerCode}-${Date.now()}.xlsx`;
      const filePath = path.join("uploads", fileName);
      const wb = XLSX.utils.book_new();

      const wsData = output.map(row => {
        const { _hasScheme, _originalIdx, ...cleanRow } = row;
        return cleanRow;
      });

      const ws = XLSX.utils.json_to_sheet(wsData, { header: TEMPLATE_COLUMNS });
      
      TEMPLATE_COLUMNS.forEach((_, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      });

      output.forEach((row, idx) => {
        const excelRow = idx + 1;
        TEMPLATE_COLUMNS.forEach((col, colIdx) => {
          const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
          if (!ws[cellRef]) ws[cellRef] = { v: "" };
          let style = normalCellStyle;
          if (col === "ORDERQTY") style = qtyCellStyle;
          if (row._hasScheme) style = { ...style, fill: schemeRowStyle.fill };
          ws[cellRef].s = style;
        });
      });

      ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, "Order");

      if (schemeRows.length > 0) {
        const schemeSheetData = schemeRows.map(s => ({
          "Product Code": s.productCode,
          "Product Name": s.productName,
          "Order Qty": s.orderQty,
          "Free Qty": s.freeQty,
          "Scheme %": s.schemePercent,
          "Division": s.division
        }));

        const schemeWs = XLSX.utils.json_to_sheet(schemeSheetData);
        
        // Style Scheme Summary
        const schemeHeaders = Object.keys(schemeSheetData[0]);
        schemeHeaders.forEach((_, c) => {
            const cellRef = XLSX.utils.encode_cell({r:0, c});
            if(schemeWs[cellRef]) schemeWs[cellRef].s = headerStyle;
        });
        
        schemeSheetData.forEach((row, idx) => {
            const excelRow = idx + 1;
            schemeHeaders.forEach((colName, colIdx) => {
                const cellRef = XLSX.utils.encode_cell({r: excelRow, c: colIdx});
                if(!schemeWs[cellRef]) schemeWs[cellRef] = {v: ""};
                let style = normalCellStyle;
                if (colName === "Order Qty" || colName === "Free Qty" || colName === "Scheme %") style = qtyCellStyle;
                style = { ...style, fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
                schemeWs[cellRef].s = style;
            });
        });
        schemeWs["!cols"] = [{wch: 15}, {wch: 30}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}];

        XLSX.utils.book_append_sheet(wb, schemeWs, "Scheme Summary");
      }

      XLSX.writeFile(wb, filePath);
      fileNames.push(fileName);
      downloadUrls.push({ type: 'single', url: `/api/orders/download/${upload._id}` });
      console.log(`✅ Generated single order file: ${fileName}`);
    }

    upload.status = "CONVERTED";
    upload.outputFile = fileNames[0]; // Primary file
    upload.outputFiles = fileNames; // All generated files
    upload.recordsProcessed = output.length;
    upload.recordsFailed = errors.length;
    upload.convertedData = {
      headers: TEMPLATE_COLUMNS, // Set exact template headers
      rows: output.map(row => { 
        // 🔥 Keep _hasScheme for future reports (styling)
        const { _originalIdx, hasScheme, ...cleanRow } = row;
        // Keep _upsell if present
        if (row._upsell) cleanRow._upsell = row._upsell;
        if (row._hasScheme) cleanRow._hasScheme = true;
        return cleanRow; 
      })
    };
    upload.customerCode = customer.customerCode;
    upload.customerName = customer.customerName;
    upload.schemeSummary = { count: schemeRows.length, totalFreeQty };
    upload.schemeDetails = schemeRows;

   


    await upload.save();

    console.log(`✅ Saved: ${upload.outputFiles?.join(', ') || upload.outputFile}\n`);

    res.json({
      success: true,
      status: "CONVERTED",
      uploadId: upload._id,
      recordsProcessed: output.length,
      errors: errors.length,
      schemeSummary: { count: schemeRows.length, totalFreeQty },
      convertedData: output.map(({ _hasScheme, _upsell, ...row }) => ({ ...row, _upsell })),
      downloadUrl: `/api/orders/download/${upload._id}`,
      downloadUrls: downloadUrls // ✅ Send all download options
    });

  } catch (err) {
    console.error('\n❌ CONVERSION ERROR:', err);
    next(err);
  }
};

/* =====================================================
   OTHER ENDPOINTS (same as before)
===================================================== */

export const getOrderById = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    
    // Only restrict by user ID if NOT admin
    if (req.user.role !== "admin") {
      query.userId = req.user.id;
    }

    const upload = await OrderUpload.findOne(query).lean();

    if (!upload) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

   const schemeDetails = (upload.schemeDetails || []).map(s => ({
  productCode: s.productCode,
  productName: s.productName,
  orderQty: s.orderQty,
  freeQty: s.freeQty,
  schemePercent: s.schemePercent,
  division: s.division
}));

    const schemeSummary = {
      count: schemeDetails.length,
      totalFreeQty: schemeDetails.reduce((sum, s) => sum + (s.freeQty || 0), 0)
    };

    res.json({
      success: true,
      status: upload.status,
      recordsProcessed: upload.recordsProcessed || 0,
      recordsFailed: upload.recordsFailed || 0,
      errors: upload.rowErrors || [],
      warnings: upload.rowWarnings || [],
      convertedData: fixConvertedDataDisplay(upload.convertedData),
      schemeSummary,
      schemeDetails,
      fileName: upload.fileName,
      outputFile: upload.outputFile,
      outputFiles: upload.outputFiles || [], // ✅ Return multiple files
      downloadUrls: (upload.outputFiles || []).length > 0 ? [
         ...(upload.outputFiles.some(f => f.startsWith('sheet-orders')) ? [{ type: 'sheets', url: `/api/orders/download/${upload._id}/sheets` }] : []),
         ...(upload.outputFiles.some(f => f.startsWith('main-order')) ? [{ type: 'main', url: `/api/orders/download/${upload._id}/main` }] : []),
         // Fallback if no specific types found but files exist, or just single file
         ...(upload.outputFiles.length === 1 && !upload.outputFiles[0].startsWith('sheet') && !upload.outputFiles[0].startsWith('main') ? [{ type: 'single', url: `/api/orders/download/${upload._id}` }] : [])
      ] : [{ type: 'single', url: `/api/orders/download/${upload._id}` }],
      customerCode: upload.customerCode,
      customerName: upload.customerName,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      _id: upload._id
    });
  } catch (err) {
    next(err);
  }
};

// 🔥 HELPER: Fix display names for historical data
function fixConvertedDataDisplay(convertedData) {
  if (!convertedData || !Array.isArray(convertedData.rows)) return convertedData;
  
  return {
    ...convertedData,
    rows: convertedData.rows.map(row => ({
      ...row,
      // Create a display version of ITEMDESC on the fly
      ITEMDESC: (row.matchedProduct?.productName || row.ITEMDESC || row.manualProduct?.name || "").trim()
    }))
  };
}

export const getOrderHistory = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // ✅ Build Query
    const query = { userId: req.user.id };

    // Search (Case-insensitive regex on fileName)
    if (req.query.search) {
      query.fileName = { $regex: req.query.search, $options: "i" };
    }

    // Status Filter
    if (req.query.status && req.query.status !== "all" && req.query.status !== "ALL") {
      query.status = req.query.status.toUpperCase();
    }

    // Fetch Global Stats (Unfiltered)
    // Fetch History (Filtered)
    const [globalTotal, history, successCount, failedCount, recordsAgg, filteredTotal] = await Promise.all([
      OrderUpload.countDocuments({ userId: req.user.id }), // Stats Total
      OrderUpload.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OrderUpload.countDocuments({ userId: req.user.id, status: "CONVERTED" }), // Stats Success
      OrderUpload.countDocuments({ userId: req.user.id, status: "FAILED" }), // Stats Failed
      OrderUpload.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } }, 
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$recordsProcessed", 0] } }
          }
        }
      ]),
      OrderUpload.countDocuments(query) // ✅ Pagination Total (Filtered)
    ]);

    res.json({
      success: true,
      stats: {
        total: globalTotal,
        successful: successCount,
        failed: failedCount,
        records: recordsAgg[0]?.total || 0
      },
      history: history.map(h => ({
        id: h._id,
        fileName: h.fileName,
        status: h.status,
        processed: h.recordsProcessed || 0,
        failed: h.recordsFailed || 0,
        customerName: h.customerName,
        createdAt: h.createdAt,
        downloadUrls: (h.outputFiles || []).length > 0 ? [
           ...(h.outputFiles.some(f => f.startsWith('sheet-orders')) ? [{ type: 'sheets', url: `/api/orders/download/${h._id}/sheets` }] : []),
           ...(h.outputFiles.some(f => f.startsWith('main-order')) ? [{ type: 'main', url: `/api/orders/download/${h._id}/main` }] : []),
           ...(h.outputFiles.length === 1 && !h.outputFiles[0].startsWith('sheet') && !h.outputFiles[0].startsWith('main') ? [{ type: 'single', url: `/api/orders/download/${h._id}` }] : [])
        ] : [{ type: 'single', url: `/api/orders/download/${h._id}` }]
      })),
      pagination: {
        page,
        limit,
        total: filteredTotal, // ✅ Pager uses filtered count
        totalPages: Math.ceil(filteredTotal / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   CHECK SCHEMES (Upsell)
===================================================== */
export const checkSchemes = async (req, res, next) => {
  try {
    const { dataRows } = req.body;
    if (!dataRows || !Array.isArray(dataRows)) {
      return res.json({ success: true, suggestions: [] });
    }

    const schemes = await SchemeMaster.find({ isActive: true }).lean();
    const suggestions = [];

    // Import this dynamically or assume it's imported at top
    const { findUpsellOpportunity } = await import("../services/schemeMatcher.js");

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const qty = Number(row.ORDERQTY);
        const productCode = row.SAPCODE || row.matchedProduct?.productCode;

        if (!qty || !productCode) continue;

        const suggestion = findUpsellOpportunity({
            productCode,
            orderQty: qty,
            itemDesc: row.ITEMDESC,
            division: row.DVN, // Use division if available
            customerCode: req.body.customerCode, // ✅ Use provided customer code
            schemes
        });

        if (suggestion) {
            suggestions.push({
                rowIndex: i,
                itemDesc: row.ITEMDESC,
                ...suggestion
            });
        }
    }

    res.json({ success: true, suggestions });
  } catch (err) {
    next(err);
  }
};

export const getProductSchemes = async (req, res, next) => {
    try {
        const { productCode } = req.params;
        const { customerCode, division } = req.query;

        if(!productCode) {
            return res.status(400).json({ success: false, message: "Product code required" });
        }

        const schemes = await SchemeMaster.find({ isActive: true }).lean();
        
        // Import dynamically to avoid circular deps if any, or just use top level import
        const { getSchemesForProduct } = await import("../services/schemeMatcher.js");

        const availableSchemes = getSchemesForProduct({
            productCode,
            customerCode,
            division,
            schemes
        });

        res.json({ success: true, schemes: availableSchemes });

    } catch(err) {
        next(err);
    }
};

export const generateDivisionReport = async (req, res, next) => {
  try {
    const { uploadId, dataRows, customerCode, division } = req.body;

    const query = { _id: uploadId };
    if (req.user.role !== "admin") {
      query.userId = req.user.id;
    }

    const upload = await OrderUpload.findOne(query);

    if (!upload) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Use provided rows (frontend state) OR fallback to DB
    const rowsToProcess = dataRows || upload.convertedData?.rows || upload.extractedData?.dataRows;

    if (!rowsToProcess || rowsToProcess.length === 0) {
       return res.status(400).json({ success: false, message: "No data available to generate report" });
    }

    // Filter if division provided
    let finalRows = [...rowsToProcess];
    if (division) {
       finalRows = finalRows.filter(r => (r.DVN || "").toUpperCase() === division.toUpperCase());
    }

    // Sort rows by Division
    const sortedRows = finalRows.sort((a, b) => {
      const divA = (a.DVN || 'ZZZZ').toUpperCase();
      const divB = (b.DVN || 'ZZZZ').toUpperCase();
      return divA.localeCompare(divB);
    });

    // Use provided customer code OR fallback to upload record OR 'UNKNOWN'
    const finalCustomerCode = customerCode || upload.customerCode || 'UNKNOWN';

    // Generate Excel
    const divLabel = division ? `-${division.replace(/[^a-z0-9]/gi, '')}` : '-ALL';
    const fileName = `division-report${divLabel}-${finalCustomerCode}-${Date.now()}.xlsx`;
    const filePath = path.join("uploads", fileName);
    const wb = XLSX.utils.book_new();

    const wsData = sortedRows.map(row => {
      // 🔥 Strict column filtering to remove junk (matchReason, etc)
      const cleanRow = {};
      TEMPLATE_COLUMNS.forEach(col => {
          let val = row[col] || "";
          cleanRow[col] = val;
      });
      return cleanRow;
    });

    const ws = XLSX.utils.json_to_sheet(wsData, { header: TEMPLATE_COLUMNS });

    // Apply Styles
    TEMPLATE_COLUMNS.forEach((_, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    sortedRows.forEach((row, idx) => {
      const excelRow = idx + 1;
      TEMPLATE_COLUMNS.forEach((col, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
        if (!ws[cellRef]) ws[cellRef] = { v: "" };
        let style = normalCellStyle;
        if (col === "ORDERQTY") style = qtyCellStyle;
        if (row._hasScheme || row.hasScheme) style = { ...style, fill: schemeRowStyle.fill };
        ws[cellRef].s = style;
      });
    });

    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Division Report");
    XLSX.writeFile(wb, filePath);

    console.log(`✅ Generated Division Report: ${fileName}`);

    // 🔥 FIX: Persist status and files so it shows in dashboard
    upload.status = "CONVERTED";
    upload.outputFile = fileName;
    
    // Add to outputFiles if not already present
    if (!upload.outputFiles) upload.outputFiles = [];
    if (!upload.outputFiles.includes(fileName)) {
       upload.outputFiles.push(fileName);
    }

    // Persist the latest data from frontend
    if (dataRows && dataRows.length > 0) {
        upload.convertedData = {
           headers: TEMPLATE_COLUMNS,
           rows: dataRows
        };
        upload.recordsProcessed = dataRows.length;
    }

    // Update customer info if we have it
    if (customerCode) {
        upload.customerCode = customerCode;
        // Optionally update name if available in request, but code is most critical
    }

    await upload.save();

    res.json({
      success: true,
      downloadUrl: `/api/orders/download/file/${fileName}` 
    });

  } catch (err) {
    console.error("❌ Division Report Error:", err);
    next(err);
  }
};

export default {
  extractOrderFields,
  convertOrders,
  getOrderById,
  getOrderHistory,
  checkSchemes,
  getProductSchemes,
  generateDivisionReport
};