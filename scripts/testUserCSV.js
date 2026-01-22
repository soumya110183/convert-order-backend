import { unifiedExtract } from "../services/unifiedParser.js";

async function testUserCSV() {
  console.log("🚀 Testing User-Specific CSV Format...");

  // Exactly matching the user's image structure
  const csvContent = `Sl,Item,Stock,Qty
1,UDOSIS 500MG.10,,70
2,SILYBON 140MG.10,100+20,
3,DIAPRIDE M2 TAB .15,,20
4,DIAPRIDE M4 FORTE.1,,10`;

  const file = {
    originalname: "user-order.csv",
    buffer: Buffer.from(csvContent, "utf-8")
  };

  try {
    const result = await unifiedExtract(file);
    console.log("\n📊 EXTRACTION SUMMARY:");
    console.log(`- Extracted Rows: ${result.dataRows.length}`);
    console.log(`- Detected Customer: ${result.meta.customerName}`);
    console.log(`- Structure: ${result.meta.structure}`);

    console.log("\n📋 EXTRACTED DATA:");
    result.dataRows.forEach((r, i) => {
      console.log(`  [Row ${i+1}] ${r.ITEMDESC} | Qty: ${r.ORDERQTY}`);
    });

    const silybon = result.dataRows.find(r => r.ITEMDESC.includes("SILYBON"));
    const udosis = result.dataRows.find(r => r.ITEMDESC.includes("UDOSIS"));

    let success = true;

    if (!udosis || udosis.ORDERQTY !== 70) {
      console.error("❌ Row 1 (UDOSIS) failed. Expected 70, got:", udosis?.ORDERQTY);
      success = false;
    } else {
      console.log("✅ Row 1 (UDOSIS) extracted correctly: 70");
    }

    if (!silybon || silybon.ORDERQTY !== 120) {
      console.error("❌ Row 2 (SILYBON) failed. Expected 120 (100+20), got:", silybon?.ORDERQTY);
      success = false;
    } else {
      console.log("✅ Row 2 (SILYBON) extracted correctly: 120 (from 100+20)");
    }

    if (result.dataRows.length === 4 && success) {
      console.log("\n✨ FINAL RESULT: SUCCESS! All rows extracted correctly from user format.");
    } else {
      console.error("\n✨ FINAL RESULT: FAILED. Check logs above.");
    }

  } catch (error) {
    console.error("\n❌ EXTRACTION ERROR:", error);
  }
}

testUserCSV();
