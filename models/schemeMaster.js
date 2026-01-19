import mongoose from "mongoose";

/* ===============================
   SCHEME SLAB SUB-SCHEMA
================================ */
const schemeSlabSchema = new mongoose.Schema(
  {
    minQty: {
      type: Number,
      required: true
    },
    freeQty: {
      type: Number,
      default: 0
    },
    schemePercent: {
      type: Number,
      default: 0
    }
  },
  { _id: false } // ✅ prevents auto _id for slabs
);

/* ===============================
   SCHEME MASTER SCHEMA
================================ */
const schemeMasterSchema = new mongoose.Schema(
  {
    productCode: {
      type: String,
      required: true,
      index: true
    },

    productName: {
      type: String
    },

    division: {
      type: String,
      index: true
    },

    // ✅ MULTI-SLAB SUPPORT
    slabs: {
      type: [schemeSlabSchema],
      default: []
    },

    applicableFrom: Date,
    applicableTo: Date,

    isActive: {
      type: Boolean,
      default: true
    },

    applicableCustomers: [String]
  },
  {
    timestamps: true,
    collection: "schemes" // ✅ force correct collection
  }
);

/* ===============================
   UNIQUE PRODUCT + DIVISION
================================ */
schemeMasterSchema.index(
  { productCode: 1, division: 1 },
  { unique: true }
);

export default mongoose.models.SchemeMaster ||
  mongoose.model("SchemeMaster", schemeMasterSchema);
