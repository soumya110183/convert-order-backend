import mongoose from "mongoose";

/**
 * @deprecated
 * THIS MODEL IS DEPRECATED as of Refactor v2.0
 * DO NOT USE FOR NEW BUSINESS LOGIC.
 * Maintained only for historical data reference if absolutely needed.
 * Use CustomerMaster for aggregated data.
 */

const masterOrderSchema = new mongoose.Schema(
  {
    /* ======================
       CORE BUSINESS KEYS
    ====================== */

    // Customer info
    customerName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Unique Deduplication Key: MD5(customerName + itemdesc)
    dedupKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    // ... remaining fields retained for schema compatibility but unused ...
  },
  {
    timestamps: true,
    strict: false // Allow whatever was there
  }
);

export default mongoose.models.MasterOrder ||
  mongoose.model("MasterOrder", masterOrderSchema);