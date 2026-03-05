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

// Dark theme colors matching the system
const DARK_BG: [number, number, number] = [15, 18, 30];        // --background dark
const DARK_CARD: [number, number, number] = [18, 22, 38];       // --card dark
const DARK_ROW_ALT: [number, number, number] = [22, 28, 48];    // slightly lighter
const PRIMARY: [number, number, number] = [56, 189, 248];       // hsl(199,89%,60%) ≈ #38BDF8
const PRIMARY_DIM: [number, number, number] = [14, 165, 233];   // #0EA5E9
const TEXT_LIGHT: [number, number, number] = [226, 232, 240];   // --foreground dark
const TEXT_MUTED: [number, number, number] = [148, 163, 184];   // muted
const BORDER_DARK: [number, number, number] = [40, 50, 70];
const WHITE: [number, number, number] = [255, 255, 255];

// Excel hex colors (dark theme)
const XL_DARK_BG = "0F121E";
const XL_DARK_CARD = "121626";
const XL_DARK_ALT = "161C30";
const XL_PRIMARY = "0EA5E9";
const XL_PRIMARY_LIGHT = "38BDF8";
const XL_TEXT = "E2E8F0";
const XL_TEXT_MUTED = "94A3B8";
const XL_BORDER = "283246";

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

// ─── Excel Export (dark themed, styled, Arabic-ready) ───────────────
export async function exportToExcel({ title, filename, columns, data }: ExportOptions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cost Management System";
  const ws = wb.addWorksheet(title.substring(0, 31));

  // RTL
  (ws as any).views = [{ rightToLeft: true }];

  // Column definitions
  ws.columns = columns.map((col) => {
    const maxLen = Math.max(
      col.label.length,
      ...data.map((r) => String(r[col.key] ?? "").length)
    );
    return {
      header: col.label,
      key: col.key,
      width: Math.min(Math.max(maxLen + 4, 14), 40),
    };
  });

  // Title row (insert before header)
  ws.spliceRows(1, 0, []);
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: `FF${XL_PRIMARY_LIGHT}` }, size: 16, name: "Cairo" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(1, 1, 1, columns.length);
  ws.getRow(1).height = 36;

  // Date row
  ws.spliceRows(2, 0, []);
  const dateCell = ws.getCell("A2");
  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  dateCell.value = `Cost Management System  •  ${dateStr}`;
  dateCell.font = { color: { argb: `FF${XL_TEXT_MUTED}` }, size: 10, name: "Cairo" };
  dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(2, 1, 2, columns.length);
  ws.getRow(2).height = 24;

  // Header row is now row 3
  const headerRow = ws.getRow(3);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Cairo" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_PRIMARY}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      bottom: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      left: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      right: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
    };
  });

  // Data rows
  data.forEach((row, idx) => {
    const r = ws.addRow(columns.map((col) => row[col.key] ?? "—"));
    r.height = 24;
    const isAlt = idx % 2 === 1;
    r.eachCell((cell) => {
      cell.font = { size: 11, name: "Cairo", color: { argb: `FF${XL_TEXT}` } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isAlt ? `FF${XL_DARK_ALT}` : `FF${XL_DARK_CARD}` },
      };
      cell.border = {
        top: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        bottom: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        left: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        right: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
      };
    });
  });

  // Footer row
  const footerRow = ws.addRow([]);
  ws.mergeCells(footerRow.number, 1, footerRow.number, columns.length);
  const footerCell = ws.getCell(`A${footerRow.number}`);
  footerCell.value = "Powered by Mohamed Abdel Aal";
  footerCell.font = { italic: true, color: { argb: `FF${XL_TEXT_MUTED}` }, size: 9, name: "Cairo" };
  footerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  footerCell.alignment = { horizontal: "center", vertical: "middle" };
  footerRow.height = 22;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${filename}.xlsx`);
}

// ─── PDF Export (Cairo font, dark theme) ────────────────────────────
export async function exportToPDF({ title, filename, columns, data }: ExportOptions) {
  const doc = new jsPDF({
    orientation: columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  // Load & register Cairo font
  let fontLoaded = false;
  try {
    const cairoBase64 = await loadFontBase64("/fonts/Cairo-Regular.ttf");
    doc.addFileToVFS("Cairo-Regular.ttf", cairoBase64);
    doc.addFont("Cairo-Regular.ttf", "Cairo", "normal");
    doc.addFont("Cairo-Regular.ttf", "Cairo", "bold");
    doc.setFont("Cairo");
    fontLoaded = true;
  } catch (e) {
    console.warn("Could not load Cairo font, falling back to Amiri", e);
    try {
      const amiriBase64 = await loadFontBase64("/fonts/Amiri-Regular.ttf");
      doc.addFileToVFS("Amiri-Regular.ttf", amiriBase64);
      doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
      doc.addFont("Amiri-Regular.ttf", "Amiri", "bold");
      doc.setFont("Amiri");
      fontLoaded = true;
    } catch {
      console.warn("No Arabic font available");
    }
  }

  const fontName = fontLoaded ? (doc.getFont().fontName || "Cairo") : "helvetica";
  doc.setLanguage("ar");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Full dark background ──
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // ── Header bar ──
  doc.setFillColor(...PRIMARY_DIM);
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

  // System name
  doc.setTextColor(...WHITE);
  doc.setFontSize(10);
  doc.setFont(fontName, "normal");
  doc.text("Cost Management System", 14, 12);

  // Title
  doc.setFontSize(16);
  doc.setFont(fontName, "bold");
  doc.text(title, pageWidth / 2, 22, { align: "center" });

  // Date
  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...TEXT_MUTED);
  const dateStr = new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
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

  // Dynamic font size based on column count
  const colCount = columns.length;
  const bodyFontSize = colCount > 12 ? 5 : colCount > 8 ? 6 : colCount > 5 ? 7 : 8;
  const headFontSize = bodyFontSize + 0.5;

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 40,
    theme: "grid",
    tableWidth: "auto",
    styles: {
      font: fontName,
      fontSize: bodyFontSize,
      cellPadding: 1.5,
      halign: "right",
      valign: "middle",
      lineColor: BORDER_DARK,
      lineWidth: 0.15,
      textColor: TEXT_LIGHT,
      fillColor: DARK_CARD,
      overflow: "linebreak",
      cellWidth: "wrap",
    },
    headStyles: {
      fillColor: PRIMARY_DIM,
      textColor: WHITE,
      fontSize: headFontSize,
      fontStyle: "bold",
      halign: "right",
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: DARK_ROW_ALT,
    },
    margin: { top: 40, right: 5, bottom: 20, left: 5 },
    didDrawPage: (pageData: any) => {
      // Dark background on each page
      doc.setFillColor(...DARK_BG);
      // Don't overdraw already-rendered content, just footer area
      doc.setFillColor(20, 24, 40);
      doc.rect(0, pageHeight - 16, pageWidth, 16, "F");

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.setFont(fontName, "normal");
      doc.text(
        "Powered by Mohamed Abdel Aal",
        pageWidth / 2,
        pageHeight - 7,
        { align: "center" }
      );
      doc.text(
        `${pageData.pageNumber}`,
        pageWidth - 15,
        pageHeight - 7,
        { align: "center" }
      );

      // Header on subsequent pages
      if (pageData.pageNumber > 1) {
        doc.setFillColor(...PRIMARY_DIM);
        doc.rect(0, 0, pageWidth, 14, "F");
        doc.setTextColor(...WHITE);
        doc.setFontSize(10);
        doc.setFont(fontName, "bold");
        doc.text(title, pageWidth / 2, 9, { align: "center" });
      }
    },
    // Fill dark background before table on new pages
    didDrawCell: (cellData: any) => {
      // handled by styles
    },
  });

  doc.save(`${filename}.pdf`);
}
