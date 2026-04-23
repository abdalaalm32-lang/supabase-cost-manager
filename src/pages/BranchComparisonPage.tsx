/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BranchComparisonPage
 * --------------------------------------------------
 * تقرير مقارنة بين الفروع: يعرض كل الأصناف مع
 *   - تكلفة الصنف في كل فرع جنب بعض
 *   - متوسط تكلفة الصنف عبر الفروع
 *   - أعلى فرق نسبة (highest variance)
 *   - تلوين الخلايا (الأرخص أخضر، الأغلى أحمر)
 *
 * البيانات من جدول `stock_item_branch_costs` مع fallback
 * إلى `stock_items.avg_cost` لو الفرع ما عندوش سجل.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  GitCompareArrows, Search, Printer, FileSpreadsheet, FileText,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportUtils";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface RowData {
  itemId: string;
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  categoryName: string;
  globalCost: number;
  /** Map<branchId, cost> */
  branchCosts: Record<string, number>;
  /** Map<branchId, hasBranchSpecificRow> */
  branchHasRow: Record<string, boolean>;
  avgCost: number;
  minCost: number;
  maxCost: number;
  variancePct: number;
}

export const BranchComparisonPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [onlyVariance, setOnlyVariance] = useState(false);

  // Branches
  const { data: branches = [] } = useQuery({
    queryKey: ["bcomp-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("code", { ascending: true });
      return (data as { id: string; name: string; code: string | null }[]) || [];
    },
    enabled: !!companyId,
  });

  // Categories (inventory)
  const { data: categories = [] } = useQuery({
    queryKey: ["bcomp-categories", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_categories")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("active", true);
      return (data as { id: string; name: string }[]) || [];
    },
    enabled: !!companyId,
  });

  // Stock items
  const { data: stockItems = [] } = useQuery({
    queryKey: ["bcomp-stock-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("id, code, name, unit, avg_cost, category_id")
        .eq("company_id", companyId!)
        .order("code", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!companyId,
  });

  // Branch costs (all)
  const { data: branchCosts = [] } = useQuery({
    queryKey: ["bcomp-branch-costs", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, branch_id, avg_cost")
        .eq("company_id", companyId!);
      return (data as { stock_item_id: string; branch_id: string; avg_cost: number }[]) || [];
    },
    enabled: !!companyId,
  });

  // Build rows
  const rows = useMemo<RowData[]>(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    // index branch costs by item
    const byItem = new Map<string, Map<string, number>>();
    branchCosts.forEach((bc) => {
      if (!byItem.has(bc.stock_item_id)) byItem.set(bc.stock_item_id, new Map());
      byItem.get(bc.stock_item_id)!.set(bc.branch_id, Number(bc.avg_cost));
    });

    return stockItems.map((si): RowData => {
      const globalCost = Number(si.avg_cost) || 0;
      const itemBranchMap = byItem.get(si.id) || new Map();
      const branchCostsRow: Record<string, number> = {};
      const branchHasRow: Record<string, boolean> = {};
      const validCosts: number[] = [];
      branches.forEach((b) => {
        const has = itemBranchMap.has(b.id);
        const cost = has ? itemBranchMap.get(b.id)! : globalCost;
        branchCostsRow[b.id] = cost;
        branchHasRow[b.id] = has;
        if (cost > 0) validCosts.push(cost);
      });
      const avgCost =
        validCosts.length > 0 ? validCosts.reduce((s, x) => s + x, 0) / validCosts.length : globalCost;
      const minCost = validCosts.length ? Math.min(...validCosts) : globalCost;
      const maxCost = validCosts.length ? Math.max(...validCosts) : globalCost;
      const variancePct = minCost > 0 ? ((maxCost - minCost) / minCost) * 100 : 0;
      return {
        itemId: si.id,
        itemCode: si.code,
        itemName: si.name,
        unit: si.unit,
        categoryName: catMap.get(si.category_id) || "—",
        globalCost,
        branchCosts: branchCostsRow,
        branchHasRow,
        avgCost,
        minCost,
        maxCost,
        variancePct,
      };
    });
  }, [stockItems, branches, branchCosts, categories]);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          (r.itemCode || "").toLowerCase().includes(q) ||
          r.categoryName.toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") {
      out = out.filter((r) => r.categoryName === categoryFilter);
    }
    if (onlyVariance) {
      out = out.filter((r) => r.variancePct >= 1); // any meaningful variance
    }
    return out;
  }, [rows, search, categoryFilter, onlyVariance]);

  // Stats
  const stats = useMemo(() => {
    const withVariance = rows.filter((r) => r.variancePct >= 1);
    const high = rows.filter((r) => r.variancePct >= 15);
    const avgVariance =
      rows.length > 0 ? rows.reduce((s, r) => s + r.variancePct, 0) / rows.length : 0;
    return {
      totalItems: rows.length,
      withVariance: withVariance.length,
      highVariance: high.length,
      avgVariance,
    };
  }, [rows]);

  // Cell coloring
  const getCellClass = (cost: number, row: RowData, hasRow: boolean) => {
    if (!hasRow) return "text-muted-foreground/60 italic";
    if (row.minCost === row.maxCost) return "";
    if (cost === row.minCost) return "text-emerald-600 dark:text-emerald-500 font-semibold";
    if (cost === row.maxCost) return "text-red-600 dark:text-red-500 font-semibold";
    return "";
  };

  // Export
  const buildExportData = () =>
    filteredRows.map((r) => {
      const row: Record<string, any> = {
        code: r.itemCode || "",
        name: r.itemName,
        unit: r.unit || "",
        category: r.categoryName,
      };
      branches.forEach((b) => {
        row[`branch_${b.id}`] = fmt(r.branchCosts[b.id] || 0);
      });
      row.avg = fmt(r.avgCost);
      row.variance = r.variancePct.toFixed(1) + "%";
      return row;
    });

  const buildExportColumns = () => [
    { key: "code", label: "الكود" },
    { key: "name", label: "الصنف" },
    { key: "unit", label: "الوحدة" },
    { key: "category", label: "المجموعة" },
    ...branches.map((b) => ({ key: `branch_${b.id}`, label: b.name })),
    { key: "avg", label: "المتوسط" },
    { key: "variance", label: "التباين %" },
  ];

  const handleExportPDF = () => {
    exportToPDF({
      title: "تقرير مقارنة الفروع - تكاليف الأصناف",
      filename: `branch-comparison-${new Date().toISOString().slice(0, 10)}`,
      columns: buildExportColumns(),
      data: buildExportData(),
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: "تقرير مقارنة الفروع",
      filename: `branch-comparison-${new Date().toISOString().slice(0, 10)}`,
      columns: buildExportColumns(),
      data: buildExportData(),
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (branches.length < 2) {
    return (
      <div className="p-6 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="p-8 text-center">
            <GitCompareArrows className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-bold mb-2">يحتاج فرعين على الأقل</h2>
            <p className="text-sm text-muted-foreground">
              لعرض تقرير مقارنة الفروع، يجب أن يكون لديك فرعين على الأقل نشطين في النظام.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 print:p-2" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompareArrows className="h-7 w-7 text-primary" />
            مقارنة تكاليف الفروع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تكلفة كل صنف في كل فرع جنب بعض، مع المتوسط ونسبة التباين
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 ml-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalItems}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">أصناف بها تباين</p>
            <p className="text-2xl font-bold text-amber-600">{stats.withVariance}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">تباين عالي ≥ 15%</p>
            <p className="text-2xl font-bold text-red-600">{stats.highVariance}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">متوسط التباين</p>
            <p className="text-2xl font-bold text-purple-600">{stats.avgVariance.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">بحث</label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="اسم أو كود الصنف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs pr-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">المجموعة</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">عرض</label>
              <Button
                size="sm"
                variant={onlyVariance ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setOnlyVariance(!onlyVariance)}
              >
                {onlyVariance ? "الأصناف المتباينة فقط" : "كل الأصناف"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b flex items-center justify-between">
            <h2 className="font-bold text-sm">الأصناف ({filteredRows.length})</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> الأرخص
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> الأغلى
              </span>
              <span className="italic">قيمة افتراضية (لا يوجد سجل)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right text-xs sticky right-0 bg-muted/40 z-10">الكود</TableHead>
                  <TableHead className="text-right text-xs">الصنف</TableHead>
                  <TableHead className="text-right text-xs">المجموعة</TableHead>
                  <TableHead className="text-right text-xs">الوحدة</TableHead>
                  {branches.map((b) => (
                    <TableHead key={b.id} className="text-center text-xs whitespace-nowrap">
                      {b.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-xs bg-primary/5">المتوسط</TableHead>
                  <TableHead className="text-center text-xs bg-amber-500/5">التباين %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5 + branches.length} className="text-center py-8 text-muted-foreground text-sm">
                      لا توجد بيانات للعرض
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => (
                    <TableRow key={r.itemId} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-mono sticky right-0 bg-card z-10">
                        {r.itemCode || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{r.itemName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.categoryName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.unit || "—"}</TableCell>
                      {branches.map((b) => {
                        const cost = r.branchCosts[b.id] || 0;
                        const hasRow = r.branchHasRow[b.id];
                        return (
                          <TableCell
                            key={b.id}
                            className={`text-xs text-center tabular-nums ${getCellClass(cost, r, hasRow)}`}
                          >
                            {fmt(cost)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-xs text-center tabular-nums font-bold bg-primary/5">
                        {fmt(r.avgCost)}
                      </TableCell>
                      <TableCell className="text-center bg-amber-500/5">
                        {r.variancePct < 1 ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600">
                            <Minus className="h-2.5 w-2.5" />
                            متطابق
                          </Badge>
                        ) : r.variancePct >= 15 ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-red-500/40 text-red-600 bg-red-500/10">
                            <TrendingUp className="h-2.5 w-2.5" />
                            {r.variancePct.toFixed(1)}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-600 bg-amber-500/10">
                            <TrendingDown className="h-2.5 w-2.5" />
                            {r.variancePct.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
