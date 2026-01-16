// models/MappingRule.js
import mongoose from "mongoose";

const mappingRuleSchema = new mongoose.Schema(
  {
    sourceColumn: {
      type: String,
      required: true,
      trim: true,
    },

    targetColumn: {
      type: String,
      required: true,
      trim: true,
    },

    transformation: {
      type: String,
      enum: [
        "None",
        "Uppercase",
        "Lowercase",
        "Round Up",
        "Round Down",
        "Date Format",
        "Currency Format",
        "Trim Spaces",
      ],
      default: "None",
    },

    mandatory: {
      type: Boolean,
      default: false,
    },

    version: {
      type: Number,
      default: 1,
      index: true,
    },

    updatedBy: {
      type: String,
    },
  },
  { timestamps: true }
);

// prevent duplicate mapping rules
mappingRuleSchema.index(
  { sourceColumn: 1, targetColumn: 1, version: 1 },
  { unique: true }
);

export default mongoose.model("MappingRule", mappingRuleSchema);
