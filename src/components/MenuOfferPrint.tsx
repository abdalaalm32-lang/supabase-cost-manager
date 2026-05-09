/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export interface OfferPrintIngredient {
  name: string;
  unit: string;
  qty: number;
  avg_cost: number;
  conversion_factor: number;
}

export interface OfferPrintItem {
  name: string;
  ingredients: OfferPrintIngredient[];
}

export interface OfferPrintData {
  name: string;
  code: string;
  branchName: string;
  orderType: string;
  salePrice: number;
  taxRate: number;
  packingCost: number;
  consumablesPct: number;
  sideCost: number;
  indirectExpensesPct: number;
  notes?: string;
  items: OfferPrintItem[];
}

const calcIngCost = (i: OfferPrintIngredient) =>
  (Number(i.qty) / (Number(i.conversion_factor) || 1)) * Number(i.avg_cost);

export const buildOfferPrintHTML = (d: OfferPrintData): string => {
  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const logoSrc = `${window.location.origin}/logo.png`;

  // Per-item tables
  const itemsHTML = d.items
    .map((item, idx) => {
      let total = 0;
      const rows = item.ingredients
        .map((ing, k) => {
          const cost = calcIngCost(ing);
          total += cost;
          return `<tr>
            <td>${k + 1}</td>
            <td style="text-align:right;">${ing.name}</td>
            <td>${ing.unit ?? ""}</td>
            <td>${Number(ing.qty).toFixed(3)}</td>
            <td>${Number(ing.avg_cost).toFixed(2)}</td>
            <td>${cost.toFixed(2)}</td>
          </tr>`;
        })
        .join("");
      return `
        <div class="item-block">
          <div class="item-header">صنف ${idx + 1}: ${item.name}</div>
          <table class="ing-table">
            <thead>
              <tr><th>م</th><th>اسم الخامة</th><th>الوحدة</th><th>الكمية</th><th>م.التكلفة</th><th>الإجمالي</th></tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#666;">لا توجد مكونات</td></tr>`}</tbody>
            <tfoot>
              <tr><td colspan="5" style="text-align:center;font-weight:bold;">إجمالي تكلفة الخامات للصنف</td><td style="font-weight:bold;">${total.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </div>`;
    })
    .join("");

  // Totals
  const ingTotal = d.items.reduce(
    (s, it) => s + it.ingredients.reduce((ss, i) => ss + calcIngCost(i), 0),
    0,
  );
  const consumablesAmount = (ingTotal * Number(d.consumablesPct ?? 0)) / 100;
  const directCost = ingTotal + Number(d.packingCost ?? 0) + consumablesAmount + Number(d.sideCost ?? 0);
  const indirectAmount = (directCost * Number(d.indirectExpensesPct ?? 0)) / 100;
  const fullCost = directCost + indirectAmount;
  const sale = Number(d.salePrice ?? 0);
  const taxRate = Number(d.taxRate ?? 0);
  const isTakeAway = (d.orderType ?? "").includes("تيك") || (d.orderType ?? "").toLowerCase().includes("away");
  const netSale = isTakeAway ? sale : sale / (1 + taxRate / 100);
  const taxAmount = isTakeAway ? 0 : sale - netSale;
  const profit = netSale - fullCost;
  const margin = sale > 0 ? (profit / netSale) * 100 : 0;
  const marginColor = margin < 20 ? "#dc2626" : margin <= 40 ? "#16a34a" : "#ca8a04";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تسعير عرض - ${d.name}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; font-size:11px; }
    @media print { @page { size:A4; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:12px; border-bottom:2px solid #000; padding-bottom:8px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:70px; height:70px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .header p { font-size:10px; }
    .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:12px; border:1px solid #000; padding:8px; }
    .info-item { font-size:11px; }
    .info-item strong { font-family:'AmiriBold','CairoLocal',sans-serif; }
    .item-block { margin-bottom:12px; page-break-inside: avoid; }
    .item-header { background:#000; color:#fff; padding:6px 10px; font-weight:bold; font-size:13px; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .ing-table { width:100%; border-collapse:collapse; }
    .ing-table th, .ing-table td { border:1px solid #000; padding:4px 6px; font-size:10px; text-align:center; }
    .ing-table th { background:#f0f0f0; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .summary-table { width:100%; border-collapse:collapse; margin-top:14px; }
    .summary-table td { border:1px solid #000; padding:6px 10px; font-size:11px; }
    .summary-table .label { background:#f5f5f5; font-weight:bold; width:60%; }
    .summary-table .value { text-align:center; font-weight:bold; }
    .summary-table tr.highlight td { background:#000; color:#fff; font-size:13px; }
    .footer { text-align:center; margin-top:18px; font-size:9px; border-top:1px solid #000; padding-top:6px; }
    .notes { margin-top:8px; padding:6px 10px; border:1px dashed #555; font-size:10px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>تسعير عرض / صنف جديد</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item"><strong>اسم العرض:</strong> ${d.name}</div>
    <div class="info-item"><strong>الكود:</strong> ${d.code || "—"}</div>
    <div class="info-item"><strong>الفرع:</strong> ${d.branchName || "—"}</div>
    <div class="info-item"><strong>نوع الطلب:</strong> ${d.orderType || "—"}</div>
    <div class="info-item"><strong>سعر البيع:</strong> ${sale.toFixed(2)} EGP</div>
    <div class="info-item"><strong>نسبة الضريبة:</strong> ${taxRate}%</div>
  </div>

  ${itemsHTML}

  <table class="summary-table">
    <tr><td class="label">إجمالي تكلفة الخامات</td><td class="value">${ingTotal.toFixed(2)}</td></tr>
    <tr><td class="label">+ التعبئة (Packing)</td><td class="value">${Number(d.packingCost).toFixed(2)}</td></tr>
    <tr><td class="label">+ المستهلكات (${Number(d.consumablesPct).toFixed(2)}%)</td><td class="value">${consumablesAmount.toFixed(2)}</td></tr>
    <tr><td class="label">+ Side Cost</td><td class="value">${Number(d.sideCost).toFixed(2)}</td></tr>
    <tr><td class="label"><strong>= إجمالي التكلفة المباشرة</strong></td><td class="value">${directCost.toFixed(2)}</td></tr>
    <tr><td class="label">+ المصاريف غير المباشرة (${Number(d.indirectExpensesPct).toFixed(2)}%)</td><td class="value">${indirectAmount.toFixed(2)}</td></tr>
    <tr class="highlight"><td class="label" style="color:#fff;">= التكلفة الكاملة</td><td class="value">${fullCost.toFixed(2)}</td></tr>
    <tr><td class="label">سعر البيع</td><td class="value">${sale.toFixed(2)}</td></tr>
    <tr><td class="label">قيمة الضريبة</td><td class="value">${taxAmount.toFixed(2)}</td></tr>
    <tr><td class="label">صافي البيع (Net)</td><td class="value">${netSale.toFixed(2)}</td></tr>
    <tr><td class="label">صافي الربح</td><td class="value" style="color:${profit >= 0 ? "#16a34a" : "#dc2626"};">${profit.toFixed(2)}</td></tr>
    <tr><td class="label">هامش الربح %</td><td class="value" style="color:${marginColor};">${margin.toFixed(2)}%</td></tr>
  </table>

  ${d.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${d.notes}</div>` : ""}

  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){ try { if(document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){} window.print(); window.onafterprint = function(){ window.close(); }; })();
  </script>
</body>
</html>`;
};

interface PrintButtonProps { data: OfferPrintData; disabled?: boolean }
export const MenuOfferPrintButton: React.FC<PrintButtonProps> = ({ data, disabled }) => {
  const handlePrint = () => {
    const html = buildOfferPrintHTML(data);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={disabled}>
      <Printer size={14} /> طباعة العرض
    </Button>
  );
};
