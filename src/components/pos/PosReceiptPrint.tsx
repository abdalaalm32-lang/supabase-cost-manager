import React, { forwardRef } from "react";

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface PosReceiptPrintProps {
  invoiceNumber?: string;
  branchName?: string;
  customerName?: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  discountLabel?: string;
  taxAmount: number;
  taxRate: number;
  total: number;
  companyName?: string;
}

export const PosReceiptPrint = forwardRef<HTMLDivElement, PosReceiptPrintProps>(
  ({ invoiceNumber, branchName, customerName, date, items, subtotal, discountAmount, discountLabel, taxAmount, taxRate, total, companyName }, ref) => {
    return (
      <div ref={ref} className="hidden print:block print:fixed print:inset-0 print:z-[9999] print:bg-white" dir="rtl">
        <div className="w-[80mm] mx-auto p-2 text-black text-xs font-mono" style={{ fontFamily: "'Cairo', monospace" }}>
          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
            <h2 className="text-sm font-bold">{companyName || "CostControl"}</h2>
            {branchName && <p className="text-[10px]">{branchName}</p>}
            <p className="text-[10px] mt-1">{date}</p>
            {invoiceNumber && <p className="text-[10px]">فاتورة رقم: {invoiceNumber}</p>}
            {customerName && <p className="text-[10px]">العميل: {customerName}</p>}
          </div>

          {/* Items */}
          <table className="w-full mb-2">
            <thead>
              <tr className="border-b border-dashed border-gray-400">
                <th className="text-right text-[10px] py-1">الصنف</th>
                <th className="text-center text-[10px] py-1">الكمية</th>
                <th className="text-center text-[10px] py-1">السعر</th>
                <th className="text-left text-[10px] py-1">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-dotted border-gray-200">
                  <td className="text-right py-1 text-[10px]">{item.name}</td>
                  <td className="text-center py-1 text-[10px]">{item.quantity}</td>
                  <td className="text-center py-1 text-[10px]">{item.unit_price.toFixed(2)}</td>
                  <td className="text-left py-1 text-[10px]">{(item.unit_price * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-dashed border-gray-400 pt-2 space-y-1">
            <div className="flex justify-between">
              <span>الإجمالي الفرعي:</span>
              <span>{subtotal.toFixed(2)} EGP</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between">
                <span>خصم {discountLabel || ""}:</span>
                <span>- {discountAmount.toFixed(2)} EGP</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span>ضريبة {taxRate}%:</span>
                <span>{taxAmount.toFixed(2)} EGP</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm border-t border-dashed border-gray-400 pt-1 mt-1">
              <span>الإجمالي:</span>
              <span>{total.toFixed(2)} EGP</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-3 border-t border-dashed border-gray-400 pt-2">
            <p className="text-[10px]">شكراً لزيارتكم</p>
            <p className="text-[9px] text-gray-500 mt-1">CostControl POS System</p>
          </div>
        </div>
      </div>
    );
  }
);

PosReceiptPrint.displayName = "PosReceiptPrint";
