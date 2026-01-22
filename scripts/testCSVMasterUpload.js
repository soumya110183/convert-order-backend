import { readExcelSheets } from "../utils/readExcels.js";

async function testCSVMaster() {
  console.log("🚀 Testing CSV Master Upload Utility...");

  const csvContent = `Customer Code,Customer Name,Type,City,State
C001,HEALWELL PHARMA,RETAIL,MUMBAI,MAHARASHTRA
C002,CITY DRUGS,WHOLSALE,BANGALORE,KARNATAKA`;

  const buffer = Buffer.from(csvContent, "utf-8");

  try {
    const sheets = readExcelSheets(buffer);
    console.log("\n📊 SHEETS FOUND:", Object.keys(sheets));

    // CSV typically results in one sheet named 'sheet1'
    const sheetName = Object.keys(sheets)[0];
    const rows = sheets[sheetName];

    console.log(`\n📋 DATA IN "${sheetName}":`);
    rows.forEach((r, i) => {
      console.log(`  [Row ${i+1}] ${JSON.stringify(r)}`);
    });

    if (rows && rows.length === 2) {
      console.log("\n✅ SUCCESS: Extracted 2 rows from Master CSV");
      if (rows[0]["customer code"] === "C001" && rows[0]["customer name"] === "HEALWELL PHARMA") {
        console.log("✅ Row 1 data matches expected values");
      } else {
        console.error("❌ Data mismatch. Headers found:", Object.keys(rows[0]));
      }
    } else {
      console.error("\n❌ FAILED: Expected 2 rows, got", rows?.length);
    }
  } catch (error) {
    console.error("\n❌ UTILITY ERROR:", error);
  }
}

testCSVMaster();
