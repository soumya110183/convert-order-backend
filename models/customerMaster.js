import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },

    customerName: {
      type: String,
      required: true, // Made required
      uppercase: true,
      trim: true
    },

    totalOrderQty: {
      // Aggregated quantity from all orders
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.models.CustomerMaster || mongoose.model("CustomerMaster", customerSchema);
