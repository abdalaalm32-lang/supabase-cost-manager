import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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

const PRIMARY_HEX = "0EA5E9";
const HEADER_BG_HEX = "0EA5E9";
const ALT_ROW_HEX = "F1F5F9";
const BORDER_HEX = "CBD5E1";

// ─── Excel Export (ExcelJS – supports styles + Arabic) ──────────────
export async function exportToExcel({ title, filename, columns, data }: ExportOptions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cost Management System";
  const ws = wb.addWorksheet(title.substring(0, 31));

  // RTL
  (ws as any).views = [{ rightToLeft: true }];

  // Column definitions
  ws.columns = columns.map((col, i) => {
    const maxLen = Math.max(
      col.label.length,
      ...data.map((r) => String(r[col.key] ?? "").length)
    );
    return {
      header: col.label,
      key: col.key,
      width: Math.min(Math.max(maxLen + 4, 12), 40),
    };
  });

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Arial" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${HEADER_BG_HEX}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: `FF${BORDER_HEX}` } },
      bottom: { style: "thin", color: { argb: `FF${BORDER_HEX}` } },
      left: { style: "thin", color: { argb: `FF${BORDER_HEX}` } },
      right: { style: "thin", color: { argb: `FF${BORDER_HEX}` } },
    };
  });

  // Data rows
  data.forEach((row, idx) => {
    const r = ws.addRow(columns.map((col) => row[col.key] ?? "—"));
    r.height = 22;
    r.eachCell((cell) => {
      cell.font = { size: 11, name: "Arial" };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "hair", color: { argb: `FF${BORDER_HEX}` } },
        bottom: { style: "hair", color: { argb: `FF${BORDER_HEX}` } },
        left: { style: "hair", color: { argb: `FF${BORDER_HEX}` } },
        right: { style: "hair", color: { argb: `FF${BORDER_HEX}` } },
      };
      if (idx % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${ALT_ROW_HEX}` },
        };
      }
    });
  });

  // Auto-filter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: data.length + 1, column: columns.length },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${filename}.xlsx`);
}

// ─── Helper: load font as base64 ───────────────────────────────────
async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── PDF Export (jsPDF + Arabic Amiri font) ─────────────────────────
export async function exportToPDF({ title, filename, columns, data }: ExportOptions) {
  const doc = new jsPDF({
    orientation: columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  // Load & register Arabic font
  try {
    const regularBase64 = await loadFontBase64("/fonts/Amiri-Regular.ttf");
    const boldBase64 = await loadFontBase64("/fonts/Amiri-Bold.ttf");
    doc.addFileToVFS("Amiri-Regular.ttf", regularBase64);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    doc.addFileToVFS("Amiri-Bold.ttf", boldBase64);
    doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
    doc.setFont("Amiri");
  } catch (e) {
    console.warn("Could not load Arabic font, falling back to default", e);
  }

  // Set RTL language
  doc.setLanguage("ar");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header background
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, pageWidth, 34, "F");

  // Logo
  let logoImg: string | null = null;
  try {
    const response = await fetch("/logo.png");
    const blob = await response.blob();
    logoImg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { /* no logo */ }

  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", pageWidth - 35, 5, 24, 24);
    } catch { /* skip */ }
  }

  // System name (English is fine with any font)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("Amiri", "normal");
  doc.text("Cost Management System", 14, 12);

  // Title in Arabic
  doc.setFontSize(16);
  doc.setFont("Amiri", "bold");
  doc.text(title, pageWidth - 40, 22, { align: "center" });

  // Date
  doc.setFontSize(9);
  doc.setFont("Amiri", "normal");
  const dateStr = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(dateStr, 14, 30);

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
    startY: 40,
    theme: "grid",
    styles: {
      font: "Amiri",
      fontSize: 9,
      cellPadding: 3,
      halign: "center",
      valign: "middle",
      lineColor: [200, 210, 220],
      lineWidth: 0.2,
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [14, 165, 233] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontSize: 10,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249] as [number, number, number],
    },
    margin: { top: 40, right: 10, bottom: 25, left: 10 },
    didDrawPage: (pageData: any) => {
      // Footer
      doc.setFillColor(245, 245, 245);
      doc.rect(0, pageHeight - 15, pageWidth, 15, "F");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.setFont("Amiri", "normal");
      doc.text(
        "Powered by Mohamed Abdel Aal",
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );
      doc.text(
        `${pageData.pageNumber}`,
        pageWidth - 15,
        pageHeight - 8,
        { align: "center" }
      );

      // Re-draw header on subsequent pages
      if (pageData.pageNumber > 1) {
        doc.setFillColor(14, 165, 233);
        doc.rect(0, 0, pageWidth, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont("Amiri", "bold");
        doc.text(title, pageWidth / 2, 8, { align: "center" });
      }
    },
  });

  doc.save(`${filename}.pdf`);
}
