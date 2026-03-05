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
  /** Optional two-row header: array of { label, colSpan } for the top row */
  headerGroups?: { label: string; colSpan: number }[];
  /** Mark rows as "group-total" or "grand-total" via a __rowType field */
}

// Black & White PDF colors
const WHITE_BG: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [245, 245, 245];
const HEADER_BG: [number, number, number] = [60, 60, 60];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const TEXT_DARK: [number, number, number] = [30, 30, 30];
const TEXT_MUTED_BW: [number, number, number] = [120, 120, 120];
const BORDER_BW: [number, number, number] = [180, 180, 180];
const GROUP_TOTAL_BW: [number, number, number] = [230, 230, 230];
const GRAND_TOTAL_BW: [number, number, number] = [210, 210, 210];

// Excel hex colors
const XL_DARK_BG = "0F121E";
const XL_DARK_CARD = "121626";
const XL_DARK_ALT = "161C30";
const XL_PRIMARY = "0EA5E9";
const XL_PRIMARY_LIGHT = "38BDF8";
const XL_TEXT = "E2E8F0";
const XL_TEXT_MUTED = "94A3B8";
const XL_BORDER = "283246";
const XL_GROUP_TOTAL = "1C263E";
const XL_GRAND_TOTAL = "23304E";

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

// ─── Excel Export ───────────────────────────────────────────────────
export async function exportToExcel({ title, filename, columns, data, headerGroups }: ExportOptions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cost Management System";
  const ws = wb.addWorksheet(title.substring(0, 31));
  (ws as any).views = [{ rightToLeft: true }];

  // Column definitions (reversed for RTL display)
  const revCols = [...columns].reverse();
  ws.columns = revCols.map((col) => {
    const maxLen = Math.max(col.label.length, ...data.map((r) => String(r[col.key] ?? "").length));
    return { header: col.label, key: col.key, width: Math.min(Math.max(maxLen + 3, 10), 35) };
  });

  // Title row
  ws.spliceRows(1, 0, []);
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: `FF${XL_PRIMARY_LIGHT}` }, size: 14, name: "Cairo" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(1, 1, 1, columns.length);
  ws.getRow(1).height = 32;

  // Date row
  ws.spliceRows(2, 0, []);
  const dateCell = ws.getCell("A2");
  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  dateCell.value = `Cost Management System  •  ${dateStr}`;
  dateCell.font = { color: { argb: `FF${XL_TEXT_MUTED}` }, size: 9, name: "Cairo" };
  dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(2, 1, 2, columns.length);
  ws.getRow(2).height = 20;

  // If headerGroups provided, insert a merged group header row before the column headers
  let dataStartRow = 4; // default: row 3 = headers, row 4+ = data
  if (headerGroups && headerGroups.length > 0) {
    ws.spliceRows(3, 0, []);
    const groupRow = ws.getRow(3);
    groupRow.height = 26;
    // Reverse the header groups for RTL
    const revGroups = [...headerGroups].reverse();
    let colIdx = 1;
    for (const grp of revGroups) {
      const cell = ws.getCell(3, colIdx);
      cell.value = grp.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Cairo" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_PRIMARY}` } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
        bottom: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
        left: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
        right: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      };
      if (grp.colSpan > 1) {
        ws.mergeCells(3, colIdx, 3, colIdx + grp.colSpan - 1);
      }
      colIdx += grp.colSpan;
    }
    dataStartRow = 5; // row 3 = group header, row 4 = sub headers, row 5+ = data
  }

  // Style the column header row
  const headerRowNum = headerGroups ? 4 : 3;
  const headerRow = ws.getRow(headerRowNum);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, name: "Cairo" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF0B7EC5` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      bottom: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      left: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
      right: { style: "thin", color: { argb: `FF${XL_BORDER}` } },
    };
  });

  // Data rows
  let altIdx = 0;
  data.forEach((row) => {
    const rowType = row.__rowType as string | undefined;
    const r = ws.addRow(revCols.map((col) => row[col.key] ?? ""));
    r.height = 22;

    const bgColor = rowType === "grand-total" ? XL_GRAND_TOTAL
      : rowType === "group-total" ? XL_GROUP_TOTAL
      : altIdx % 2 === 1 ? XL_DARK_ALT : XL_DARK_CARD;
    const isBold = rowType === "grand-total" || rowType === "group-total";

    r.eachCell((cell) => {
      cell.font = { size: 9, name: "Cairo", color: { argb: `FF${XL_TEXT}` }, bold: isBold };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
      cell.border = {
        top: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        bottom: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        left: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
        right: { style: "hair", color: { argb: `FF${XL_BORDER}` } },
      };
    });
    if (!rowType) altIdx++;
  });

  // Footer
  const footerRow = ws.addRow([]);
  ws.mergeCells(footerRow.number, 1, footerRow.number, columns.length);
  const footerCell = ws.getCell(`A${footerRow.number}`);
  footerCell.value = "Powered by Mohamed Abdel Aal";
  footerCell.font = { italic: true, color: { argb: `FF${XL_TEXT_MUTED}` }, size: 8, name: "Cairo" };
  footerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${XL_DARK_BG}` } };
  footerCell.alignment = { horizontal: "center", vertical: "middle" };
  footerRow.height = 20;

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
}

