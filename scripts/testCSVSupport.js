import { unifiedExtract } from "../services/unifiedParser.js";
import fs from "fs";
import path from "path";

async function testCSV() {
  console.log("🚀 Testing CSV Extraction...");

  const csvContent = `ITEM NAME,QTY,SAP CODE
DOLO 650,50,123456
MECONERV 500,10,654321
PLAGERINE TAB,20,987654`;

  const file = {
    originalname: "test-order.csv",
    buffer: Buffer.from(csvContent, "utf-8")
  };

  try {
    const result = await unifiedExtract(file);
    console.log("\n📊 EXTRACTION SUMMARY:");
    console.log(`- Extracted Rows: ${result.dataRows.length}`);
    console.log(`- Detected Customer: ${result.meta.customerName}`);
    console.log(`- Structure: ${result.meta.structure}`);

    console.log("\n📋 SAMPLE DATA:");
    result.dataRows.forEach((r, i) => {
      console.log(`  [Row ${i+1}] ${r.ITEMDESC} | Qty: ${r.ORDERQTY} | Code: ${r.SAPCODE}`);
    });

    if (result.dataRows && result.dataRows.length === 3) {
      console.log("\n✅ SUCCESS: Extracted 3 rows from CSV");
      
      const dolo = result.dataRows.find(r => r.ITEMDESC.includes("DOLO"));
      if (dolo && dolo.ORDERQTY === 50 && dolo.SAPCODE === "123456") {
        console.log("✅ Data matches exactly!");
      } else {
        console.error("❌ Data mismatch:", dolo);
      }
    } else {
      console.error("\n❌ FAILED: Expected 3 rows, got", result.dataRows?.length);
    }
  } catch (error) {
    console.error("\n❌ EXTRACTION ERROR:", error);
  }
}

testCSV();
