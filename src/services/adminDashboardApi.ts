import api from "./api";

export const fetchAdminDashboard = async () => {
  const res = await api.get("/admin/dashboard");
  return res.data;
};
