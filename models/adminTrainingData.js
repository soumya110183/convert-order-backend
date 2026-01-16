import mongoose from "mongoose";

const AdminTrainingDataSchema = new mongoose.Schema(
  {
    rowHash: { type: String, unique: true, index: true }, // 🔑 DEDUP
    sourceFileHash: { type: String, index: true },

    code: String,
    customerName: String,
    sapcode: String,
    itemdesc: String,
    orderqty: Number,
    boxPack: Number,
    pack: Number,
    dvn: String,

    createdFromUpload: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderUpload",
    },
  },
  { timestamps: true }
);

export default mongoose.model("AdminTrainingData", AdminTrainingDataSchema);
