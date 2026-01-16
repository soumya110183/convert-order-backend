import mongoose from "mongoose";

const schemeMasterSchema = new mongoose.Schema(
  {
    productName: { 
      type: String, 
      required: true, 
      uppercase: true, 
      trim: true,
      index: true 
    },
    minQty: { type: Number, default: 0 },
    freeQty: { type: Number, default: 0 },
    schemePercent: { type: Number, default: 0 },
    division: { type: String, uppercase: true, trim: true }
  },
  {
    timestamps: true,
    collection: "schemes"
  }
);

// Compound index to ensure uniqueness per product
schemeMasterSchema.index({ productName: 1 }, { unique: true });

export default mongoose.models.SchemeMaster ||
  mongoose.model("SchemeMaster", schemeMasterSchema);