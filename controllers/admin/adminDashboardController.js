import User from "../../models/User.js";
import OrderUpload from "../../models/orderUpload.js";
import MappingRule from "../../models/mappingRules.js";
import SystemAlert from "../../models/systemAlerts.js";
import ActivityLog from "../../models/activityLogs.js";
export const getAdminDashboard = async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    admins,
    totalUploads,
    failedUploads,
    successfulUploads,
    mappingRules,
    alerts,
    recentActivity,

  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: "admin" }),

    OrderUpload.countDocuments(),
    OrderUpload.countDocuments({ status: "FAILED" }),
    OrderUpload.countDocuments({ status: "CONVERTED" }),

    MappingRule.countDocuments(),
    SystemAlert.find().sort({ createdAt: -1 }).limit(5).lean(),
    ActivityLog.find().sort({ createdAt: -1 }).limit(10).lean(),

  ]);

  const successRate =
    totalUploads === 0
      ? 100
      : ((successfulUploads / totalUploads) * 100).toFixed(1);

  res.json({
    stats: {
      totalUsers,
      activeUsers,
      admins,
      totalUploads,
      failedUploads,
      successfulUploads,
      successRate,
    },
    mappingRules,
    alerts,
    recentActivity,
  });
};
