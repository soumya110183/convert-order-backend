import mongoose from "mongoose";

const schemeMasterSchema = new mongoose.Schema({
  productCode: { type: String, required: true, index: true },
  productName: { type: String, index: true },
  division: String,
  
  // Quantity-based scheme
  minQty: Number,    // Minimum quantity to qualify
  freeQty: Number,   // Free quantity given
  
  // Percentage-based scheme
  schemePercent: Number,  // 0.2 = 20% free
  
  // Additional fields for better matching
  applicableFrom: Date,
  applicableTo: Date,
  isActive: { type: Boolean, default: true },
  
  // For customer-specific schemes (optional)
  applicableCustomers: [String]
}, {
  timestamps: true
});

schemeMasterSchema.index(
  { productCode: 1, division: 1 },
  { unique: true }
);


export default mongoose.models.SchemeMaster ||
  mongoose.model("SchemeMaster", schemeMasterSchema);