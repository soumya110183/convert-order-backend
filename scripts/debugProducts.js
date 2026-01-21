
import mongoose from "mongoose";
import dotenv from "dotenv";
import ProductMaster from "../models/productMaster.js";

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const searchTerms = ["BIPACEF", "LEVOBACT", "NORDYS", "TORSINEX", "APIVAS", "DOLO", "MECONERV"];
    
    const products = await ProductMaster.find({
      $or: searchTerms.map(term => ({ productName: { $regex: term, $options: "i" } }))
    }, { productName: 1, division: 1, productCode: 1, _id: 0 }).lean();

    console.log("Found Products:");
    console.log(JSON.stringify(products, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
};

run();
