import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  totalIndirectExpenses: number;
  avgOrderPrice: number;
  avgDirectCost: number;
  avgDirectProfit: number;
  breakEvenOrders: number;
}

export const CategorySummaryTable: React.FC<Props> = ({
  totalIndirectExpenses,
  avgOrderPrice,
  avgDirectCost,
  avgDirectProfit,
  breakEvenOrders,
}) => {
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-sm font-medium">مصاريف غير مباشرة</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(totalIndirectExpenses)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">متوسط سعر الأوردر</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(avgOrderPrice)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">متوسط تكلفة مباشرة</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(avgDirectCost)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">متوسط ربحية مباشرة</TableCell>
            <TableCell className="text-center text-sm font-bold">{fmt(avgDirectProfit)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-sm font-medium">عدد الأوردرات لتحقيق نقطة التعادل</TableCell>
            <TableCell className="text-center text-sm font-bold">{Math.ceil(breakEvenOrders)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
