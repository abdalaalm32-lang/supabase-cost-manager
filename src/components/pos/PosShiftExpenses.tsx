/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wallet, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface PosShiftExpensesProps {
  companyId: string;
  shiftId: string | null;
  userName: string;
}

export const PosShiftExpenses: React.FC<PosShiftExpensesProps> = ({ companyId, shiftId, userName }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);

  const { data: expenses } = useQuery({
    queryKey: ["pos-shift-expenses", shiftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shift_expenses")
        .select("*")
        .eq("shift_id", shiftId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!shiftId,
  });

  const addExpense = useMutation({
    mutationFn: async () => {
      if (!shiftId) throw new Error("لا يوجد شيفت مفتوح");
      if (!description.trim()) throw new Error("يجب إدخال وصف المصروف");
      if (amount <= 0) throw new Error("يجب إدخال مبلغ صحيح");
      const { error } = await supabase.from("pos_shift_expenses").insert({
        shift_id: shiftId,
        company_id: companyId,
        description: description.trim(),
        amount,
        created_by: userName,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل المصروف");
      setDescription("");
      setAmount(0);
      queryClient.invalidateQueries({ queryKey: ["pos-shift-expenses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_shift_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المصروف");
      queryClient.invalidateQueries({ queryKey: ["pos-shift-expenses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalExpenses = expenses?.reduce((s, e: any) => s + (e.amount || 0), 0) ?? 0;

  if (!shiftId) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[10px] gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
        onClick={() => setOpen(true)}
      >
        <Wallet className="h-3 w-3" />
        مصروفات
        {totalExpenses > 0 && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1 mr-1">
            {totalExpenses.toFixed(0)}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-amber-500" />
              مصروفات الشيفت
              {totalExpenses > 0 && (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                  إجمالي: {totalExpenses.toFixed(2)} EGP
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Add new expense */}
          <div className="flex gap-2">
            <Input
              placeholder="وصف المصروف (مثل: مشتريات، صيانة...)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 text-xs h-8"
            />
            <Input
              type="number"
              placeholder="المبلغ"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-24 text-xs h-8"
            />
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => addExpense.mutate()}
              disabled={addExpense.isPending || !description.trim() || amount <= 0}
            >
              <Plus className="h-3 w-3" />
              إضافة
            </Button>
          </div>

          {/* Expenses list */}
          <ScrollArea className="max-h-[300px]">
            {!expenses || expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                لا توجد مصروفات مسجلة في هذا الشيفت
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs text-right">الوصف</TableHead>
                    <TableHead className="text-xs text-right">المبلغ</TableHead>
                    <TableHead className="text-xs text-right">الوقت</TableHead>
                    <TableHead className="text-xs text-center w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp: any) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-xs">{exp.description}</TableCell>
                      <TableCell className="text-xs font-bold text-amber-500">{exp.amount?.toFixed(2)} EGP</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(exp.created_at), "HH:mm")}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => deleteExpense.mutate(exp.id)}
                          disabled={deleteExpense.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
