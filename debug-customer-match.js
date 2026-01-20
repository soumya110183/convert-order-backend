
import { matchCustomerSmart } from './services/customerMatcher.js';
import XLSX from 'xlsx-js-style';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, 'test-files');

// Mock DB loading (simplified)
function loadCustomers() {
    try {
        const dbPath = path.join(TEST_DIR, 'Database.xls');
        const workbook = XLSX.readFile(dbPath);
        const sheetName = workbook.SheetNames[1]; // Typically customers are on sheet 1 or 2? Let's check sheet names.
        
        // Let's assume finding the right sheet or just check all
        let customers = [];
        
        workbook.SheetNames.forEach(name => {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
            rows.forEach(row => {
                // Look for anything that looks like a customer name column
                // Usually row[0] or row[1]
                if (row[0] && typeof row[0] === 'string' && row[0].length > 5) {
                   customers.push({ customerName: row[0] });
                }
            });
        });

        return customers;
    } catch (e) {
        console.error("Error loading DB:", e.message);
        return [];
    }
}

// Better DB Loader (Simulating Controller Logic)
import CustomerMaster from './models/customerMaster.js'; // Can't inspect models easily without DB connection.
// So let's just read the XLS file directly like the test script does.

/* Actually, let's just read Database.xls and dump all customers to see what "Attupuram" looks like in the DB */
const dbPath = path.join(TEST_DIR, 'Database.xls');
console.log(`Loading DB from ${dbPath}`);

const workbook = XLSX.readFile(dbPath);
let allCustomers = [];

workbook.SheetNames.forEach(sheetName => {
    // We expect a "Customer" column or headers
    console.log(`Scanning sheet: ${sheetName}`);
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (data.length > 0) {
        // Find header row
        let headerRowIdx = -1;
        let nameIdx = -1;

        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i];
            // Prefer "Customer Name" or "Name", avoid "Type" if possible unless it's the only one
            const idx = row.findIndex(cell => {
                const txt = String(cell).toUpperCase();
                return (txt.includes("NAME") || txt.includes("CUSTOMER")) && !txt.includes("TYPE");
            });
            
            if (idx !== -1) {
                headerRowIdx = i;
                nameIdx = idx;
                console.log(` - Found header at row ${i+1}, col ${idx}: ${row[idx]}`);
                break;
            }
        }

        if (headerRowIdx !== -1) {
           const names = data.slice(headerRowIdx + 1)
               .map(d => ({ customerName: d[nameIdx] }))
               .filter(c => c.customerName && typeof c.customerName === 'string' && c.customerName.length > 3);
           allCustomers = allCustomers.concat(names);
        } else {
             console.log(` - No header found in ${sheetName}`);
        }
    }
});

console.log(`Loaded ${allCustomers.length} potential customers.`);

// Debug "Attupuram"
const input = "Attupuram Enterprises";
console.log(`\n🔍 Matching Input: "${input}"`);

const result = matchCustomerSmart(input, allCustomers);
console.log(`\n🎯 Result:`);
console.log(JSON.stringify(result, null, 2));

// Debug normalization
// function normalize(text) { ... } // (Skipping local def, relying on blackbox)
// I can't import normalize if it's not exported. I'll stick to blackbox testing matchCustomerSmart or copy normalize logic.

// Detailed scan for "Attupuram" in DB
console.log(`\n🔎 Searching DB for "Attupuram"...`);
const matches = allCustomers.filter(c => 
    c.customerName && c.customerName.toUpperCase().includes("ATTUPURAM")
);
matches.forEach(c => console.log(` - Found in DB: "${c.customerName}"`));

