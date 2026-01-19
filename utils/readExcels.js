import XLSX from "xlsx-js-style";


function normalizeKey(key = "") {
  return key
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, " ");
}

export function readExcelSheets(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const result = {};

  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    // Read as array of arrays to find the real header row
    const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Find the row with most columns in top 20 rows (more robust for titles/merges)
    let headerRowIndex = 0;
    let maxCols = 0;
    const SCAN_LIMIT = Math.min(rowsRaw.length, 20);
    
    for (let i = 0; i < SCAN_LIMIT; i++) {
      const nonEmpties = (rowsRaw[i] || []).filter(c => c && c.toString().trim().length > 0).length;
      if (nonEmpties > maxCols) {
        maxCols = nonEmpties;
        headerRowIndex = i;
      }
    }

    const rawHeaders = rowsRaw[headerRowIndex] || [];
    console.log(`DEBUG [EXCEL]: Sheet "${sheetName}" HeaderRowIndex: ${headerRowIndex}, Raw:`, rawHeaders);
    const headers = [];
    const counts = {};

    rawHeaders.forEach(h => {
      let base = normalizeKey(h);
      if (!base) {
        headers.push("");
        return;
      }
      
      if (counts[base] === undefined) {
        counts[base] = 0;
        headers.push(base);
      } else {
        counts[base]++;
        headers.push(`${base}_${counts[base]}`);
      }
    });

    const dataRows = rowsRaw.slice(headerRowIndex + 1);

    result[sheetName.toLowerCase()] = dataRows.map(row => {
      const normalized = {};
   headers.forEach((h, i) => {
  if (!h) return;

  const value = row[i];
  if (value === undefined || value === null) return;

  normalized[h] = value;
});

      return normalized;
    });
  });

  return result;
}
