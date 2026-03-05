import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  categoryName: string;
  totalSellingPrice: number;
  totalDirectCost: number;
  totalIndirectCost: number;
  netTakeAway: number;
  netTable: number;
  itemsCount: number;
}

export const CategoryFinancialTable: React.FC<Props> = ({
  categoryName,
  totalSellingPrice,
  totalDirectCost,
  totalIndirectCost,
  netTakeAway,
  netTable,
  itemsCount,
}) => {
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number, base: number) =>
    base > 0 ? ((n / base) * 100).toFixed(2) + "%" : "0%";

  const netTakeAwayPct = totalSellingPrice > 0 ? (netTakeAway / totalSellingPrice) * 100 : 0;
  const netTablePct = totalSellingPrice > 0 ? (netTable / totalSellingPrice) * 100 : 0;

  const profitLabel = "نسبة صافي الربح";

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-sm font-medium">Selling Price {categoryName}</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(totalSellingPrice)}</TableCell>
            <TableCell className="text-center text-sm"></TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">Total Direct {categoryName} Cost</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(totalDirectCost)}</TableCell>
            <TableCell className="text-center text-sm"></TableCell>
          </TableRow>
          <TableRow className="bg-muted/30">
            <TableCell className="text-sm font-medium text-orange-600">Total Indirect {categoryName} Cost</TableCell>
            <TableCell className="text-center text-sm font-bold text-orange-600">{fmt(totalIndirectCost)}</TableCell>
            <TableCell className="text-center text-sm font-semibold">{profitLabel}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">Net Take Away</TableCell>
            <TableCell className={`text-center text-sm font-bold ${netTakeAway < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {fmt(netTakeAway)}
            </TableCell>
            <TableCell className={`text-center text-sm font-semibold ${netTakeAwayPct < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {netTakeAwayPct.toFixed(2)}%
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">Net Table</TableCell>
            <TableCell className={`text-center text-sm font-bold ${netTable < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {fmt(netTable)}
            </TableCell>
            <TableCell className={`text-center text-sm font-semibold ${netTablePct < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {netTablePct.toFixed(2)}%
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">Items Number</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(itemsCount)}</TableCell>
            <TableCell className="text-center text-sm"></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
