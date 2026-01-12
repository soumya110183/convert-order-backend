import mongoose from "mongoose";

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

    code: {
      type: String, // Customer code
      trim: true,
      index: true,
    },

    sapcode: {
      type: String,
      trim: true,
      index: true,
    },

    dvn: {
      type: String,
      trim: true,
    },

    // Product info
    itemdesc: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    pack: {
      type: Number,
      default: 0,
    },

    boxPack: {
      type: Number,
      default: 0,
    },

    /* ======================
       AGGREGATED METRICS
    ====================== */

    // Total quantity across all uploads
    orderqty: {
      type: Number,
      default: 0,
    },

    // Number of uploads contributing to this row
    uploadCount: {
      type: Number,
      default: 1,
    },

    /* ======================
       DEDUPLICATION TRACKING
    ====================== */

    // All upload IDs that contributed to this master row
    sourceUploads: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderUpload",
        index: true,
      },
    ],




    // Last upload that updated this row
    lastUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderUpload",
      index: true,
    },

    lastUpdatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /* ======================
       QUALITY & AI SIGNALS
    ====================== */

    confidence: {
      type: Number, // optional AI confidence (0–100)
      min: 0,
      max: 100,
    },

    isManuallyEdited: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* ======================
   UNIQUE DEDUP INDEX
====================== */

// Prevent duplicate customer + item rows
masterOrderSchema.index(
  { customerName: 1, itemdesc: 1 },
  { unique: true }
);



/* ======================
   SAFE EXPORT
====================== */

export default mongoose.models.MasterOrder ||
  mongoose.model("MasterOrder", masterOrderSchema);
