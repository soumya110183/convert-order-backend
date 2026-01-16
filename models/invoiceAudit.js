import mongoose from "mongoose";

/**
 * INVOICE AUDIT MODEL
 * Tracks all invoice uploads and master updates
 * Provides complete audit trail for compliance
 */

const invoiceAuditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    userEmail: {
      type: String,
      required: true
    },

    fileName: {
      type: String,
      required: true
    },

    fileHash: {
      type: String,
      required: true,
      unique: true
    },

    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING"
    },

    // Updates made to master database
    updatesApplied: [{
      masterOrderId: mongoose.Schema.Types.ObjectId,
      itemdesc: String,
      customerName: String,
      oldQty: Number,
      newQty: Number,
      updatedAt: Date
    }],

    // Items that couldn't be matched
    unmatchedItems: [{
      rawItemDesc: String,
      quantity: Number,
      reason: String
    }],

    stats: {
      totalItems: Number,
      matched: Number,
      unmatched: Number,
      qtyUpdated: Number
    },

    processingTimeMs: Number,
    errorMessage: String
  },
  {
    timestamps: true,
    collection: "invoice_audits"
  }
);

invoiceAuditSchema.index({ userId: 1, createdAt: -1 });
invoiceAuditSchema.index({ status: 1 });

export default mongoose.models.InvoiceAudit || mongoose.model("InvoiceAudit", invoiceAuditSchema);