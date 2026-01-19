import mongoose from "mongoose";

const orderUploadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    fileName: String,
    fileType: String,

    fileHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    extractedData: {
      type: mongoose.Schema.Types.Mixed,
    },
convertedData: {
  headers: {
    type: [String],
    default: [],
  },
  rows: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
},

    status: {
      type: String,
      enum: ["UPLOADED", "EXTRACTED", "CONVERTED", "FAILED"],
      default: "UPLOADED",
      index: true,
    },

    schemeSummary: {
  count: {
    type: Number,
    default: 0
  },
  totalFreeQty: {
    type: Number,
    default: 0
  }
},

schemeDetails: [
  {
    productCode: String,
    productName: String,
    orderQty: Number,
    freeQty: Number,
    schemePercent: Number,
    division: String
  }
],


    recordsProcessed: { type: Number, default: 0 },
    recordsFailed: { type: Number, default: 0 },

    outputFile: String,
    extractionMeta: mongoose.Schema.Types.Mixed,
    processingTimeMs: Number,

    rowErrors: [
      {
        rowNumber: Number,
        field: String,
        error: String,
        originalValue: String,
        suggestedFix: String,
      },
    ],

    rowWarnings: [
      {
        rowNumber: Number,
        field: String,
        warning: String,
        originalValue: String,
        newValue: String,
      },
    ],

    errorCode: String,
    errorMessage: String,
  },
  
  { timestamps: true }
);

// ✅ SAFE EXPORT (prevents overwrite error)
export default mongoose.models.OrderUpload ||
  mongoose.model("OrderUpload", orderUploadSchema);