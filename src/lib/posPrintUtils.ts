// Shared print utilities for POS & Call Center receipts
// Standardizes font (Cairo 12px) and paper size (72mm) across customer & kitchen receipts.

import { toast } from "sonner";

export interface ReceiptItemData {
  name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface CustomerReceiptData {
  invoiceNumber?: string;
  branchName?: string;
  customerName?: string;
  date: string;
  items: ReceiptItemData[];
  subtotal: number;
  discountAmount: number;
  discountLabel?: string;
  taxAmount: number;
  taxRate: number;
  total: number;
  companyName?: string;
  notes?: string;
  orderType?: string;
  paymentMethod?: string;
  deliveryFee?: number;
  customerPhone?: string;
  customerPhone2?: string;
  customerAddress?: string;
}

export interface KitchenReceiptData {
  invoiceNumber?: string;
  branchName?: string;
  date: string;
  items: ReceiptItemData[];
  orderType?: string;
  customerName?: string;
  companyName?: string;
}

// Silent print using hidden iframe
export const printViaIframe = (htmlContent: string) => {
  const existingFrame = document.getElementById("silent-print-frame");
  if (existingFrame) existingFrame.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "silent-print-frame";
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    toast.error("تعذر فتح الطباعة");
    return;
  }
  doc.open();
  doc.write(htmlContent);
  doc.close();
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Print error", e);
    }
    setTimeout(() => iframe.remove(), 2000);
  };
};

// Build customer receipt HTML — Cairo 12px base, 72mm width
export const buildCustomerReceiptHTML = (data: CustomerReceiptData): string => {
  const {
    invoiceNumber, branchName, customerName, date, items,
    subtotal, discountAmount, discountLabel, taxAmount, taxRate, total,
    companyName, notes, orderType, paymentMethod, deliveryFee,
    customerPhone, customerPhone2, customerAddress,
  } = data;

  const itemsRows = items.map((item) =>
    `<tr style="border-bottom:1px dotted #ccc">
      <td style="text-align:right;padding:3px 0;font-size:12px">${item.name}</td>
      <td style="text-align:center;padding:3px 0;font-size:12px">${item.quantity}</td>
      <td style="text-align:center;padding:3px 0;font-size:12px">${item.unit_price.toFixed(2)}</td>
      <td style="text-align:left;padding:3px 0;font-size:12px">${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>${item.notes ? `<tr><td colspan="4" style="text-align:right;font-size:11px;color:#444;padding-bottom:3px;padding-right:8px">⤷ ${item.notes}</td></tr>` : ""}`
  ).join("");

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال العميل</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:12px;color:#000;line-height:1.5;font-weight:500;}
  table{width:100%;border-collapse:collapse;}
  @media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}
</style></head><body>
<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px">
  <div style="font-size:16px;font-weight:bold">${companyName || "CostControl"}</div>
  ${branchName ? `<div style="font-size:12px">${branchName}</div>` : ""}
  <div style="font-size:12px;margin-top:3px">${date}</div>
  ${invoiceNumber ? `<div style="font-size:12px">فاتورة رقم: ${invoiceNumber}</div>` : ""}
  ${customerName ? `<div style="font-size:12px">العميل: ${customerName}</div>` : ""}
  ${customerPhone ? `<div style="font-size:12px" dir="ltr">${customerPhone}${customerPhone2 ? ` / ${customerPhone2}` : ""}</div>` : ""}
  ${customerAddress ? `<div style="font-size:12px">العنوان: ${customerAddress}</div>` : ""}
  ${orderType ? `<div style="font-size:12px">نوع الطلب: ${orderType}</div>` : ""}
  ${paymentMethod ? `<div style="font-size:12px">طريقة الدفع: ${paymentMethod}</div>` : ""}
</div>
<table style="margin-bottom:6px">
  <thead>
    <tr style="border-bottom:1px dashed #000">
      <th style="text-align:right;font-size:12px;padding:3px 0">الصنف</th>
      <th style="text-align:center;font-size:12px;padding:3px 0">الكمية</th>
      <th style="text-align:center;font-size:12px;padding:3px 0">السعر</th>
      <th style="text-align:left;font-size:12px;padding:3px 0">المجموع</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>
