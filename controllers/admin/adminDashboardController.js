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
    recentUploads,
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

    OrderUpload.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("fileName userEmail status recordsProcessed recordsFailed createdAt")
      .lean(),
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
    recentUploads,
  });
};
