import mongoose from "mongoose";
import { splitProduct } from "../utils/splitProducts.js";

const productMasterSchema = new mongoose.Schema({
  productCode: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true
  },

  productName: { 
    type: String, 
    required: true,
    uppercase: true
  },

  baseName: { 
    type: String, 
    index: true,
    uppercase: true
  },
  
  dosage: { 
    type: String, 
    index: true 
  },
  
  variant: { 
    type: String, 
    default: "",
    uppercase: true
  },

  cleanedProductName: { 
    type: String, 
    index: true,
    uppercase: true
  },

  division: {
    type: String,
    uppercase: true
  },

  // ✅ ADD PACK AND BOX PACK FIELDS
  pack: {
    type: Number,
    default: 0,
    min: 0
  },

  boxPack: {
    type: Number,
    default: 0,
    min: 0
  }

}, { 
  timestamps: true 
});

// Pre-save hook to auto-populate fields
productMasterSchema.pre("save", function (next) {
  if (this.isModified("productName")) {
    const { name, strength, variant } = splitProduct(this.productName);

    this.baseName = name;
    this.dosage = strength || null;
    this.variant = variant || "";
    this.cleanedProductName = [name, strength, variant]
      .filter(Boolean)
      .join(" ");
  }
  next();
});

// Indexes for better query performance
productMasterSchema.index({ cleanedProductName: 1, division: 1 });
productMasterSchema.index({ baseName: 1, dosage: 1 });

export default mongoose.models.ProductMaster || 
  mongoose.model("ProductMaster", productMasterSchema);