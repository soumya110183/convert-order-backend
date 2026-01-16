function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export const autoMapFields = (extractedFields, trainingColumns) => {
  // 🔑 Pre-normalize training columns once
  const normalizedTraining = trainingColumns.map(col => ({
    original: col,
    norm: normalize(col),
  }));

  return extractedFields.map(field => {
    const fieldNorm = normalize(field.fieldName);

    let autoMapped = "";
    let confidence = "low";

    for (const { original, norm } of normalizedTraining) {

      /* ---------- ITEM DESCRIPTION ---------- */
      if (
        ["item", "product", "medicine", "drug", "name"].some(k =>
          fieldNorm.includes(k)
        ) &&
        norm === "item desc"
      ) {
        autoMapped = original;
        confidence = "high";
        break;
      }

      /* ---------- ORDER QUANTITY ---------- */
      if (
        ["qty", "quantity", "order qty"].some(k =>
          fieldNorm.includes(k)
        ) &&
        norm === "order qty"
      ) {
        autoMapped = original;
        confidence = "high";
        break;
      }

      /* ---------- BOX ---------- */
      if (fieldNorm.includes("box") && norm === "box") {
        autoMapped = original;
        confidence = "high";
        break;
      }

      /* ---------- PACK ---------- */
      if (
        ["pack", "packing"].some(k => fieldNorm.includes(k)) &&
        norm === "pack"
      ) {
        autoMapped = original;
        confidence = "high";
        break;
      }

      /* ---------- SAP CODE ---------- */
      if (
        ["sap", "item code", "code"].some(k =>
          fieldNorm.includes(k)
        ) &&
        norm === "sap code"
      ) {
        autoMapped = original;
        confidence = "medium";
        break;
      }

      /* ---------- DVN ---------- */
      if (fieldNorm.includes("dvn") && norm === "dvn") {
        autoMapped = original;
        confidence = "medium";
        break;
      }
    }

    return {
      ...field,
      autoMapped,
      confidence,
    };
  });
};