// ─── PDF Export ─────────────────────────────────────────────────────
export async function exportToPDF({ title, filename, columns, data, headerGroups }: ExportOptions) {
  const doc = new jsPDF({
    orientation: columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const processArabicText = (value: unknown) => {
    const raw = value !== null && value !== undefined && String(value).trim() !== "" ? String(value) : "—";
    const hasArabic = /[\u0600-\u06FF]/.test(raw);
    if (!hasArabic) return raw;

    const arabicParser = (doc as any).processArabic;
    return typeof arabicParser === "function" ? arabicParser(raw) : raw;
  };

  // Load Arabic font (prefer Amiri with real bold support)
  let fontName = "helvetica";
  try {
    const amiriRegular = await loadFontBase64("/fonts/Amiri-Regular.ttf");
    const amiriBold = await loadFontBase64("/fonts/Amiri-Bold.ttf");
    doc.addFileToVFS("Amiri-Regular.ttf", amiriRegular);
    doc.addFileToVFS("Amiri-Bold.ttf", amiriBold);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
    fontName = "Amiri";
  } catch (amiriErr) {
    console.warn("Could not load Amiri font", amiriErr);
    try {
      const cairoBase64 = await loadFontBase64("/fonts/Cairo-Regular.ttf");
      doc.addFileToVFS("Cairo-Regular.ttf", cairoBase64);
      doc.addFont("Cairo-Regular.ttf", "Cairo", "normal");
      doc.addFont("Cairo-Regular.ttf", "Cairo", "bold");
      fontName = "Cairo";
    } catch (cairoErr) {
      console.warn("Could not load Cairo font", cairoErr);
      fontName = "helvetica";
    }
  }

  doc.setLanguage("ar");
  if (typeof (doc as any).setR2L === "function") {
    (doc as any).setR2L(false);
  }
  doc.setFont(fontName, "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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
  } catch {
    logoImg = null;
  }

  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", pageWidth - 26, 5, 16, 16);
    } catch {
      // skip logo drawing if image format fails
    }
  }

  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  doc.setTextColor(...BLACK);
  doc.setFont(fontName, "bold");
  doc.setFontSize(13);
  doc.text(processArabicText(title), pageWidth / 2, 11, { align: "center" });

  doc.setFont(fontName, "normal");
  doc.setFontSize(8);
  doc.text(processArabicText(`نظام إدارة التكاليف • ${dateStr}`), pageWidth / 2, 17, { align: "center" });

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.line(8, 21, pageWidth - 8, 21);

  // Headers - reversed for RTL
  const revCols = [...columns].reverse();
  const subHeaders = revCols.map((c) => processArabicText(c.label));

  let headRows: any[][] = [];
  if (headerGroups && headerGroups.length > 0) {
    const revGroups = [...headerGroups].reverse();
    const topRow = revGroups.map((grp) => ({
      content: processArabicText(grp.label),
      colSpan: grp.colSpan,
      styles: {
        halign: "center" as const,
        fillColor: WHITE_BG,
        textColor: BLACK,
      },
    }));
    headRows = [topRow, subHeaders];
  } else {
    headRows = [subHeaders];
  }

  // Body rows - reversed columns
  const bodyRows = data.map((row) => {
    const rowType = row.__rowType as string | undefined;
    return revCols.map((col) => {
      const content = processArabicText(row[col.key]);
      if (rowType === "grand-total" || rowType === "group-total") {
        return {
          content,
          styles: {
            fontStyle: "bold" as const,
            textColor: BLACK,
            fillColor: WHITE_BG,
          },
        };
      }
      return content;
    });
  });

  const colCount = columns.length;
  const bodyFontSize = colCount > 14 ? 4.5 : colCount > 12 ? 5 : colCount > 8 ? 5.5 : colCount > 5 ? 6.5 : 7;
  const headFontSize = bodyFontSize + 0.5;

  autoTable(doc, {
    head: headRows,
    body: bodyRows,
    startY: 24,
    theme: "grid",
    styles: {
      font: fontName,
      fontStyle: "normal",
      fontSize: bodyFontSize,
      cellPadding: 1.2,
      halign: "center",
      valign: "middle",
      lineColor: BLACK,
      lineWidth: 0.1,
      textColor: BLACK,
      fillColor: WHITE_BG,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: WHITE_BG,
      textColor: BLACK,
      font: fontName,
      fontSize: headFontSize,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 1.4,
      lineColor: BLACK,
      lineWidth: 0.15,
    },
    bodyStyles: {
      fillColor: WHITE_BG,
      textColor: BLACK,
    },
    margin: { top: 24, right: 4, bottom: 14, left: 4 },
    tableWidth: "auto",
    didDrawPage: (pageData: any) => {
      doc.setTextColor(...BLACK);
      doc.setFont(fontName, "normal");
      doc.setFontSize(6.5);
      doc.text("Powered by Mohamed Abdel Aal", 8, pageHeight - 5, { align: "left" });
      doc.text(processArabicText(`صفحة ${pageData.pageNumber}`), pageWidth - 8, pageHeight - 5, { align: "right" });

      if (pageData.pageNumber > 1) {
        doc.setTextColor(...BLACK);
        doc.setFont(fontName, "bold");
        doc.setFontSize(8);
        doc.text(processArabicText(title), pageWidth / 2, 8, { align: "center" });
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.2);
        doc.line(8, 10, pageWidth - 8, 10);
      }
    },
  });

  doc.save(`${filename}.pdf`);
}
