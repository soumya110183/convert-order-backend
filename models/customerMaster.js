import mongoose from "mongoose";

const customerMasterSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },

    customerType: String,

    customerName: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },

    address1: String,
    address2: String,
    address3: String,
    city: String,
    pinCode: String,
    state: String,
    contactPerson: String,
    phoneNo1: String,
    phoneNo2: String,
    mobileNo: String,
    drugLicNo: String,
    drugLicFromDt: String,
    drugLicToDt: String,
    drugLicNo1: String,
    drugLicFromDt1: String,
    drugLicToDt1: String,
    gstNo: String,

    email: {
      type: String,
      lowercase: true,
      trim: true
    },

    totalOrderQty: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    collection: "customers" // 🔒 LOCKED
  }
);

export default mongoose.models.CustomerMaster ||
  mongoose.model("CustomerMaster", customerMasterSchema);