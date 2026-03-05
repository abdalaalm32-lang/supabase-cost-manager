import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { toast } from "sonner";

interface Ingredient {
  name: string;
  code: string;
  recipe_unit: string;
  qty: number;
  avg_cost: number;
  conversion_factor: number;
}

interface RecipePrintExportProps {
  productName: string;
  productCode?: string;
  productPrice?: number;
  ingredients: Ingredient[];
  totalCost: number;
  type: "pos" | "production"; // pos = ريسيبي المنتجات, production = تركيبة الإنتاج
}

const buildPrintHTML = (
  productName: string,
  productCode: string,
  ingredients: Ingredient[],
  totalCost: number,
  withCost: boolean,
  productPrice?: number,
  type?: string,
) => {
  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const logoSrc = `${window.location.origin}/logo.png`;
  const title = type === "production" ? "تركيبة إنتاج" : "وصفة منتج";

  let theadHTML = `<tr>
    <th>م</th>
    <th>الكود</th>
    <th>اسم الخامة</th>
    <th>الوحدة</th>
    <th>الكمية</th>`;
  if (withCost) {
    theadHTML += `<th>م. التكلفة</th><th>الإجمالي</th>`;
  }
  theadHTML += `</tr>`;

  let tbodyHTML = "";
  ingredients.forEach((ing, idx) => {
    const cost = (ing.qty / (ing.conversion_factor || 1)) * ing.avg_cost;
    tbodyHTML += `<tr>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${ing.code || "—"}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${ing.name}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${ing.recipe_unit}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${ing.qty}</td>`;
    if (withCost) {
      tbodyHTML += `<td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${ing.avg_cost.toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${cost.toFixed(2)}</td>`;
    }
    tbodyHTML += `</tr>`;
  });

  if (withCost) {
    tbodyHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td colspan="6" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">إجمالي التكلفة</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalCost.toFixed(2)}</td>
    </tr>`;
    if (productPrice && productPrice > 0) {
      const profit = productPrice - totalCost;
      const margin = (profit / productPrice) * 100;
      tbodyHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
        <td colspan="6" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">سعر البيع</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${productPrice.toFixed(2)}</td>
      </tr>
      <tr style="font-weight:bold;background:#f5f5f5;">
        <td colspan="6" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">صافي الربح (هامش ${margin.toFixed(1)}%)</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;color:${profit >= 0 ? 'green' : 'red'};">${profit.toFixed(2)}</td>
      </tr>`;
    }
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${productName}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:40px; height:40px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .header p { font-size:11px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px; border:1px solid #000; padding:10px; }
    .info-item { font-size:11px; }
    .info-item strong { font-family:'AmiriBold','CairoLocal',sans-serif; }
    table { width:100%; border-collapse:collapse; margin-bottom:15px; }
    th { border:1px solid #000; padding:5px 6px; font-size:10px; text-align:center; font-family:'AmiriBold','CairoLocal',sans-serif; background:#f0f0f0; }
    .footer { text-align:center; margin-top:20px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
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
  <div class="info-grid">
    <div class="info-item"><strong>المنتج:</strong> ${productName}</div>
    <div class="info-item"><strong>الكود:</strong> ${productCode || "—"}</div>
    ${withCost && productPrice ? `<div class="info-item"><strong>سعر البيع:</strong> ${productPrice.toFixed(2)}</div>` : ""}
  </div>
  <table>
    <thead>${theadHTML}</thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){ try { if(document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){} window.print(); window.onafterprint = function(){ window.close(); }; })();
  </script>
</body>
</html>`;
};

export const RecipePrintExport: React.FC<RecipePrintExportProps> = ({
  productName,
  productCode = "",
  productPrice,
  ingredients,
  totalCost,
  type,
}) => {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  if (ingredients.length === 0) return null;

  const handlePrint = (withCost: boolean) => {
    const html = buildPrintHTML(productName, productCode, ingredients, totalCost, withCost, productPrice, type);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const getExportData = () => {
    return ingredients.map((ing) => {
      const cost = (ing.qty / (ing.conversion_factor || 1)) * ing.avg_cost;
      return {
        name: ing.name,
        code: ing.code,
        unit: ing.recipe_unit,
        qty: ing.qty,
        avg_cost: ing.avg_cost.toFixed(2),
        total: cost.toFixed(2),
      };
    });
  };

  const exportColumns: ExportColumn[] = [
    { key: "name", label: "اسم الخامة" },
    { key: "code", label: "الكود" },
    { key: "unit", label: "الوحدة" },
    { key: "qty", label: "الكمية" },
    { key: "avg_cost", label: "م. التكلفة" },
    { key: "total", label: "الإجمالي" },
  ];

  const titleText = type === "production" ? `تركيبة إنتاج - ${productName}` : `وصفة - ${productName}`;
  const filenameText = type === "production" ? `تركيبة_${productName}` : `وصفة_${productName}`;

  const handleExcel = async () => {
    setLoadingExcel(true);
    try {
      await exportToExcel({ title: titleText, filename: filenameText, columns: exportColumns, data: getExportData() });
      toast.success("تم تصدير Excel بنجاح");
    } catch { toast.error("خطأ أثناء التصدير"); }
    finally { setLoadingExcel(false); }
  };

  const handlePdf = async () => {
    setLoadingPdf(true);
    try {
      await exportToPDF({ title: titleText, filename: filenameText, columns: exportColumns, data: getExportData() });
      toast.success("تم تصدير PDF بنجاح");
    } catch { toast.error("خطأ أثناء التصدير"); }
    finally { setLoadingPdf(false); }
  };

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Printer size={14} /> طباعة
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handlePrint(false)}>
            طباعة الكميات فقط
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handlePrint(true)}>
            طباعة بالتكلفة
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePdf} disabled={loadingPdf}>
        {loadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExcel} disabled={loadingExcel}>
        {loadingExcel ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-green-600" />}
        Excel
      </Button>
    </div>
  );
};

// Export for raw material search results
interface MaterialUsageExportProps {
  materialName: string;
  materialCode: string;
  usageData: { productName: string; qty: number; unit: string; avgCost: number; conversionFactor: number }[];
}

export const MaterialUsagePrintExport: React.FC<MaterialUsageExportProps> = ({
  materialName,
  materialCode,
  usageData,
}) => {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  if (usageData.length === 0) return null;

  const handlePrint = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;

    let tbodyHTML = "";
    usageData.forEach((u, idx) => {
      const cost = (u.qty / (u.conversionFactor || 1)) * u.avgCost;
      tbodyHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${u.productName}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${u.qty}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${u.unit}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${u.avgCost.toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${cost.toFixed(2)}</td>
      </tr>`;
    });

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>استخدام خامة - ${materialName}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:40px; height:40px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .header p { font-size:11px; }
    table { width:100%; border-collapse:collapse; margin-bottom:15px; }
    th { border:1px solid #000; padding:5px 6px; font-size:10px; text-align:center; font-family:'AmiriBold','CairoLocal',sans-serif; background:#f0f0f0; }
    .footer { text-align:center; margin-top:20px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>تقرير استخدام خامة</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <p style="margin-bottom:10px;font-size:12px;"><strong>الخامة:</strong> ${materialName} (${materialCode})</p>
  <table>
    <thead>
      <tr>
        <th>م</th>
        <th>المنتج</th>
        <th>الكمية</th>
        <th>الوحدة</th>
        <th>م. التكلفة</th>
        <th>إجمالي التكلفة</th>
      </tr>
    </thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){ try { if(document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){} window.print(); window.onafterprint = function(){ window.close(); }; })();
  </script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const exportData = usageData.map((u) => ({
    productName: u.productName,
    qty: u.qty,
    unit: u.unit,
    avgCost: u.avgCost.toFixed(2),
    totalCost: ((u.qty / (u.conversionFactor || 1)) * u.avgCost).toFixed(2),
  }));

  const exportColumns: ExportColumn[] = [
    { key: "productName", label: "المنتج" },
    { key: "qty", label: "الكمية" },
    { key: "unit", label: "الوحدة" },
    { key: "avgCost", label: "م. التكلفة" },
    { key: "totalCost", label: "إجمالي التكلفة" },
  ];

  const handleExcel = async () => {
    setLoadingExcel(true);
    try {
      await exportToExcel({ title: `استخدام خامة - ${materialName}`, filename: `خامة_${materialName}`, columns: exportColumns, data: exportData });
      toast.success("تم تصدير Excel بنجاح");
    } catch { toast.error("خطأ أثناء التصدير"); }
    finally { setLoadingExcel(false); }
  };

  const handlePdf = async () => {
    setLoadingPdf(true);
    try {
      await exportToPDF({ title: `استخدام خامة - ${materialName}`, filename: `خامة_${materialName}`, columns: exportColumns, data: exportData });
      toast.success("تم تصدير PDF بنجاح");
    } catch { toast.error("خطأ أثناء التصدير"); }
    finally { setLoadingPdf(false); }
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={handlePrint}>
        <Printer size={12} /> طباعة
      </Button>
      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={handlePdf} disabled={loadingPdf}>
        {loadingPdf ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
        PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={handleExcel} disabled={loadingExcel}>
        {loadingExcel ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} className="text-green-600" />}
        Excel
      </Button>
    </div>
  );
};
