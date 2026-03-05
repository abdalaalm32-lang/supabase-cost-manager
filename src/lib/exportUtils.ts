import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Extend jsPDF with autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportOptions {
  title: string;
  filename: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
}

const PRIMARY_COLOR: [number, number, number] = [14, 165, 233]; // hsl(199, 89%, 48%) ≈ #0EA5E9
const HEADER_BG: [number, number, number] = [14, 165, 233];
const HEADER_TEXT: [number, number, number] = [255, 255, 255];
const ALT_ROW: [number, number, number] = [241, 245, 249];

export function exportToExcel({ title, filename, columns, data }: ExportOptions) {
  const headers = columns.map((c) => c.label);
  const rows = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      return val !== null && val !== undefined ? String(val) : "—";
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths
  ws["!cols"] = columns.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map((r) => String(r[i] || "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });

  // Style header cells
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) {
      ws[addr].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { fgColor: { rgb: "0EA5E9" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "0EA5E9" } },
          bottom: { style: "thin", color: { rgb: "0EA5E9" } },
        },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportToPDF({ title, filename, columns, data }: ExportOptions) {
  const doc = new jsPDF({
    orientation: columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  // Load logo
  let logoImg: string | null = null;
  try {
    const response = await fetch("/logo.png");
    const blob = await response.blob();
    logoImg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Logo not available, continue without it
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header background
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 32, "F");

  // Logo
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", pageWidth - 35, 4, 24, 24);
    } catch {
      // Skip logo on error
    }
  }

  // System name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Cost Management System", 14, 10);

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 20);

  // Date
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const dateStr = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(dateStr, 14, 27);

  // Table
  const headers = columns.map((c) => c.label);
  const rows = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      return val !== null && val !== undefined ? String(val) : "—";
    })
  );

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 38,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      halign: "center",
      valign: "middle",
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: HEADER_TEXT,
      fontSize: 9,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: ALT_ROW,
    },
    margin: { top: 38, right: 10, bottom: 25, left: 10 },
    didDrawPage: (data: any) => {
      // Footer on every page
      const pageNum = doc.internal.pages.length - 1;
      doc.setFillColor(245, 245, 245);
      doc.rect(0, pageHeight - 15, pageWidth, 15, "F");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Powered by Mohamed Abdel Aal`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );
      doc.text(
        `Page ${data.pageNumber}`,
        pageWidth - 15,
        pageHeight - 8,
        { align: "center" }
      );
    },
  });

  doc.save(`${filename}.pdf`);
}