<div style="border-top:1px dashed #000;padding-top:6px">
  <div style="display:flex;justify-content:space-between;font-size:12px"><span>الإجمالي الفرعي:</span><span>${subtotal.toFixed(2)}</span></div>
  ${discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px"><span>خصم ${discountLabel || ""}:</span><span>- ${discountAmount.toFixed(2)}</span></div>` : ""}
  ${taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px"><span>ضريبة ${taxRate}%:</span><span>${taxAmount.toFixed(2)}</span></div>` : ""}
  ${(deliveryFee ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px"><span>رسوم التوصيل:</span><span>${(deliveryFee ?? 0).toFixed(2)}</span></div>` : ""}
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;border-top:1px dashed #000;padding-top:5px;margin-top:5px"><span>الإجمالي:</span><span>${(total + (deliveryFee ?? 0)).toFixed(2)} EGP</span></div>
</div>
${notes ? `<div style="border-top:1px dashed #000;padding-top:6px;margin-top:6px"><div style="font-size:12px"><span style="font-weight:bold">ملاحظات:</span> ${notes}</div></div>` : ""}
<div style="text-align:center;margin-top:8px;border-top:1px dashed #000;padding-top:6px">
  <div style="font-size:12px">شكراً لزيارتكم</div>
  <div style="font-size:10px;color:#666;margin-top:3px">CostControl POS System</div>
</div>
</body></html>`;
};

// Build kitchen receipt HTML — only items, quantities, notes (no prices)
export const buildKitchenReceiptHTML = (data: KitchenReceiptData): string => {
  const { invoiceNumber, branchName, date, items, orderType, customerName, companyName } = data;

  const itemsRows = items.map((item) =>
    `<tr style="border-bottom:1px dashed #555">
      <td style="text-align:right;padding:6px 0;font-size:14px;font-weight:600">${item.name}</td>
      <td style="text-align:center;padding:6px 0;font-size:16px;font-weight:bold">× ${item.quantity}</td>
    </tr>${item.notes ? `<tr><td colspan="2" style="text-align:right;font-size:13px;color:#000;padding:2px 0 6px 8px;font-weight:600;background:#f5f5f5">⤷ ${item.notes}</td></tr>` : ""}`
  ).join("");

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال المطبخ</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:14px;color:#000;line-height:1.5;font-weight:500;}
  table{width:100%;border-collapse:collapse;}
  @media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}
</style></head><body>
<div style="text-align:center;border:2px solid #000;padding:6px;margin-bottom:8px">
  <div style="font-size:18px;font-weight:900">🍳 طلب مطبخ</div>
  ${companyName ? `<div style="font-size:12px;margin-top:2px">${companyName}</div>` : ""}
  ${branchName ? `<div style="font-size:12px">${branchName}</div>` : ""}
</div>
<div style="text-align:center;margin-bottom:6px;font-size:13px;border-bottom:1px dashed #000;padding-bottom:6px">
  ${invoiceNumber ? `<div style="font-weight:bold">فاتورة: ${invoiceNumber}</div>` : ""}
  <div>${date}</div>
  ${orderType ? `<div style="font-weight:bold;margin-top:3px;font-size:14px">${orderType}</div>` : ""}
  ${customerName ? `<div>العميل: ${customerName}</div>` : ""}
</div>
<table>
  <thead>
    <tr style="border-bottom:2px solid #000">
      <th style="text-align:right;font-size:13px;padding:6px 0">الصنف</th>
      <th style="text-align:center;font-size:13px;padding:6px 0">الكمية</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>
<div style="text-align:center;margin-top:10px;border-top:2px solid #000;padding-top:6px;font-size:11px;color:#444">
  - إيصال مطبخ -
</div>
</body></html>`;
};

export const printCustomerReceipt = (data: CustomerReceiptData) => {
  printViaIframe(buildCustomerReceiptHTML(data));
};

export const printKitchenReceipt = (data: KitchenReceiptData) => {
  printViaIframe(buildKitchenReceiptHTML(data));
};
