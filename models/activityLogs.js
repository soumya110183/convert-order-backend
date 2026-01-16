// models/ActivityLog.js
import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    userEmail: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      enum: [
        "UPLOAD_STARTED",
        "UPLOAD_FAILED",
        "EXTRACTION_STARTED",
        "EXTRACTION_FAILED",
        "CONVERSION_STARTED",
        "CONVERSION_COMPLETED",
      ],
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed, // flexible debugging data
    },
  },
  { timestamps: true }
);

export default mongoose.model("ActivityLog", activitySchema);
