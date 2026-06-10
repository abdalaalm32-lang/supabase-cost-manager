import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { UtensilsCrossed, CheckCircle2, AlertCircle } from "lucide-react";

interface HeldSale {
  id: string;
  table_number: string | null;
  total_amount: number;
  invoice_number: string | null;
}

interface PosTablePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  branchId: string;
  tablesCount: number;
  currentTable?: string | null;
  currentSaleId?: string | null;
  /** Mode: pick = choose a table for a new/current order. transfer = move/merge existing order. */
  mode: "pick" | "transfer";
  /** Called when a free table is picked. */
  onPickFree: (tableLabel: string) => void;
  /** Called when an occupied table is picked (resume that held sale). */
  onPickOccupied?: (sale: HeldSale) => void;
  /** Called after a transfer/merge DB op completes. */
  onTransferComplete?: () => void;
}

export const PosTablePicker: React.FC<PosTablePickerProps> = ({
  open, onOpenChange, companyId, branchId, tablesCount,
  currentTable, currentSaleId, mode, onPickFree, onPickOccupied, onTransferComplete,
}) => {
  const { data: heldSales, refetch } = useQuery({
    queryKey: ["pos-held-tables", companyId, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("id, table_number, total_amount, invoice_number")
        .eq("company_id", companyId)
        .eq("branch_id", branchId)
        .eq("status", "معلق")
        .eq("order_type", "صالة")
        .not("table_number", "is", null);
      if (error) throw error;
      return (data || []) as HeldSale[];
    },
    enabled: !!companyId && !!branchId && open,
  });

  const tableMap = useMemo(() => {
    const m = new Map<string, HeldSale>();
    (heldSales || []).forEach((s) => { if (s.table_number) m.set(s.table_number, s); });
    return m;
  }, [heldSales]);

  const tables = useMemo(() => {
    const arr: string[] = [];
    for (let i = 1; i <= tablesCount; i++) arr.push(`T${i}`);
    return arr;
  }, [tablesCount]);

  const handleClick = async (label: string) => {
    const occupant = tableMap.get(label);
    if (mode === "pick") {
      if (occupant) {
        if (currentSaleId && occupant.id === currentSaleId) {
          onPickFree(label); // it's our own sale
          onOpenChange(false);
          return;
        }
        if (!onPickOccupied) return;
        onPickOccupied(occupant);
        onOpenChange(false);
      } else {
        onPickFree(label);
        onOpenChange(false);
      }
      return;
    }

    // transfer mode
    if (!currentSaleId) return;
    if (label === currentTable) { onOpenChange(false); return; }

    if (!occupant) {
      // Simple transfer
      const { error } = await supabase
        .from("pos_sales")
        .update({ table_number: label } as any)
        .eq("id", currentSaleId);
      if (error) { console.error(error); return; }
    } else {
      // Merge: move items from currentSaleId into occupant, sum totals, delete current
      const [{ data: srcItems }, { data: srcSale }, { data: dstSale }] = await Promise.all([
        supabase.from("pos_sale_items").select("*").eq("sale_id", currentSaleId),
        supabase.from("pos_sales").select("total_amount, discount_amount, tax_amount").eq("id", currentSaleId).single(),
        supabase.from("pos_sales").select("total_amount, discount_amount, tax_amount").eq("id", occupant.id).single(),
      ]);
      if (srcItems && srcItems.length) {
        const cloned = srcItems.map((it: any) => ({
          sale_id: occupant.id,
          pos_item_id: it.pos_item_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
          notes: it.notes,
        }));
        await supabase.from("pos_sale_items").insert(cloned);
      }
      const newTotal = (Number(dstSale?.total_amount) || 0) + (Number(srcSale?.total_amount) || 0);
      await supabase.from("pos_sales").update({ total_amount: newTotal } as any).eq("id", occupant.id);
      await supabase.from("pos_sale_items").delete().eq("sale_id", currentSaleId);
      await supabase.from("pos_sales").delete().eq("id", currentSaleId);
    }
    await refetch();
    onTransferComplete?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            {mode === "transfer" ? "نقل / دمج الطاولة" : "اختر الطاولة"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> فاضية</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> مشغولة {mode === "transfer" ? "(دمج)" : "(فتح الأوردر)"}</span>
            {currentTable && <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> الطاولة الحالية</span>}
          </DialogDescription>
        </DialogHeader>

        {tablesCount === 0 ? (
          <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8 opacity-50" />
            <p className="text-sm">لم يتم إعداد عدد الطاولات لهذا الفرع.</p>
            <p className="text-xs">يمكن تحديد عدد الطاولات من إعدادات الفروع.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 py-2">
            {tables.map((label) => {
              const occupant = tableMap.get(label);
              const isCurrent = label === currentTable;
              const occupied = !!occupant;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleClick(label)}
                  className={cn(
                    "relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.03] active:scale-95",
                    isCurrent
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : occupied
                        ? "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                        : "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                  )}
                  title={occupied ? `إجمالي: ${occupant!.total_amount.toFixed(2)} EGP` : "طاولة فاضية"}
                >
                  {isCurrent && (
                    <CheckCircle2 className="absolute top-1 left-1 h-3.5 w-3.5 text-amber-500" />
                  )}
                  <UtensilsCrossed className="h-5 w-5 opacity-80" />
                  <span className="font-black text-base">{label}</span>
                  {occupied && (
                    <span className="text-[10px] font-bold leading-none">
                      {occupant!.total_amount.toFixed(0)} EGP
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
