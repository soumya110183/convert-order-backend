import api from "./api";

export const masterDataApi = {
  uploadCustomers(file: File) {
    const form = new FormData();
    form.append("file", file);

    return api.post("/admin/customers/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadProducts(file: File) {
    const form = new FormData();
    form.append("file", file);

    return api.post("/admin/products/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  addCustomer(payload: { customerCode?: string; customerName: string }) {
    return api.post("/admin/customers/add", payload);
  },

  addProduct(payload: {
    productCode: string;
    productName: string;
    division?: string;
  }) {
    return api.post("/admin/products/add", payload);
  },

  transferProduct(payload: {
    productCode: string;
    newDivision: string;
  }) {
    return api.patch("/admin/products/transfer", payload);
  },

  getProducts(search?: string) {
    return api.get("/admin/products", { params: { search } });
  },

  getCustomers(search?: string) {
    return api.get("/admin/customers", { params: { search } });
  },

  updateProduct(payload: any) {
    return api.put("/admin/products/update", payload);
  },

  update(id: string, payload: any) {
    return api.put(`/admin/master-data/${id}`, payload);
  },
};
