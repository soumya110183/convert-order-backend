import { unifiedExtract } from './services/unifiedParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const file = {
  originalname: 'SRI SABARI AGENCIES_Order_311.pdf',
  buffer: fs.readFileSync('test-files/SRI SABARI AGENCIES_Order_311.pdf')
};

const logFile = path.join(__dirname, 'sri-sabari-debug.log');
fs.writeFileSync(logFile, '');

const originalLog = console.log;
function fileLog(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  fs.appendFileSync(logFile, msg + '\n');
  // originalLog(...args); // Optional: keep printing to stdout
}

console.log = fileLog; // Hook global console.log
console.error = fileLog;

console.log('Testing SRI SABARI AGENCIES extraction...\n');

try {
  const result = await unifiedExtract(file);

  console.log('\n=== RESULTS ===');
  console.log(`Extracted: ${result.dataRows.length} products`);
  console.log(`Customer: ${result.meta.customerName}\n`);

  result.dataRows.forEach((p, i) => {
    console.log(`${i + 1}. ${p.ITEMDESC} | Qty: ${p.ORDERQTY || 'MISSING'} (Raw: ${p.ORDERQTY})`);
  });

  console.log('\n=== EXPECTED ===');
  console.log('1. DIANORM-OD 60MG TAB | Qty: 30');
  console.log('2. ARNIV 50MG TAB | Qty: 15');
  console.log('3. SITANORM-E 25 TAB | Qty: 45');
  console.log('4. MICRODOX LBX CAPS | Qty: 120');
} catch (e) {
  console.log(`ERROR: ${e.message}`);
}
