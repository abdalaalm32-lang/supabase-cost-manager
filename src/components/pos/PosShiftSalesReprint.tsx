import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Printer, ChefHat } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { printCustomerReceipt, printKitchenReceipt } from "@/lib/posPrintUtils";

interface Props {
  companyId: string;
  shiftId?: string;
  branchName?: string;
  companyName?: string;
}

export const PosShiftSalesReprint: React.FC<Props> = ({ companyId, shiftId, branchName, companyName }) => {
  const [open, setOpen] = useState(false);

  // Fetch shift opened_at as fallback for sales not linked via shift_id
  const { data: shiftInfo } = useQuery({
    queryKey: ["pos-shift-info-reprint", shiftId],
    queryFn: async () => {
      if (!shiftId) return null;
      const { data } = await supabase
        .from("pos_shifts")
        .select("opened_at, closed_at, branch_id")
        .eq("id", shiftId)
        .maybeSingle();
      return data;
    },
    enabled: !!shiftId && open,
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["pos-shift-sales-reprint", companyId, shiftId, shiftInfo?.opened_at],
    queryFn: async () => {
      if (!companyId || !shiftId) return [];

      const baseSelect = `
        id, invoice_number, date, total_amount, tax_amount, tax_rate, discount_amount,
        order_type, payment_method, customer_name, customer_phone, customer_address,
        delivery_fee, notes, expected_delivery_time, branch_id, shift_id,
        pos_sale_items (id, quantity, unit_price, pos_items (name))
      `;

      // 1) Primary: fetch by shift_id
      const { data: byShift, error: errShift } = await supabase
        .from("pos_sales")
        .select(baseSelect)
        .eq("company_id", companyId)
        .eq("shift_id", shiftId)
        .order("date", { ascending: false });
      if (errShift) throw errShift;

      const results = byShift || [];

      // 2) Fallback: include sales within shift time window that have NO shift_id (legacy)
      if (shiftInfo?.opened_at) {
        const startTime = shiftInfo.opened_at;
        const endTime = shiftInfo.closed_at || new Date().toISOString();
        const { data: byTime } = await supabase
          .from("pos_sales")
          .select(baseSelect)
          .eq("company_id", companyId)
          .is("shift_id", null)
          .gte("date", startTime)
          .lte("date", endTime)
          .order("date", { ascending: false });

        if (byTime && byTime.length) {
          const existingIds = new Set(results.map((r: any) => r.id));
          for (const s of byTime) if (!existingIds.has(s.id)) results.push(s);
        }
      }

      return results;
    },
    enabled: open && !!shiftId,
  });

  const buildReceiptDataFromSale = (sale: any) => {
    const items = (sale.pos_sale_items || []).map((it: any) => ({
      name: it.pos_items?.name || "صنف",
      quantity: Number(it.quantity || 0),
      unit_price: Number(it.unit_price || 0),
    }));
    const total = Number(sale.total_amount || 0);
    const taxAmount = Number(sale.tax_amount || 0);
    const discountAmount = Number(sale.discount_amount || 0);
    const subtotal = total + discountAmount - taxAmount;
    const expectedReady = sale.expected_delivery_time
      ? format(new Date(sale.expected_delivery_time), "yyyy/MM/dd HH:mm")
      : undefined;
    return {
      invoiceNumber: sale.invoice_number,
      branchName,
      companyName,
      customerName: sale.customer_name || undefined,
      customerPhone: sale.customer_phone || undefined,
      customerAddress: sale.customer_address || undefined,
      date: format(new Date(sale.date), "yyyy/MM/dd HH:mm"),
      items,
      subtotal,
      discountAmount,
      taxAmount,
      taxRate: Number(sale.tax_rate || 0),
      total,
      orderType: sale.order_type,
      paymentMethod: sale.payment_method,
      deliveryFee: Number(sale.delivery_fee || 0),
      notes: sale.notes || undefined,
      expectedReadyTime: expectedReady,
    };
  };

  const handleReprintCustomer = (sale: any) => {
    printCustomerReceipt(buildReceiptDataFromSale(sale));
    toast.success(`تم إرسال إيصال العميل #${sale.invoice_number} للطباعة`);
  };

  const handleReprintKitchen = (sale: any) => {
    const expectedReady = sale.expected_delivery_time
      ? format(new Date(sale.expected_delivery_time), "yyyy/MM/dd HH:mm")
      : undefined;
    printKitchenReceipt({
      invoiceNumber: sale.invoice_number,
      branchName,
      companyName,
      customerName: sale.customer_name || undefined,
      date: format(new Date(sale.date), "yyyy/MM/dd HH:mm"),
      items: (sale.pos_sale_items || []).map((it: any) => ({
        name: it.pos_items?.name || "صنف",
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
      })),
      orderType: sale.order_type,
      orderTime: format(new Date(sale.date), "HH:mm"),
      expectedDeliveryTime: expectedReady,
    });
    toast.success(`تم إرسال إيصال المطبخ #${sale.invoice_number} للطباعة`);
  };

  if (!shiftId) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
        onClick={() => setOpen(true)}
        title="إعادة طباعة فواتير الشيفت"
      >
        <Receipt className="h-3.5 w-3.5" />
        فواتير الشيفت
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-500" />
              فواتير الشيفت الحالي
              {sales && <Badge variant="secondary">{sales.length}</Badge>}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">جارٍ التحميل...</div>
            ) : !sales || sales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">لا توجد فواتير بعد في هذا الشيفت</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">الوقت</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-center">إعادة طباعة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono font-bold">{sale.invoice_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(sale.date), "HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{sale.order_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{sale.customer_name || "-"}</TableCell>
                      <TableCell className="font-semibold">
                        {(Number(sale.total_amount) + Number(sale.delivery_fee || 0)).toFixed(2)} EGP
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 gap-1 text-xs"
                            onClick={() => handleReprintCustomer(sale)}
                            title="إيصال العميل"
                          >
                            <Printer className="h-3 w-3" />
                            عميل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 gap-1 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                            onClick={() => handleReprintKitchen(sale)}
                            title="إيصال المطبخ"
                          >
                            <ChefHat className="h-3 w-3" />
                            مطبخ
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
