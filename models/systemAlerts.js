// models/SystemAlert.js
import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["error", "warning", "info"],
      required: true,
      index: true,
    },

    message: {
      type: String,
      required: true,
    },

    affectedCount: {
      type: Number,
      default: 1,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

export default mongoose.model("SystemAlert", alertSchema);
