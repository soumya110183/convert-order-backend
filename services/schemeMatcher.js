export function applyScheme({
  productCode,
  customerCode,
  orderQty,
  schemes
}) {
  const now = new Date();

  const applicable = schemes.find(s =>
    s.isActive &&
    (!s.validFrom || now >= new Date(s.validFrom)) &&
    (!s.validTo || now <= new Date(s.validTo)) &&
    (s.applicableProducts?.includes(productCode)) &&
    (
      !s.applicableCustomers?.length ||
      s.applicableCustomers.includes(customerCode)
    ) &&
    s.buyQty > 0 &&
    s.freeQty > 0
  );

  if (!applicable) {
    return {
      schemeCode: "",
      schemeName: "",
      freeQty: 0
    };
  }

  const freeQty =
    Math.floor(orderQty / applicable.buyQty) * applicable.freeQty;

  return {
    schemeCode: applicable.schemeCode,
    schemeName: applicable.schemeName,
    freeQty
  };
}
