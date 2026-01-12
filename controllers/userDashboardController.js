import OrderUpload from "../models/orderUpload.js";

export const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const uploads = await OrderUpload.find({ userId });

    const totalUploads = uploads.length;
    const successCount = uploads.filter(u => u.status === "CONVERTED"
).length;
    const failedCount = uploads.filter(u => u.status === "FAILED").length;

    const recordsProcessed = uploads.reduce(
      (sum, u) => sum + (u.recordsProcessed || 0),
      0
    );

    const recentUploads = await OrderUpload.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("fileName createdAt status recordsProcessed");

    res.json({
      stats: {
        totalUploads,
        successCount,
        failedCount,
        recordsProcessed,
      },
     recentUploads: recentUploads.map(u => ({
  id: u._id,
  fileName: u.fileName,
  uploadDate: u.createdAt,
  status: u.status,
  recordsProcessed: u.recordsProcessed,
})),

    });
  } catch (err) {
    next(err);
  }
};
export const getMenu = async (req, res) => {
  try {
    const role = req.user.role;

    const menus = {
      user: [
        { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
        { id: "upload", label: "Upload Order", icon: "Upload" },
        { id: "history", label: "Order History", icon: "History" },
      ],
      admin: [
        { id: "admin-dashboard", label: "Dashboard", icon: "LayoutDashboard" },
        { id: "mapping-rules", label: "Mapping Rules", icon: "Map" },
        { id: "user-access", label: "User Access", icon: "Users" },
      ],
    };

    res.status(200).json(menus[role] || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to load menu" });
  }
};
