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
  branchId?: string;
  branchName?: string;
  companyName?: string;
}

// Reprint dialog for Call Center — shows today's delivery orders
export const CallCenterReprintDialog: React.FC<Props> = ({ companyId, branchId, branchName, companyName }) => {
  const [open, setOpen] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["call-center-reprint-orders", companyId, branchId],
    queryFn: async () => {
      if (!companyId) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let query = supabase
        .from("pos_sales")
        .select(`
          id, invoice_number, date, total_amount, delivery_fee, customer_name,
          customer_phone, customer_address, order_type, payment_method,
          notes, expected_delivery_time, branch_id,
          pos_sale_items (id, quantity, unit_price, notes, pos_items (name))
        `)
        .eq("company_id", companyId)
        .eq("order_type", "دليفري")
        .gte("date", today.toISOString())
        .order("date", { ascending: false })
        .limit(50);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const buildReceiptDataFromSale = (sale: any) => {
    const items = (sale.pos_sale_items || []).map((it: any) => ({
      name: it.pos_items?.name || "صنف",
      quantity: Number(it.quantity || 0),
      unit_price: Number(it.unit_price || 0),
      notes: it.notes || undefined,
    }));
    const total = Number(sale.total_amount || 0);
    const subtotal = total;
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
      discountAmount: 0,
      taxAmount: 0,
      taxRate: 0,
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
        notes: it.notes || undefined,
      })),
      orderType: sale.order_type,
      orderTime: format(new Date(sale.date), "HH:mm"),
      expectedDeliveryTime: expectedReady,
    });
    toast.success(`تم إرسال إيصال المطبخ #${sale.invoice_number} للطباعة`);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
        onClick={() => setOpen(true)}
        title="إعادة طباعة فواتير اليوم"
      >
        <Receipt className="h-3.5 w-3.5" />
        فواتير اليوم
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-500" />
              فواتير دليفري اليوم
              {sales && <Badge variant="secondary">{sales.length}</Badge>}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">جارٍ التحميل...</div>
            ) : !sales || sales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">لا توجد فواتير اليوم</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">الوقت</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">التليفون</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-center">إعادة طباعة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono font-bold">{sale.invoice_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(sale.date), "HH:mm")}</TableCell>
                      <TableCell className="text-xs">{sale.customer_name || "-"}</TableCell>
                      <TableCell className="text-xs" dir="ltr">{sale.customer_phone || "-"}</TableCell>
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
