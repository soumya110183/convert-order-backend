import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { normalizeKey } from "../utils/normalizeKey.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(
  __dirname,
  "../src/templates",
  "Order Training.xlsx"
);

let TRAINING_COLUMNS = [];

export const initTrainingTemplate = async () => {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.warn("⚠️ Training template missing, skipping initialization");
    return; // ⬅️ DO NOT crash production
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(1);

  TRAINING_COLUMNS = headerRow.values
    .slice(1)
    .map(v => normalizeKey(String(v)))
    .filter(Boolean);

  console.log("✅ Training template loaded:", TRAINING_COLUMNS);
};

export const getTrainingColumns = () => {
  if (!TRAINING_COLUMNS.length) {
    throw new Error("Training template not initialized");
  }
  return TRAINING_COLUMNS;
};