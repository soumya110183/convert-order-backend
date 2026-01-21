
import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import util from "util";

// Force UTF-8 log
const logFile = fs.createWriteStream("debug_excel_layout.txt", { flags: "w" });
console.log = function(d) {
  logFile.write(util.format(d) + "\n");
  process.stdout.write(util.format(d) + "\n");
};

const filePath = path.resolve("test-files/Database.xls");

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

console.log(`Reading ${filePath}...`);
const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("scheme"));

if (!sheetName) {
  console.error("No scheme sheet found!");
  process.exit(1);
}

console.log(`Analyzing Sheet: ${sheetName}`);
const ws = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(`Total Rows: ${data.length}\n`);

// Print first 50 rows to check Division headers
// Print relevant cells
for (let i = 0; i < Math.min(data.length, 60); i++) {
  const row = data[i];
  const rowStr = row.map(c => c ? `"${c}"` : "empty").join(" | ");
  
  // Check if it looks like a division row
  const hasDiv = row.some(c => /DIVISION/i.test(String(c)));
  
  if (hasDiv || i < 10) {
     console.log(`Row ${i}: ${rowStr}`);
  }
}
