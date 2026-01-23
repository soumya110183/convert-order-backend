import mongoose from "mongoose";
import ProductMaster from "./models/productMaster.js";
import { splitProduct } from "./utils/splitProducts.js"; // Reuse existing
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/order_convert_db";

// --- MOCK CONTROLLER UTILS ---
function normalizeDivision(div = "") {
  return div.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}
function normalizeDivisionAlias(div = "") {
  const d = normalizeDivision(div);
  if (d === "GTF1") return "GTF";
  if (d === "DTF1") return "DTF";
  return d;
}
function normalizeMedicalTerms(str = "") {
  return str.toUpperCase()
    .replace(/\bSYP\b/g, "SUSPENSION")
    .replace(/\bSUSP\b/g, "SUSPENSION")
    .replace(/\bINJ\b/g, "INJECTION")
    .replace(/\bTAB\b/g, "TABLET")
    .replace(/\bCAP\b/g, "CAPSULE")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- MATCH LOGIC (Copied from Controller) ---
function findBestProductMatch(searchName, currentDivision, allProducts, diagnostics = {}) {
    if (!searchName || searchName.length < 2) return null;
    
    const { name: baseName, strength: dosage, variant } = splitProduct(searchName);
    const normDivision = normalizeDivision(currentDivision);
    const normBase = normalizeMedicalTerms(baseName);
    const cleanedSearchName = [baseName, dosage, variant].filter(Boolean).join(' ').trim().toUpperCase();

    // Strategy 2: Exact name + division
    let match = allProducts.find(p =>
        normalizeMedicalTerms(p.cleanedProductName || p.productName) === normalizeMedicalTerms(cleanedSearchName) &&
        normalizeDivision(p.division) === normDivision
    );
    if (match) { diagnostics.matchType = "EXACT_NAME"; return match; }

    // Strategy 3: Base name + division
    match = allProducts.find(p =>
        normalizeMedicalTerms(p.baseName || p.productName) === normBase &&
        normalizeDivision(p.division) === normDivision
    );
    if (match) { diagnostics.matchType = "BASE_NAME"; return match; }

     // New Strategy 3b: Starts with
    match = allProducts.find(p => {
        const pName = normalizeMedicalTerms(p.cleanedProductName || p.productName);
        const searchNorm = normalizeMedicalTerms(cleanedSearchName);
        return pName.startsWith(searchNorm) && 
               normalizeDivision(p.division) === normDivision;
    });
    if (match) { diagnostics.matchType = "STARTS_WITH"; return match; }

    return null;
}

async function debugDolo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    // 1. DUMP PRODUCTS
    const dolos = await ProductMaster.find({ productName: { $regex: "DOLO", $options: "i" } }).lean();
    
    let output = "";
    output += `\nFound ${dolos.length} products with "DOLO":\n`;
    dolos.forEach(p => {
        output += `- [${p.productCode}] "${p.productName}" (Div: ${p.division}) (Base: ${p.baseName})\n`;
    });

    // 2. SIMULATE MATCH
    const INPUT_NAME = "DOLO";
    const INPUT_DIV = "GTF1";
    output += `\nMatching Input: "${INPUT_NAME}" | Div: "${INPUT_DIV}"\n`;
    
    const diagnostics = {};
    const match = findBestProductMatch(INPUT_NAME, INPUT_DIV, dolos, diagnostics);
    
    if (match) {
        output += `✅ MATCHED: [${match.productCode}] "${match.productName}"\n`;
        output += `   Strategy: ${diagnostics.matchType}\n`;
    } else {
        output += "❌ NO MATCH FOUND\n";
    }
    
    const fs = await import("fs");
    fs.writeFileSync("debug_output.txt", output);
    console.log("Debug output written to debug_output.txt");

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

debugDolo();
