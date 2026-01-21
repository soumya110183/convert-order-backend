
import XLSX from "xlsx-js-style";
import fs from "fs";

const filePath = "test-files/Database.xls";

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    
    console.log("Sheet Names:", workbook.SheetNames);
    
    // The user said "3rd sheet is the scheme product"
    const sheetName = workbook.SheetNames[2]; 
    console.log(`\n--- Inspecting Sheet 3: "${sheetName}" ---`);
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays
    
    // Log first 5 rows to see headers clearly
    console.log("HEADERS (Row 0):", JSON.stringify(data[0], null, 2));
    console.log("HEADERS (Row 1):", JSON.stringify(data[1], null, 2));
    console.log("DATA SAMPLE:", JSON.stringify(data.slice(0, 5), null, 2));

} catch (err) {
    console.error("Error reading file:", err);
}
