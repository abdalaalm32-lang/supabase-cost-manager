import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PosHeldInvoicesProps {
  companyId: string;
  branchId: string;
  onResume: (sale: any, items: any[]) => void;
}

export const PosHeldInvoices: React.FC<PosHeldInvoicesProps> = ({ companyId, branchId, onResume }) => {
  const [open, setOpen] = React.useState(false);

  const { data: heldSales, refetch } = useQuery({
    queryKey: ["pos-held-sales", companyId, branchId],
    queryFn: async () => {
      let query = supabase
        .from("pos_sales")
        .select("*, branches:branch_id(name)")
        .eq("company_id", companyId)
        .eq("status", "معلق")
        .order("created_at", { ascending: false });
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

  const handleResume = async (sale: any) => {
    const { data: saleItems } = await supabase
      .from("pos_sale_items")
      .select("*, pos_items:pos_item_id(name, categories:category_id(name))")
      .eq("sale_id", sale.id);

    onResume(sale, saleItems || []);
    setOpen(false);
  };

  const handleDelete = async (saleId: string) => {
    await supabase.from("pos_sale_items").delete().eq("sale_id", saleId);
    await supabase.from("pos_sales").delete().eq("id", saleId);
    toast.success("تم حذف الفاتورة المعلقة");
    refetch();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Pause className="h-3.5 w-3.5" />
          المعلقة
          {heldSales && heldSales.length > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{heldSales.length}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>الفواتير المعلقة</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          {(!heldSales || heldSales.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">لا توجد فواتير معلقة</p>
          ) : (
            <div className="space-y-2">
              {heldSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div>
                    <p className="font-semibold text-sm">{sale.invoice_number || "—"}</p>
                    <p className="text-xs text-muted-foreground">{(sale.branches as any)?.name} · {format(new Date(sale.date), "yyyy/MM/dd HH:mm")}</p>
                    <p className="text-xs font-bold text-primary mt-0.5">{sale.total_amount.toFixed(2)} EGP</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleResume(sale)}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(sale.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
