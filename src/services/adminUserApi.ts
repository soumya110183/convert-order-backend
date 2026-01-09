import api from "./api"; // your axios instance

export const adminUsersApi = {
  getUsers: (search = "") =>
    api.get(`/admin/users?search=${search}`),

  addUser: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    status: string;
  }) =>
    api.post("/admin/users", data),

  updateRole: (id: string, role: string) =>
    api.put(`/admin/users/${id}/role`, { role }),

  toggleStatus: (id: string) =>
    api.put(`/admin/users/${id}/status`),
};
