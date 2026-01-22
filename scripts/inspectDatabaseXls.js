
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../test-files/Database.xls');

try {
    const workbook = XLSX.readFile(filePath);
    console.log("Sheet Names:", workbook.SheetNames);
    
    // Check Sheet 2 (Index 1) - Likely Product DB
    if (workbook.SheetNames.length > 1) {
        const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
        const data = XLSX.utils.sheet_to_json(sheet2, { header: 1 }); // Header array
        console.log(`\n--- Sheet 2 (${workbook.SheetNames[1]}) Preview ---`);
        console.log("Headers:", data[0]);
        console.log("First row:", data[1]);
        console.log("Total Rows:", data.length);
    }

} catch (err) {
    console.error('Error reading file:', err);
}
