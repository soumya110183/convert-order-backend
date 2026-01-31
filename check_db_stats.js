import mongoose from "mongoose";
import OrderUpload from "./models/orderUpload.js";
import User from "./models/User.js";

const MONGO_URI = "mongodb+srv://harithpradeepan_db_user:NNhpSaMxsRZ6DWTz@cluster0.v6to1mq.mongodb.net/?appName=Cluster0";

const checkStats = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("CONNECTED_TO_DB");

    const totalUsers = await User.countDocuments({});
    const totalUploads = await OrderUpload.countDocuments({});
    const totalConverted = await OrderUpload.countDocuments({ status: "CONVERTED" });
    const totalFailed = await OrderUpload.countDocuments({ status: "FAILED" });
    const totalExtracted = await OrderUpload.countDocuments({ status: "EXTRACTED" });

    console.log(`TOTAL_USERS: ${totalUsers}`);
    console.log(`TOTAL_UPLOADS: ${totalUploads}`);
    console.log(`TOTAL_CONVERTED: ${totalConverted}`);
    console.log(`TOTAL_FAILED: ${totalFailed}`);
    console.log(`TOTAL_EXTRACTED: ${totalExtracted}`);

    console.log("--- USER BREAKDOWN ---");
    const userStats = await OrderUpload.aggregate([
        { $match: { status: "CONVERTED" } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { 
            $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "userDetails"
            }
        },
        {
            $project: {
                count: 1,
                email: { $arrayElemAt: ["$userDetails.email", 0] },
                name: { $arrayElemAt: ["$userDetails.name", 0] }
            }
        }
    ]);
    
    userStats.forEach(s => {
        console.log(`User: ${s.email || "Unknown"} | Conversions: ${s.count}`);
    });

    console.log("DONE");
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
};

checkStats();
