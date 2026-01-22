
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../test-files/Database.xls');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    
    if (sheetNames.length < 3) {
        console.log(`File has only ${sheetNames.length} sheets.`);
        process.exit(1);
    }

    const sheet3Name = sheetNames[2]; // 0-indexed, so 2 is the 3rd sheet
    const sheet3 = workbook.Sheets[sheet3Name];
    const data = XLSX.utils.sheet_to_json(sheet3);

    console.log(`Sheet 3 Name: ${sheet3Name}`);
    console.log(`Row Count: ${data.length}`);
    if (data.length > 0) {
        console.log('Sample Row keys:', Object.keys(data[0]));
    }

} catch (err) {
    console.error('Error reading file:', err);
}
