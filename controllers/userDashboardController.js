import OrderUpload from "../models/orderUpload.js";

/* =====================================================
   USER DASHBOARD
   GET /api/user/dashboard
===================================================== */
export const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [
      totalUploads,
      successCount,
      failedCount,
      recordsProcessedAgg,
      recentUploads
    ] = await Promise.all([
      OrderUpload.countDocuments({ userId }),
      OrderUpload.countDocuments({ userId, status: "CONVERTED" }),
      OrderUpload.countDocuments({ userId, status: "FAILED" }),

      OrderUpload.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$recordsProcessed", 0] } }
          }
        }
      ]),

      OrderUpload.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("fileName createdAt status recordsProcessed")
        .lean()
    ]);

    res.json({
      success: true,
      stats: {
        totalUploads,
        successCount,
        failedCount,
        recordsProcessed: recordsProcessedAgg[0]?.total || 0
      },
      recentUploads: recentUploads.map(u => ({
        id: u._id,
        fileName: u.fileName,
        uploadDate: u.createdAt,
        status: u.status,
        recordsProcessed: u.recordsProcessed || 0
      }))
    });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   USER MENU
   GET /api/user/menu
===================================================== */
export const getMenu = async (req, res) => {
  try {
    const role = req.user?.role || "user";

    const menus = {
      user: [
        { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
        { id: "upload", label: "Upload Order", icon: "Upload" },
        { id: "history", label: "Order History", icon: "History" }
      ],
      admin: [
        { id: "admin-dashboard", label: "Dashboard", icon: "LayoutDashboard" },
        { id: "user-access", label: "User Access", icon: "Users" }
      ]
    };

    res.status(200).json(menus[role] || menus.user);

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load menu"
    });
  }
};

export default {
  getUserDashboard,
  getMenu
};
