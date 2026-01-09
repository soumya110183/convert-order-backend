import api from "./api";

export const getOrderResult = async (id: string) => {
  const { data } = await api.get(`/orders/${id}`);
  return data;
};


export const downloadOrderFile = async (id: string) => {
  const res = await api.get(`/orders/download/${id}`, {
    responseType: "blob",
  });

  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "converted.xlsx";
  link.click();

  window.URL.revokeObjectURL(url);
};
