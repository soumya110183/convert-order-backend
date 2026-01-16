export function validateRow(row, idx) {
  const errors = [];
  const warnings = [];

  if (!row.ITEMDESC || row.ITEMDESC.length < 3) {
    errors.push({ row: idx + 2, field: "ITEMDESC", message: "Missing item" });
  }

  const qty = Number(row.ORDERQTY);
  if (!qty || qty <= 0 || qty > 100000) {
    errors.push({ row: idx + 2, field: "ORDERQTY", message: "Invalid quantity" });
  }

  if (!row.PACK) {
    warnings.push({
      row: idx + 2,
      field: "PACK",
      message: "Pack missing"
    });
  }

  return { row, errors, warnings };
}
