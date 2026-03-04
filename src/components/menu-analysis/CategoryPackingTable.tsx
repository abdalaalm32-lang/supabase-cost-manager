import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PackingItem {
  id: string;
  packing_name: string;
  cost: number;
}

interface Props {
  categoryName: string;
  periodId: string;
  companyId: string;
  packingItems: PackingItem[];
  avgPrice: number;
  onRefresh: () => void;
}

export const CategoryPackingTable: React.FC<Props> = ({ categoryName, periodId, companyId, packingItems, avgPrice, onRefresh }) => {
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [adding, setAdding] = useState(false);

  const totalCost = packingItems.reduce((s, i) => s + i.cost, 0);
  const packingPer = avgPrice > 0 ? (totalCost / avgPrice) * 100 : 0;

  const handleAdd = async () => {
    if (!newName.trim() || !newCost) return;
    setAdding(true);
    const { error } = await supabase.from("category_packing_items").insert({
      company_id: companyId,
      period_id: periodId,
      category_name: categoryName,
      packing_name: newName.trim(),
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
    await supabase.from("category_packing_items").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-center">Packing</TableHead>
            <TableHead className="text-center w-28">Cost</TableHead>
            <TableHead className="text-center w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packingItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-center text-sm">{item.packing_name}</TableCell>
              <TableCell className="text-center text-sm">{item.cost.toFixed(2)}</TableCell>
              <TableCell className="text-center">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item.id)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {/* Add row */}
          <TableRow>
            <TableCell>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم التغليف" className="h-7 text-sm" />
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
          {/* Totals */}
          <TableRow className="bg-muted/50 font-bold">
            <TableCell className="text-center text-sm">Packing Per.</TableCell>
            <TableCell className="text-center text-sm font-bold">{packingPer.toFixed(2)}%</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
