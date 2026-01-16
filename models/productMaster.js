import mongoose from "mongoose";

const productMasterSchema = new mongoose.Schema(
  {
    productCode: {
      // SAPCODE or Derived
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },

    productName: {
      // ITEMDESC
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    division: {
      // DVN
      type: String,
      trim: true,
      uppercase: true,
      index: true // Useful for filtering
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    collection: "product_master",
    timestamps: true
  }
);

export default mongoose.models.ProductMaster || mongoose.model("ProductMaster", productMasterSchema);
