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

    try {
      const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      const logoSrc = `${window.location.origin}/logo.png`;

      // Build header rows
      let theadHTML = "";
      if (headerGroups && headerGroups.length > 0) {
        theadHTML += "<tr>";
        for (const grp of headerGroups) {
          theadHTML += `<th colspan="${grp.colSpan}" style="border:1px solid #000;padding:6px 8px;font-size:11px;text-align:center;">${grp.label}</th>`;
        }
        theadHTML += "</tr>";
      }
      theadHTML += "<tr>";
      for (const col of columns) {
        theadHTML += `<th style="border:1px solid #000;padding:6px 8px;font-size:10px;text-align:center;white-space:nowrap;">${col.label}</th>`;
      }
      theadHTML += "</tr>";

      // Build body rows
      let tbodyHTML = "";
      data.forEach((row) => {
        const rowType = row.__rowType as string | undefined;
        const bold = rowType === "grand-total" || rowType === "group-total";
        tbodyHTML += "<tr>";
        for (const col of columns) {
          const val = row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : "—";
          tbodyHTML += `<td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;${bold ? "font-weight:bold;" : ""}">${val}</td>`;
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
    @font-face {
      font-family: 'CairoLocal';
      src: url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype');
      font-display: swap;
    }
    @font-face {
      font-family: 'AmiriLocal';
      src: url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype');
      font-display: swap;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'CairoLocal', 'AmiriLocal', sans-serif;
      direction: rtl;
      padding: 20px;
      color: #000;
      background: #fff;
    }
    @media print {
      @page { size: auto; margin: 10mm; }
      body { padding: 0; }
    }
    .header {
      text-align: center;
      margin-bottom: 15px;
      border-bottom: 1px solid #000;
      padding-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .logo {
      width: 36px;
      height: 36px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 2px; }
    .header p { font-size: 11px; color: #000; }
    table { width: 100%; border-collapse: collapse; }
    .footer {
      text-align: center;
      margin-top: 15px;
      font-size: 9px;
      color: #000;
      border-top: 1px solid #000;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>${title}</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <table>
    <thead>${theadHTML}</thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function () {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      } catch (e) {}
      window.print();
      window.onafterprint = function() { window.close(); };
    })();
  </script>
</body>
</html>`;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(printHTML);
        printWindow.document.close();
      }
    } finally {
      setLoading(false);
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={loading}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
      طباعة
    </Button>
  );
};
