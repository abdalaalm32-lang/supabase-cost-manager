import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import type { ExportColumn } from "@/lib/exportUtils";

interface PrintButtonProps {
  data: Record<string, any>[];
  columns: ExportColumn[];
  title: string;
  headerGroups?: { label: string; colSpan: number }[];
}

export const PrintButton: React.FC<PrintButtonProps> = ({ data, columns, title, headerGroups }) => {
  const [loading, setLoading] = useState(false);

  const handlePrint = () => {
    if (!data || data.length === 0) return;
    setLoading(true);

    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

    // Build header rows
    let theadHTML = "";
    if (headerGroups && headerGroups.length > 0) {
      theadHTML += "<tr>";
      for (const grp of headerGroups) {
        theadHTML += `<th colspan="${grp.colSpan}" style="border:1px solid #333;padding:6px 8px;background:#222;color:#fff;font-size:11px;text-align:center;">${grp.label}</th>`;
      }
      theadHTML += "</tr>";
    }
    theadHTML += "<tr>";
    for (const col of columns) {
      theadHTML += `<th style="border:1px solid #333;padding:6px 8px;background:#444;color:#fff;font-size:10px;text-align:center;white-space:nowrap;">${col.label}</th>`;
    }
    theadHTML += "</tr>";

    // Build body rows
    let tbodyHTML = "";
    data.forEach((row, idx) => {
      const rowType = row.__rowType as string | undefined;
      const bg = rowType === "grand-total" ? "#ddd" : rowType === "group-total" ? "#e8e8e8" : idx % 2 === 0 ? "#fff" : "#f5f5f5";
      const bold = rowType === "grand-total" || rowType === "group-total";
      tbodyHTML += `<tr style="background:${bg};">`;
      for (const col of columns) {
        const val = row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : "—";
        tbodyHTML += `<td style="border:1px solid #ccc;padding:4px 6px;font-size:10px;text-align:center;${bold ? "font-weight:bold;" : ""}">${val}</td>`;
      }
      tbodyHTML += "</tr>";
    });

    const printHTML = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; color: #000; background: #fff; }
    @media print {
      @page { size: auto; margin: 10mm; }
      body { padding: 0; }
    }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .header p { font-size: 11px; color: #555; }
    table { width: 100%; border-collapse: collapse; }
    .footer { text-align: center; margin-top: 15px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <p>Cost Management System • ${dateStr}</p>
  </div>
  <table>
    <thead>${theadHTML}</thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
    setLoading(false);
  };

  if (!data || data.length === 0) return null;

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={loading}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
      طباعة
    </Button>
  );
};
