import mongoose from "mongoose";

const masterOrderSchema = new mongoose.Schema(
  {
    productCode: {
      type: String,
      required: true,
      uppercase: true,
      index: true
    },

    itemdesc: {
      type: String,
      uppercase: true,
      index: true
    },

    division: {
      type: String,
      uppercase: true,
      index: true
    },

    pack: {
      type: Number,
      default: 0
    },

    boxPack: {
      type: Number,
      default: 0
    },

    orderQty: {
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: "master_orders"
  }
);

/* ✅ Compound index for fast lookups */
masterOrderSchema.index({ productCode: 1, division: 1 });

export default mongoose.models.MasterOrder ||
  mongoose.model("MasterOrder", masterOrderSchema);
