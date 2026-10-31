import fs from "fs";

const file = "C:/Users/User/convert-order/src/components/pages/MappingPage.tsx";
let content = fs.readFileSync(file, "utf8");

// 1. Update debounced search to restore candidates if input is empty
const oldSearch = `  /* ---------------- CUSTOMER SEARCH (DEBOUNCED) ---------------- */
  useEffect(() => {
    if (activeFileEdit === null) return;
    if (!customerInput || customerInput.length < 2) {
      setCustomers([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      api
        .get("/admin/customers", { params: { search: customerInput, limit: 100 } })
        .then(res => setCustomers(res.data?.data || []))
        .catch(() => setCustomers([]))
        .finally(() => setSearching(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [customerInput, activeFileEdit]);`;

const newSearch = `  /* ---------------- CUSTOMER SEARCH (DEBOUNCED) ---------------- */
  useEffect(() => {
    if (activeFileEdit === null) return;
    if (!customerInput || customerInput.trim().length < 2) {
      // If search is cleared/empty, show candidate suggestions from invoice match
      const candidates = filesData[activeFileEdit]?.customer?.candidates || [];
      if (candidates.length > 0) {
        setCustomers(candidates.map((c: any) => c.customer || c));
      } else {
        setCustomers([]);
      }
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      api
        .get("/admin/customers", { params: { search: customerInput.trim(), limit: 50 } })
        .then(res => setCustomers(res.data?.data || []))
        .catch(() => setCustomers([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [customerInput, activeFileEdit]);`;

// 2. Update startEditingCustomer
const oldStartEdit = `  const startEditingCustomer = (fileIndex: number) => {
      setActiveFileEdit(fileIndex);
      setCustomerInput(filesData[fileIndex].customer.name || "");
      setCustomers([]);
      // If we have candidates stored, maybe show them?
      // For simplicity, just let user search fresh or see input.
      if (filesData[fileIndex].customer.candidates?.length > 0) {
           setCustomers(filesData[fileIndex].customer.candidates.map((c: any) => c.customer || c));
      }
  };`;

const newStartEdit = `  const startEditingCustomer = (fileIndex: number) => {
      setActiveFileEdit(fileIndex);
      const candidates = filesData[fileIndex]?.customer?.candidates || [];
      if (candidates.length > 0) {
        setCustomers(candidates.map((c: any) => c.customer || c));
        setCustomerInput(""); // Keep blank so candidates are immediately visible
      } else {
        setCustomerInput("");
        setCustomers([]);
      }
  };`;

// 3. Update init useEffect to auto-open if customer code is missing
const oldInitEnd = `        setFilesData(filesMetadata);
        setRows(allRows);
        setUploadId(multiFileResults[0].uploadId); // Use first as primary

    } else if (parsedResult?.dataRows) {
        // Legacy Single File
        const sanitized = sanitizeRows(parsedResult.dataRows, 0);
        setFilesData([{
            fileName: location.state?.fileName || "Uploaded File",
            uploadId: parsedResult.uploadId,
            customer: parsedResult.customer
        }]);
        setRows(sanitized);
        setUploadId(parsedResult.uploadId);
    } else {`;

const newInitEnd = `        setFilesData(filesMetadata);
        setRows(allRows);
        setUploadId(multiFileResults[0].uploadId); // Use first as primary

        // Auto-open selection if any file has unconfirmed/missing customer
        const unconfirmedIdx = filesMetadata.findIndex(f => !f.customer?.code);
        if (unconfirmedIdx !== -1) {
          setActiveFileEdit(unconfirmedIdx);
          const candidates = filesMetadata[unconfirmedIdx].customer?.candidates || [];
          if (candidates.length > 0) {
            setCustomers(candidates.map((c: any) => c.customer || c));
          }
        }

    } else if (parsedResult?.dataRows) {
        // Legacy Single File
        const sanitized = sanitizeRows(parsedResult.dataRows, 0);
        const cust = parsedResult.customer || {};
        setFilesData([{
            fileName: location.state?.fileName || "Uploaded File",
            uploadId: parsedResult.uploadId,
            customer: cust
        }]);
        setRows(sanitized);
        setUploadId(parsedResult.uploadId);

        // Auto-open if unconfirmed
        if (!cust.code) {
          setActiveFileEdit(0);
          const candidates = cust.candidates || [];
          if (candidates.length > 0) {
            setCustomers(candidates.map((c: any) => c.customer || c));
          }
        }
    } else {`;

content = content.replace(/\r\n/g, "\n");

let updated = 0;
if (content.includes(oldSearch.replace(/\r\n/g, "\n"))) {
  content = content.replace(oldSearch.replace(/\r\n/g, "\n"), newSearch);
  updated++;
}
if (content.includes(oldStartEdit.replace(/\r\n/g, "\n"))) {
  content = content.replace(oldStartEdit.replace(/\r\n/g, "\n"), newStartEdit);
  updated++;
}
if (content.includes(oldInitEnd.replace(/\r\n/g, "\n"))) {
  content = content.replace(oldInitEnd.replace(/\r\n/g, "\n"), newInitEnd);
  updated++;
}

fs.writeFileSync(file, content.replace(/\n/g, "\r\n"), "utf8");
console.log(`Updated ${updated}/3 parts in logic`);

