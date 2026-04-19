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
  expectedReadyTime?: string; // وقت الجاهزية للتيك أواي / التسليم المتوقع للدليفري
}

export interface KitchenReceiptData {
  invoiceNumber?: string;
  branchName?: string;
  date: string;
  items: ReceiptItemData[];
  orderType?: string;
  customerName?: string;
  companyName?: string;
  orderTime?: string;            // وقت ضرب الأوردر
  expectedDeliveryTime?: string; // وقت التسليم المتوقع (للكول سنتر فقط)
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
    customerPhone, customerPhone2, customerAddress, expectedReadyTime,
  } = data;

  const isTakeaway = orderType === "تيك أواي";
  const isDelivery = orderType === "دليفري";

  const itemsRows = items.map((item) =>
    `<tr style="border-bottom:1px solid #000">
      <td style="text-align:right;padding:3px 0;font-size:12px;font-weight:700;color:#000">${item.name}</td>
      <td style="text-align:center;padding:3px 0;font-size:12px;font-weight:700;color:#000">${item.quantity}</td>
      <td style="text-align:center;padding:3px 0;font-size:12px;font-weight:700;color:#000">${item.unit_price.toFixed(2)}</td>
      <td style="text-align:left;padding:3px 0;font-size:12px;font-weight:700;color:#000">${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>${item.notes ? `<tr><td colspan="4" style="text-align:right;font-size:12px;color:#000;padding:3px 8px 5px 8px;font-weight:700;background:#eee;border-bottom:1px solid #000">⤷ ملاحظة: ${item.notes}</td></tr>` : ""}`
  ).join("");

  // Big order number badge for takeaway/delivery
  const bigOrderBadge = (isTakeaway || isDelivery) && invoiceNumber ? `
    <div style="text-align:center;margin:6px 0;border:2px solid #000;padding:8px 4px;background:#f8f8f8">
      <div style="font-size:10px;font-weight:600">${isTakeaway ? "🛍️ رقم الطلب" : "🚚 رقم الطلب"}</div>
      <div style="font-size:24px;font-weight:900;letter-spacing:2px;margin-top:2px">${invoiceNumber}</div>
      ${expectedReadyTime ? `<div style="font-size:11px;font-weight:bold;margin-top:4px;border-top:1px dashed #000;padding-top:4px">⏰ ${isTakeaway ? "وقت الجاهزية" : "وقت التسليم المتوقع"}: ${expectedReadyTime}</div>` : ""}
    </div>
  ` : "";

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال العميل</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:13px;color:#000;line-height:1.5;font-weight:700;}
  table{width:100%;border-collapse:collapse;}
  @media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}
</style></head><body>
<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
  <div style="font-size:18px;font-weight:900;color:#000">${companyName || "CostControl"}</div>
  ${branchName ? `<div style="font-size:13px;font-weight:700;color:#000">${branchName}</div>` : ""}
  <div style="font-size:13px;margin-top:3px;font-weight:700;color:#000">${date}</div>
  ${invoiceNumber && !(isTakeaway || isDelivery) ? `<div style="font-size:13px;font-weight:700;color:#000">فاتورة رقم: ${invoiceNumber}</div>` : ""}
  ${customerName ? `<div style="font-size:13px;font-weight:700;color:#000">العميل: ${customerName}</div>` : ""}
  ${customerPhone ? `<div style="font-size:13px;font-weight:700;color:#000" dir="ltr">${customerPhone}${customerPhone2 ? ` / ${customerPhone2}` : ""}</div>` : ""}
  ${customerAddress ? `<div style="font-size:13px;font-weight:700;color:#000">العنوان: ${customerAddress}</div>` : ""}
  ${orderType ? `<div style="font-size:13px;font-weight:700;color:#000">نوع الطلب: ${orderType}</div>` : ""}
  ${paymentMethod ? `<div style="font-size:13px;font-weight:700;color:#000">طريقة الدفع: ${paymentMethod}</div>` : ""}
</div>
${bigOrderBadge}
<table style="margin-bottom:6px">
  <thead>
    <tr style="border-bottom:2px solid #000">
      <th style="text-align:right;font-size:13px;padding:4px 0;font-weight:900;color:#000">الصنف</th>
      <th style="text-align:center;font-size:13px;padding:4px 0;font-weight:900;color:#000">الكمية</th>
      <th style="text-align:center;font-size:13px;padding:4px 0;font-weight:900;color:#000">السعر</th>
      <th style="text-align:left;font-size:13px;padding:4px 0;font-weight:900;color:#000">المجموع</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>
