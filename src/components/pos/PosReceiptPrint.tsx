import React, { forwardRef } from "react";

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
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
  notes?: string;
  orderType?: string;
  paymentMethod?: string;
  deliveryFee?: number;
  customerPhone?: string;
  customerPhone2?: string;
  customerAddress?: string;
}

export const PosReceiptPrint = forwardRef<HTMLDivElement, PosReceiptPrintProps>(
  ({ invoiceNumber, branchName, customerName, date, items, subtotal, discountAmount, discountLabel, taxAmount, taxRate, total, companyName, notes, orderType, paymentMethod, deliveryFee, customerPhone, customerPhone2, customerAddress }, ref) => {
    return (
      <div ref={ref} style={{ position: "fixed", left: "-9999px", top: 0, background: "#fff", direction: "rtl" }}>
        <div style={{ width: "72mm", margin: "0 auto", padding: "4px 6px", color: "#000", fontFamily: "'Cairo', 'Tahoma', sans-serif", fontSize: "11px", lineHeight: "1.4" }}>
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "1px dashed #000", paddingBottom: "6px", marginBottom: "6px" }}>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>{companyName || "CostControl"}</div>
            {branchName && <div style={{ fontSize: "10px" }}>{branchName}</div>}
            <div style={{ fontSize: "10px", marginTop: "3px" }}>{date}</div>
            {invoiceNumber && <div style={{ fontSize: "10px" }}>فاتورة رقم: {invoiceNumber}</div>}
            {customerName && <div style={{ fontSize: "10px" }}>العميل: {customerName}</div>}
            {customerPhone && <div style={{ fontSize: "10px" }} dir="ltr">{customerPhone}{customerPhone2 ? ` / ${customerPhone2}` : ""}</div>}
            {customerAddress && <div style={{ fontSize: "10px" }}>العنوان: {customerAddress}</div>}
            {orderType && <div style={{ fontSize: "10px" }}>نوع الطلب: {orderType}</div>}
            {paymentMethod && <div style={{ fontSize: "10px" }}>طريقة الدفع: {paymentMethod}</div>}
          </div>

          {/* Items */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
            <thead>
              <tr style={{ borderBottom: "1px dashed #000" }}>
                <th style={{ textAlign: "right", fontSize: "10px", padding: "2px 0" }}>الصنف</th>
                <th style={{ textAlign: "center", fontSize: "10px", padding: "2px 0" }}>الكمية</th>
                <th style={{ textAlign: "center", fontSize: "10px", padding: "2px 0" }}>السعر</th>
                <th style={{ textAlign: "left", fontSize: "10px", padding: "2px 0" }}>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <React.Fragment key={i}>
                  <tr style={{ borderBottom: "1px dotted #ccc" }}>
                    <td style={{ textAlign: "right", padding: "2px 0", fontSize: "10px" }}>{item.name}</td>
                    <td style={{ textAlign: "center", padding: "2px 0", fontSize: "10px" }}>{item.quantity}</td>
                    <td style={{ textAlign: "center", padding: "2px 0", fontSize: "10px" }}>{item.unit_price.toFixed(2)}</td>
                    <td style={{ textAlign: "left", padding: "2px 0", fontSize: "10px" }}>{(item.unit_price * item.quantity).toFixed(2)}</td>
                  </tr>
                  {item.notes && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "right", fontSize: "9px", color: "#666", paddingBottom: "2px", paddingRight: "8px" }}>⤷ {item.notes}</td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ borderTop: "1px dashed #000", paddingTop: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
              <span>الإجمالي الفرعي:</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                <span>خصم {discountLabel || ""}:</span>
                <span>- {discountAmount.toFixed(2)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                <span>ضريبة {taxRate}%:</span>
                <span>{taxAmount.toFixed(2)}</span>
              </div>
            )}
            {(deliveryFee ?? 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                <span>رسوم التوصيل:</span>
                <span>{(deliveryFee ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px", borderTop: "1px dashed #000", paddingTop: "4px", marginTop: "4px" }}>
              <span>الإجمالي:</span>
              <span>{(total + (deliveryFee ?? 0)).toFixed(2)} EGP</span>
            </div>
          </div>

          {/* Notes */}
          {notes && (
            <div style={{ borderTop: "1px dashed #000", paddingTop: "6px", marginTop: "6px" }}>
              <div style={{ fontSize: "10px" }}><span style={{ fontWeight: "bold" }}>ملاحظات:</span> {notes}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: "8px", borderTop: "1px dashed #000", paddingTop: "6px" }}>
            <div style={{ fontSize: "10px" }}>شكراً لزيارتكم</div>
            <div style={{ fontSize: "9px", color: "#666", marginTop: "3px" }}>CostControl POS System</div>
          </div>
        </div>
      </div>
    );
  }
);

PosReceiptPrint.displayName = "PosReceiptPrint";
