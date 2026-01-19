import XLSX from "xlsx-js-style";

import crypto from "crypto";
import MasterOrder from "../models/masterOrder.js";
import CustomerMaster from "../models/customerMaster.js";
import ProductMaster from "../models/productMaster.js";

import { readExcelSheets } from "../utils/readExcels.js";

/* ===============================
   HELPERS
================================ */

const normalize = v =>
  String(v || "").trim().toUpperCase();

const getValue = (row, keywords) => {
  const keys = Object.keys(row);
  // 1. Try exact match first
  for (const kw of keywords) {
    const exact = keys.find(k => k === kw);
    if (exact) return row[exact];
  }
  // 2. Try includes match
  const entry = Object.entries(row).find(([k]) =>
    keywords.some(kw => k.includes(kw))
  );
  return entry ? entry[1] : undefined;
};

/* ===============================
   MASTER UPLOAD SERVICE
================================ */

export async function uploadMasterExcel(buffer, orderCycle = "default") {
  const sheets = readExcelSheets(buffer);

  const customerRows =
    sheets["customer db"] ||
    sheets["customer master"] ||
    Object.entries(sheets).find(([k]) => k.includes("customer"))?.[1] ||
    [];

  if (customerRows.length > 0) {
    console.log("🧪 Customer Row 0 Keys:", Object.keys(customerRows[0]));
  }

  const orderRows =
    sheets["product db"] ||
    sheets["product master"] ||
    sheets["sheet3"] ||
    Object.entries(sheets).find(([k]) => k.includes("product") || k.includes("sap"))?.[1] ||
    [];

  console.log("🧪 Sheets found:", Object.keys(sheets));
  console.log("🧪 Customer rows:", customerRows.length);
  console.log("🧪 Order rows:", orderRows.length);

  const stats = {
    customers: { inserted: 0, updated: 0 },
    products: { inserted: 0, updated: 0 },
    masterOrders: { inserted: 0, updated: 0 },
    skipped: 0
  };

  /* ================= CUSTOMERS ================= */
  const customerOps = customerRows.map(r => {
    const customerCode = getValue(r, ["customer code", "code", "sap", "cust"])?.toString().trim();
    const customerName = getValue(r, ["customer name", "name"])?.toString().trim();

    if (!customerCode || !customerName) return null;

    return {
      updateOne: {
        filter: { customerCode },
        update: {
          $set: {
            customerCode,
            customerType: getValue(r, ["type"]) || "",
            customerName,
            address1: getValue(r, ["address 1", "addr 1"]) || "",
            address2: getValue(r, ["address 2", "addr 2"]) || "",
            address3: getValue(r, ["address 3", "addr 3"]) || "",
            city: getValue(r, ["city"]) || "",
            pinCode: getValue(r, ["pin", "zip"]) || "",
            state: getValue(r, ["state"]) || "",
            contactPerson: getValue(r, ["contact"]) || "",
            phoneNo1: getValue(r, ["phone 1", "phone1"]) || "",
            phoneNo2: getValue(r, ["phone 2", "phone2"]) || "",
            mobileNo: getValue(r, ["mobile"]) || "",
            drugLicNo: getValue(r, ["drug lic no", "dl no"]) || "",
            drugLicFromDt: getValue(r, ["from dt"]) || "",
            drugLicToDt: getValue(r, ["to dt"]) || "",
            drugLicNo1: getValue(r, ["drug lic no1", "dl no1"]) || "",
            drugLicFromDt1: getValue(r, ["from dt1"]) || "",
            drugLicToDt1: getValue(r, ["to dt1"]) || "",
            gstNo: getValue(r, ["gst"]) || "",
            email: getValue(r, ["email", "e mail"]) || ""
          }
        },
        upsert: true
      }
    };
  }).filter(Boolean);

  if (customerOps.length > 0) {
    const res = await CustomerMaster.bulkWrite(customerOps, { ordered: false });
    stats.customers.inserted = res.upsertedCount;
    stats.customers.updated = res.modifiedCount;
  }

  /* ================= PRODUCTS & MASTER ORDERS ================= */
  const productOps = [];
  const masterOrderOps = [];

  for (const r of orderRows) {
    const productCode = normalize(getValue(r, ["sap code", "sapcode", "code"]));
    const itemdesc    = normalize(getValue(r, ["item desc", "itemdesc"]));
    
    if (!productCode || !itemdesc) {
      stats.skipped++;
      continue;
    }

    const dvn     = normalize(getValue(r, ["dvn", "division"]));
    const pack    = Number(getValue(r, ["pack"]) || 0);
    const boxPack = Number(getValue(r, ["box pack", "boxpack"]) || 0);
    const qty     = Number(getValue(r, ["qty", "order qty"]) || 0);

    // Product Master Ops
    productOps.push({
      updateOne: {
        filter: { productCode },
        update: {
          $set: {
            productCode,
            productName: itemdesc,
            division: dvn,
            pack,
            boxPack
          }
        },
        upsert: true
      }
    });

    // Master Order Ops
    masterOrderOps.push({
      updateOne: {
        filter: { productCode, division: dvn },
        update: {
          $set: {
            productCode,
            itemdesc,
            division: dvn,
            pack,
            boxPack,
            lastUpdated: new Date()
          },
          ...(qty > 0 && { $inc: { orderQty: qty } }),
          $setOnInsert: { isActive: true }
        },
        upsert: true
      }
    });
  }

  if (productOps.length > 0) {
    const res = await ProductMaster.bulkWrite(productOps, { ordered: false });
    stats.products.inserted = res.upsertedCount;
    stats.products.updated = res.modifiedCount;
  }

  if (masterOrderOps.length > 0) {
    const res = await MasterOrder.bulkWrite(masterOrderOps, { ordered: false });
    stats.masterOrders.inserted = res.upsertedCount;
    stats.masterOrders.updated = res.modifiedCount;
  }

  console.log(`✅ Master Sync: 
    Customers: ${stats.customers.inserted} ins, ${stats.customers.updated} upd
    Products:  ${stats.products.inserted} ins, ${stats.products.updated} upd
    Orders:    ${stats.masterOrders.inserted} ins, ${stats.masterOrders.updated} upd
    Skipped:   ${stats.skipped}`);

  return {
    inserted: stats.customers.inserted + stats.products.inserted + stats.masterOrders.inserted,
    updated: stats.customers.updated + stats.products.updated + stats.masterOrders.updated,
    skipped: stats.skipped,
    details: stats
  };
}

export default { uploadMasterExcel };