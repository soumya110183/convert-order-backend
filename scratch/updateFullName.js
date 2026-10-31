import fs from "fs";

const file = "C:/Users/User/convert-order/src/components/pages/MappingPage.tsx";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  '<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">',
  '<div className={`grid gap-4 ${filesData.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>\n'
);

content = content.replace(
  '<div className="font-semibold text-slate-800 truncate max-w-[150px]" title={file.fileName}>',
  '<div className="font-semibold text-slate-800" title={file.fileName}>'
);

content = content.replace(
  '<span className="truncate max-w-[200px]" title={file.customer.name}>',
  '<span className="font-semibold text-slate-800 group-hover:text-blue-700" title={file.customer.name}>'
);

content = content.replace(
  '<div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]" title={file.customer.name}>',
  '<div className="text-[11px] text-slate-500 mt-0.5" title={file.customer.name}>'
);

fs.writeFileSync(file, content, "utf8");
console.log("Updated full name display");

