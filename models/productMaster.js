import mongoose from "mongoose";
import { splitProduct } from "../utils/splitProducts.js";

const productMasterSchema = new mongoose.Schema({
  productCode: { type: String, required: true, unique: true },

  productName: { type: String, required: true }, // RAW

  baseName: { type: String, index: true },
  dosage: { type: String, index: true },
  variant: { type: String, default: "" },

  cleanedProductName: { type: String, index: true },

  division: String
}, { timestamps: true });

productMasterSchema.pre("save", function (next) {
  if (this.isModified("productName")) {
    const { name, strength } = splitProduct(this.productName);

    this.baseName = name;
    this.dosage = strength;
    this.variant = "";
   this.cleanedProductName = strength ? `${name} ${strength}` : name;

  }
  next();
});

productMasterSchema.index({ cleanedProductName: 1, division: 1 });

export default mongoose.model("ProductMaster", productMasterSchema);
