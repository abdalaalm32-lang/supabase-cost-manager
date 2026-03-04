import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SideCostItem {
  id: string;
  cost_name: string;
  cost: number;
}

interface Props {
  categoryName: string;
  periodId: string;
  companyId: string;
  sideCostItems: SideCostItem[];
  onRefresh: () => void;
}

export const CategorySideCostTable: React.FC<Props> = ({ categoryName, periodId, companyId, sideCostItems, onRefresh }) => {
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [adding, setAdding] = useState(false);

  const totalCost = sideCostItems.reduce((s, i) => s + i.cost, 0);

  const handleAdd = async () => {
    if (!newName.trim() || !newCost) return;
    setAdding(true);
    const { error } = await supabase.from("category_side_costs" as any).insert({
      company_id: companyId,
      period_id: periodId,
      category_name: categoryName,
      cost_name: newName.trim(),
      cost: parseFloat(newCost) || 0,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      setNewName("");
      setNewCost("");
      onRefresh();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("category_side_costs" as any).delete().eq("id", id);
    onRefresh();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-center">التكلفة الإضافية</TableHead>
            <TableHead className="text-center w-28">القيمة</TableHead>
            <TableHead className="text-center w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sideCostItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-center text-sm">{item.cost_name}</TableCell>
              <TableCell className="text-center text-sm">{item.cost.toFixed(2)}</TableCell>
              <TableCell className="text-center">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item.id)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم التكلفة" className="h-7 text-sm" />
            </TableCell>
            <TableCell>
              <Input type="number" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="0" className="h-7 text-sm text-center" />
            </TableCell>
            <TableCell className="text-center">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd} disabled={adding}>
                <Plus size={14} className="text-primary" />
              </Button>
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted/50 font-bold">
            <TableCell className="text-center text-sm">الإجمالي</TableCell>
            <TableCell className="text-center text-sm font-bold">{totalCost.toFixed(2)}</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
