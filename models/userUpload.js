// models/UserUpload.js
import mongoose from "mongoose";

const userUploadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    orderUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderUpload",
      index: true,
    },
  },
  { timestamps: true }
);

userUploadSchema.index({ userId: 1, orderUploadId: 1 }, { unique: true });

export default mongoose.model("UserUpload", userUploadSchema);
