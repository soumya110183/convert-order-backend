import mongoose from "mongoose";

const productMasterSchema = new mongoose.Schema(
  {
    productCode: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
      index: true
    },

    productName: {
      type: String,
      required: true,
      uppercase: true
    },

    division: {
      type: String,
      uppercase: true,
      index: true
    },

    boxPack: { type: Number, default: 0 },
    pack: { type: Number, default: 0 }
  },
  {
    timestamps: true,
    collection: "products" // 🔒 LOCKED
  }
);

export default mongoose.models.ProductMaster ||
  mongoose.model("ProductMaster", productMasterSchema);
