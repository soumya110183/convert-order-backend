import XLSX from "xlsx-js-style";
import path from "path";
import fs from "fs";

// Styles
const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "8B0000" } },
  alignment: { vertical: "center", horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const normalCellStyle = {
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const schemeRowStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

const qtyCellStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFF99" } },
  alignment: { horizontal: "center" },
  border: {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" }
  }
};

export const generateOrderExcel = (data, sheetName = "Converted Orders") => {
  const wb = XLSX.utils.book_new();
  const headers = [
      "CODE", 
      "CUSTOMER NAME", 
      "SAPCODE", 
      "ITEMDESC", 
      "ORDERQTY", 
      "BOX PACK", 
      "PACK", 
      "DVN"
  ];
  
  // Clean internal flags
  const cleanRows = data.map(({ _hasScheme, _originalIdx, ...rest }) => rest);
  const ws = XLSX.utils.json_to_sheet(cleanRows, { header: headers });

  // Styles
  headers.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  });

  data.forEach((row, idx) => {
    const excelRow = idx + 1;
    headers.forEach((colName, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });
      if (!ws[cellRef]) ws[cellRef] = { v: "" };

      let style = normalCellStyle;
      if (colName === "ORDERQTY") style = qtyCellStyle;
      
      if (row._hasScheme) {
         style = { ...style, fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
      }
      ws[cellRef].s = style;
    });
  });

  ws["!cols"] = [{wch:15}, {wch:40}, {wch:15}, {wch:50}, {wch:12}, {wch:12}, {wch:12}, {wch:15}];
  
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  return wb;
};

export const saveWorkBook = (wb, fileName) => {
   const outputPath = path.join("uploads", fileName);
   XLSX.writeFile(wb, outputPath);
   return outputPath;
};
