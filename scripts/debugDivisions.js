
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";

const FILE_PATH = path.resolve("test-files/Database.xlsx");
const wb = XLSX.read(fs.readFileSync(FILE_PATH), { type: "buffer" });
const schemeSheetName = wb.SheetNames.find(n => n.toLowerCase().includes("scheme"));
const sheet = wb.Sheets[schemeSheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log(`Scanning ${rows.length} rows for 'DIVISION' keyword...`);

rows.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
        if (cell && /DIVISION/i.test(String(cell))) {
            console.log(`[R${rIdx} C${cIdx}] Content: "${cell}"`);
        }
    });
});