<div style="border-top:2px solid #000;padding-top:6px">
  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#000"><span>الإجمالي الفرعي:</span><span>${subtotal.toFixed(2)}</span></div>
  ${discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#000"><span>خصم ${discountLabel || ""}:</span><span>- ${discountAmount.toFixed(2)}</span></div>` : ""}
  ${taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#000"><span>ضريبة ${taxRate}%:</span><span>${taxAmount.toFixed(2)}</span></div>` : ""}
  ${(deliveryFee ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#000"><span>رسوم التوصيل:</span><span>${(deliveryFee ?? 0).toFixed(2)}</span></div>` : ""}
  <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;border-top:2px solid #000;padding-top:5px;margin-top:5px;color:#000"><span>الإجمالي:</span><span>${(total + (deliveryFee ?? 0)).toFixed(2)} EGP</span></div>
</div>
${notes ? `<div style="border:2px solid #000;padding:6px;margin-top:6px;background:#eee"><div style="font-size:13px;color:#000;font-weight:700"><span style="font-weight:900">ملاحظات:</span> ${notes}</div></div>` : ""}
<div style="text-align:center;margin-top:8px;border-top:2px solid #000;padding-top:6px">
  <div style="font-size:13px;font-weight:700;color:#000">شكراً لزيارتكم</div>
  <div style="font-size:11px;color:#000;margin-top:3px;font-weight:700">CostControl POS System</div>
</div>
</body></html>`;
};

// Build kitchen receipt HTML — only items, quantities, notes (no prices)
export const buildKitchenReceiptHTML = (data: KitchenReceiptData): string => {
  const { invoiceNumber, branchName, date, items, orderType, customerName, companyName, orderTime, expectedDeliveryTime } = data;

  const itemsRows = items.map((item) =>
    `<tr style="border-bottom:2px solid #000">
      <td style="text-align:right;padding:7px 0;font-size:15px;font-weight:900;color:#000">${item.name}</td>
      <td style="text-align:center;padding:7px 0;font-size:18px;font-weight:900;color:#000">× ${item.quantity}</td>
    </tr>${item.notes ? `<tr><td colspan="2" style="text-align:right;font-size:14px;color:#000;padding:5px 8px 7px 8px;font-weight:900;background:#ddd;border-bottom:2px solid #000">⤷ ملاحظة: ${item.notes}</td></tr>` : ""}`
  ).join("");

  // Time block (highlighted) — shown when orderTime / expectedDeliveryTime provided (call center)
  const timeBlock = (orderTime || expectedDeliveryTime) ? `
    <div style="border:2px dashed #000;padding:6px;margin:6px 0;background:#fafafa">
      ${orderTime ? `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold"><span>⏱️ وقت الطلب:</span><span>${orderTime}</span></div>` : ""}
      ${expectedDeliveryTime ? `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#000;margin-top:3px;border-top:1px dashed #555;padding-top:4px"><span>🚚 التسليم المتوقع:</span><span>${expectedDeliveryTime}</span></div>` : ""}
    </div>
  ` : "";

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال المطبخ</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:15px;color:#000;line-height:1.5;font-weight:700;}
  table{width:100%;border-collapse:collapse;}
  @media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}
</style></head><body>
<div style="text-align:center;border:3px solid #000;padding:6px;margin-bottom:8px">
  <div style="font-size:20px;font-weight:900;color:#000">🍳 طلب مطبخ</div>
  ${companyName ? `<div style="font-size:13px;margin-top:2px;font-weight:700;color:#000">${companyName}</div>` : ""}
  ${branchName ? `<div style="font-size:13px;font-weight:700;color:#000">${branchName}</div>` : ""}
</div>
<div style="text-align:center;margin-bottom:6px;font-size:14px;border-bottom:2px solid #000;padding-bottom:6px;font-weight:700;color:#000">
  ${invoiceNumber ? `<div style="font-weight:900;font-size:17px;color:#000">فاتورة: ${invoiceNumber}</div>` : ""}
  <div style="font-weight:700;color:#000">${date}</div>
  ${orderType ? `<div style="font-weight:900;margin-top:3px;font-size:15px;color:#000">${orderType}</div>` : ""}
  ${customerName ? `<div style="font-weight:700;color:#000">العميل: ${customerName}</div>` : ""}
</div>
${timeBlock}
<table>
  <thead>
    <tr style="border-bottom:3px solid #000">
      <th style="text-align:right;font-size:14px;padding:6px 0;font-weight:900;color:#000">الصنف</th>
      <th style="text-align:center;font-size:14px;padding:6px 0;font-weight:900;color:#000">الكمية</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>
<div style="text-align:center;margin-top:10px;border-top:3px solid #000;padding-top:6px;font-size:13px;color:#000;font-weight:700">
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
