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
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "No file uploaded" 
      });
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`📤 UPLOAD: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
    console.log(`${"=".repeat(70)}`);

    // STEP 1: Extract from file
    console.log("\n⏳ STEP 1: Extracting data from file...\n");
    const extracted = await unifiedExtract(req.file);

    // Check if extraction succeeded
    if (!extracted || !extracted.dataRows) {
      console.error("❌ Extraction returned no data structure");
      return res.status(500).json({
        success: false,
        message: "File extraction failed. Please check file format."
      });
    }

    // If no rows extracted, return with helpful message
    if (extracted.dataRows.length === 0) {
      console.warn("⚠️  No product rows could be extracted");
      
      return res.status(200).json({
        success: false,
        dataRows: [],
        meta: extracted.meta || {},
        extractionFailed: true,
        message: "No product rows found in the file.",
        suggestion: "Please ensure the file contains product data with quantities. Common formats: 'PRODUCT NAME 10'S 50 1500.00'"
      });
    }

    console.log(`✅ Extracted ${extracted.dataRows.length} product rows\n`);

    // STEP 2: Load master data
    console.log("⏳ STEP 2: Loading master data...\n");
    const [rawProducts, customers] = await Promise.all([
      ProductMaster.find({}).lean(),
      CustomerMaster.find({}).lean()
    ]);

    const products = preprocessProducts(rawProducts);
    console.log(`✅ Loaded ${products.length} products, ${customers.length} customers\n`);

    // Check if we have products to match against
    if (products.length === 0) {
      return res.status(500).json({
        success: false,
        message: "No products found in master database. Please add products first."
      });
    }

    // STEP 3: Customer matching
    console.log("⏳ STEP 3: Matching customer...\n");
    const customerMatch = matchCustomerSmart(
      extracted.meta?.customerName,
      customers
    );

    console.log(`✅ Customer: ${customerMatch.auto?.customerName || 'UNKNOWN'} (${customerMatch.source})\n`);

    // STEP 4: Product matching
    console.log("⏳ STEP 4: Matching products...\n");
    
    const validRows = [];
    const failedMatches = [];
    const matchStats = {
      total: extracted.dataRows.length,
      matched: 0,
      failed: 0
    };

    for (let i = 0; i < extracted.dataRows.length; i++) {
      const row = extracted.dataRows[i];
      const rowNum = i + 1;

      // Validate quantity
      const qty = Number(row.ORDERQTY);
      if (!qty || qty <= 0 || isNaN(qty)) {
        matchStats.failed++;
        if (failedMatches.length < MAX_FAILED_MATCHES) {
          failedMatches.push({
            row: rowNum,
            original: row.ITEMDESC,
            reason: 'Invalid quantity',
            qty: row.ORDERQTY
          });
        }
        continue;
      }

      // Clean description
      let rawDesc = stripLeadingCodes(row.ITEMDESC || "");
      let cleanedDesc = cleanInvoiceDesc(rawDesc);

      if (!cleanedDesc || cleanedDesc.length < MIN_PRODUCT_LENGTH) {
        matchStats.failed++;
        if (failedMatches.length < MAX_FAILED_MATCHES) {
          failedMatches.push({
            row: rowNum,
            original: row.ITEMDESC,
            cleaned: cleanedDesc,
            reason: 'Description too short'
          });
        }
        continue;
      }

      if (isJunkLine(cleanedDesc)) {
        matchStats.failed++;
        continue;
      }

      // Match product
      const match = matchProductSmart(cleanedDesc, products);

   // 🔥 NEW: Handle candidates (no exact match, but similar products found)
   if (match && match.matchedProduct === null && match.candidates) {
     matchStats.failed++;
     
     validRows.push({
       ITEMDESC: cleanedDesc,
       ORDERQTY: qty,
       matchedProduct: null,
       matchFailed: true,
       matchReason: match.reason || "MANUAL_SELECTION_REQUIRED",
       candidates: match.candidates, // 🔥 Pass candidates to frontend
       SAPCODE: "",
       PACK: 0,
       "BOX PACK": 0,
       DVN: ""
     });
     
     continue;
   }

   if (!match) {
  matchStats.failed++;

  validRows.push({
    ITEMDESC: cleanedDesc,
    ORDERQTY: qty,
    matchedProduct: null,        // 👈 key change
    matchFailed: true,
    matchReason: "AUTO_MATCH_FAILED",
    SAPCODE: "",
    PACK: 0,
    "BOX PACK": 0,
    DVN: ""
  });

  continue;
}


      // Success!
      matchStats.matched++;

      const boxPack = match.boxPack || 0;
      const pack = boxPack > 0 ? Math.ceil(qty / boxPack) : 0;

      validRows.push({
        ITEMDESC: cleanedDesc,
        ORDERQTY: qty,
        matchedProduct: {
          _id: match._id,
          productCode: match.productCode,
          productName: match.productName,
          cleanedProductName: match.cleanedProductName,
          baseName: match.baseName,
          dosage: match.dosage, 
          strength: match.dosage, // ✅ Added ALIAS for frontend compatibility
          variant: match.variant,
          division: match.division,
          confidence: match.confidence,
          matchType: match.matchType,
          pack: pack,
          boxPack: boxPack
        },
        SAPCODE: match.productCode,
        PACK: pack,
        "BOX PACK": boxPack,
        DVN: match.division || ""
      });
    }

    const successRate = ((matchStats.matched / matchStats.total) * 100).toFixed(1);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`📊 MATCHING SUMMARY:`);
    console.log(`   Total extracted: ${matchStats.total}`);
    console.log(`   ✅ Matched: ${matchStats.matched}`);
    console.log(`   ❌ Failed: ${matchStats.failed}`);
    console.log(`   Success rate: ${successRate}%`);
    console.log(`${"=".repeat(70)}\n`);

    // Even if we have SOME matches, allow continuation
    if (validRows.length === 0) {
      // Show detailed failure info
      console.log("\n⚠️  MATCH FAILURE ANALYSIS:");
      
      if (failedMatches.length > 0) {
        console.log(`\nTop failed items:`);
        failedMatches.slice(0, 5).forEach(f => {
          console.log(`  • Row ${f.row}: "${f.cleaned || f.original}"`);
          console.log(`    Reason: ${f.reason}`);
        });
      }

      return res.status(422).json({
        success: false,
        message: "No products could be matched to your master database",
        extracted: extracted.dataRows.length,
        matched: 0,
        failed: matchStats.failed,
        failedMatches: failedMatches.slice(0, 10),
        totalFailed: failedMatches.length,
        suggestions: [
          "Check if product names in the invoice match your master data",
          "Example from your file: " + (extracted.dataRows[0]?.ITEMDESC || 'N/A'),
          "Consider adding these products to your master database",
          "Verify the invoice format is standard"
        ]
      });
    }

    // STEP 5: Save to database
    console.log("⏳ STEP 5: Saving to database...\n");
    
    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const upload = await OrderUpload.create({
      userId: req.user.id,
      userEmail: req.user.email,
      fileName: req.file.originalname,
      fileHash,
      status: "EXTRACTED",
      extractedData: { dataRows: validRows },
      failedMatches: failedMatches.slice(0, MAX_FAILED_MATCHES),
      customerCode: customerMatch.auto?.customerCode || null,
      customerName: customerMatch.auto?.customerName || extracted.meta?.customerName || "UNKNOWN",
      recordsProcessed: validRows.length,
      recordsFailed: matchStats.failed
    });

    console.log(`✅ Saved with ID: ${upload._id}\n`);

    // Return success (even if partial)
    res.json({
      success: true,
      uploadId: upload._id,
      dataRows: validRows,
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
        extracted: matchStats.total,
        matched: matchStats.matched,
        failed: matchStats.failed,
        successRate: successRate + '%'
      },
      failedMatches: failedMatches.slice(0, 5),
      hasPartialMatch: matchStats.matched > 0 && matchStats.failed > 0
    });

  } catch (err) {
    console.error("\n❌ EXTRACTION ERROR:", err);
    console.error(err.stack);
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
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const qtyCellStyle = {
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

    const upload = await OrderUpload.findOne({ 
      _id: uploadId, 
      userId: req.user.id 
    });

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

      const schemeResult = applyScheme({
  productCode,               // ✅ correct
  orderQty: qty,
  itemDesc: row.ITEMDESC,
  division: row.DVN,
  customerCode: customer.customerCode, // ✅ Added customer context
  schemes
});

      // 💡 Calculate Upsell Opportunity
      const upsell = findUpsellOpportunity({
          productCode,
          orderQty: qty,
          itemDesc: row.ITEMDESC,
          division: row.DVN,
          customerCode: customer.customerCode,
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

      output.push({
  CODE: customer.customerCode,
  "CUSTOMER NAME": customer.customerName,
  SAPCODE: productCode,       // ✅ correct
  ITEMDESC: row.ITEMDESC,
  ORDERQTY: qty,
  "BOX PACK": boxPack,
  PACK: pack,
  DVN: row.DVN || "",
  _hasScheme: schemeResult.schemeApplied || false,
  _originalIdx: i // 🎯 Keep track of original index for sheet grouping
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
        const { _hasScheme, _upsell, _originalIdx, hasScheme, ...cleanRow } = row;
        // Keep _upsell if present, but exclude it from Excel columns
        if (_upsell) cleanRow._upsell = _upsell;
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
    const upload = await OrderUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();

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
      convertedData: upload.convertedData || null,
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

export default {
  extractOrderFields,
  convertOrders,
  getOrderById,
  getOrderHistory,
  checkSchemes,
  getProductSchemes
};