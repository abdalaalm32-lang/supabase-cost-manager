/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BranchComparisonPage
 * --------------------------------------------------
 * مقارنة بين الفروع بثلاث أوضاع:
 *  1) التكلفة     - avg_cost لكل صنف في كل فرع (الوضع الأصلي)
 *  2) الاستلامات  - كمية المشتريات المكتملة الواردة لكل فرع خلال الفترة
 *  3) التباين     - شورت/أوفر = (جرد فعلي - رصيد دفتري) لكل فرع خلال الفترة
 *                  (الرصيد الدفتري = أول مدة + وارد - صادر، نفس منطق صفحة تحليل التكاليف)
 *                  لو الفرع مفيش له جرد فعلي للصنف في الفترة → "—"
 *
 * فلتر التباين (slider %): يعرض الأصناف اللي نسبة فرقها بين الفروع
 * (max-min/|min|) ≥ الحد المختار.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  GitCompareArrows, Search, Printer, FileSpreadsheet, FileText,
  TrendingUp, TrendingDown, Minus, CalendarIcon, DollarSign, Package, AlertTriangle,
} from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportUtils";
import { PrintButton } from "@/components/PrintButton";

type Mode = "cost" | "receipts" | "variance";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const fetchAllRows = async <T,>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
) => {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
};

interface RowData {
  itemId: string;
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  categoryId: string | null;
  categoryName: string;
  /** value per branchId — null means "—" (not applicable) */
  branchValues: Record<string, number | null>;
  avg: number;
  minVal: number;
  maxVal: number;
  variancePct: number;
}

export const BranchComparisonPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  // --- UI State ---
  const [mode, setMode] = useState<Mode>("cost");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [varianceThreshold, setVarianceThreshold] = useState<number>(0); // %
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const needsDates = mode !== "cost";
  const datesReady = !needsDates || (!!dateFrom && !!dateTo);

  // --- Core lookups ---
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

  const { data: stockItems = [] } = useQuery({
    queryKey: ["bcomp-stock-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("id, code, name, stock_unit, avg_cost, category_id, conversion_factor")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("code", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!companyId,
  });

  // Cost mode data
  const { data: branchCosts = [] } = useQuery({
    queryKey: ["bcomp-branch-costs", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, branch_id, avg_cost")
        .eq("company_id", companyId!);
      return (data as { stock_item_id: string; branch_id: string; avg_cost: number }[]) || [];
    },
    enabled: !!companyId && mode === "cost",
  });

  // Receipts mode data (purchases only)
  const { data: purchaseData = [] } = useQuery({
    queryKey: ["bcomp-purchases", companyId],
    queryFn: async () => {
      return fetchAllRows<any>((from, to) =>
        supabase
          .from("purchase_items")
          .select("stock_item_id, quantity, purchase_orders!inner(id, date, status, company_id, branch_id)")
          .eq("purchase_orders.company_id", companyId!)
          .eq("purchase_orders.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      );
    },
    enabled: !!companyId && (mode === "receipts" || mode === "variance"),
  });

  // Variance mode extra data
  const { data: stocktakeData = [] } = useQuery({
    queryKey: ["bcomp-stocktakes", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("stocktake_items")
          .select("stock_item_id, counted_qty, stocktakes!inner(id, date, status, company_id, branch_id)")
          .eq("stocktakes.company_id", companyId!)
          .eq("stocktakes.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  const { data: productionRecords = [] } = useQuery({
    queryKey: ["bcomp-production-records", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("production_records")
        .select("id, date, status, branch_id, product_id, produced_qty")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل");
      return data || [];
    },
    enabled: !!companyId && mode === "variance",
  });

  const { data: productionIngData = [] } = useQuery({
    queryKey: ["bcomp-production-ing", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("production_ingredients")
          .select("stock_item_id, required_qty, production_records!inner(id, date, status, company_id, branch_id)")
          .eq("production_records.company_id", companyId!)
          .eq("production_records.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  const { data: wasteData = [] } = useQuery({
    queryKey: ["bcomp-waste", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("waste_items")
          .select("stock_item_id, quantity, waste_records!inner(id, date, status, company_id, branch_id)")
          .eq("waste_records.company_id", companyId!)
          .eq("waste_records.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  const { data: transferData = [] } = useQuery({
    queryKey: ["bcomp-transfers", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("transfer_items")
          .select("stock_item_id, quantity, transfers!inner(id, date, status, company_id, source_id, destination_id)")
          .eq("transfers.company_id", companyId!)
          .eq("transfers.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  const { data: posSaleItems = [] } = useQuery({
    queryKey: ["bcomp-pos-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("pos_sale_items")
          .select("pos_item_id, quantity, pos_sales!inner(id, date, status, company_id, branch_id)")
          .eq("pos_sales.company_id", companyId!)
          .eq("pos_sales.status", "مكتمل")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  const { data: recipeIngredients = [] } = useQuery({
    queryKey: ["bcomp-recipe-ing", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("recipe_ingredients")
          .select("stock_item_id, qty, recipes!inner(id, menu_item_id, company_id)")
          .eq("recipes.company_id", companyId!)
          .order("id", { ascending: true })
          .range(from, to)
      ),
    enabled: !!companyId && mode === "variance",
  });

  // --- Date helpers ---
  const inRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };
  const beforePeriod = (dateStr: string) =>
    !!(dateFrom && dateStr && new Date(dateStr) < dateFrom);

  // --- Build rows ---
  const rows = useMemo<RowData[]>(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    // ============ COST MODE ============
    if (mode === "cost") {
      const byItem = new Map<string, Map<string, number>>();
      branchCosts.forEach((bc) => {
        if (!byItem.has(bc.stock_item_id)) byItem.set(bc.stock_item_id, new Map());
        byItem.get(bc.stock_item_id)!.set(bc.branch_id, Number(bc.avg_cost));
      });

      return stockItems.map((si): RowData => {
        const globalCost = Number(si.avg_cost) || 0;
        const itemBranchMap = byItem.get(si.id) || new Map();
        const branchValues: Record<string, number | null> = {};
        const valid: number[] = [];
        branches.forEach((b) => {
          const cost = itemBranchMap.has(b.id) ? itemBranchMap.get(b.id)! : globalCost;
          branchValues[b.id] = cost;
          if (cost > 0) valid.push(cost);
        });
        const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : globalCost;
        const minV = valid.length ? Math.min(...valid) : globalCost;
        const maxV = valid.length ? Math.max(...valid) : globalCost;
        const variancePct = minV > 0 ? ((maxV - minV) / minV) * 100 : 0;
        return {
          itemId: si.id,
          itemCode: si.code,
          itemName: si.name,
          unit: si.stock_unit,
          categoryId: si.category_id ?? null,
          categoryName: catMap.get(si.category_id) || "—",
          branchValues,
          avg,
          minVal: minV,
          maxVal: maxV,
          variancePct,
        };
      });
    }

    // ============ RECEIPTS MODE ============
    if (mode === "receipts") {
      if (!datesReady) return [];
      // sum qty per item per branch within range
      const map = new Map<string, Map<string, number>>();
      purchaseData.forEach((pi: any) => {
        const po = pi.purchase_orders;
        if (!po || !inRange(po.date)) return;
        if (!pi.stock_item_id || !po.branch_id) return;
        if (!map.has(pi.stock_item_id)) map.set(pi.stock_item_id, new Map());
        const m = map.get(pi.stock_item_id)!;
        m.set(po.branch_id, (m.get(po.branch_id) ?? 0) + Number(pi.quantity));
      });

      return stockItems.map((si): RowData => {
        const itemMap = map.get(si.id) || new Map();
        const branchValues: Record<string, number | null> = {};
        const valid: number[] = [];
        branches.forEach((b) => {
          const v = itemMap.get(b.id) ?? 0;
          branchValues[b.id] = v;
          valid.push(v);
        });
        const positives = valid.filter((v) => v > 0);
        const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : 0;
        const minV = positives.length ? Math.min(...positives) : 0;
        const maxV = valid.length ? Math.max(...valid) : 0;
        const variancePct = minV > 0 ? ((maxV - minV) / minV) * 100 : maxV > 0 ? 100 : 0;
        return {
          itemId: si.id,
          itemCode: si.code,
          itemName: si.name,
          unit: si.stock_unit,
          categoryId: si.category_id ?? null,
          categoryName: catMap.get(si.category_id) || "—",
          branchValues,
          avg,
          minVal: minV,
          maxVal: maxV,
          variancePct,
        };
      });
    }

    // ============ VARIANCE MODE ============
    if (mode === "variance") {
      if (!datesReady) return [];

      // Build recipe map: menu_item_id -> [{stock_item_id, qtyPerUnit}]
      const stockInfo = new Map<string, { conv: number }>();
      stockItems.forEach((si: any) =>
        stockInfo.set(si.id, { conv: Number(si.conversion_factor) || 1 })
      );
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      recipeIngredients.forEach((ri: any) => {
        const menuItemId = ri.recipes?.menu_item_id;
        if (!menuItemId || !ri.stock_item_id) return;
        if (!recipeMap.has(menuItemId)) recipeMap.set(menuItemId, []);
        const conv = stockInfo.get(ri.stock_item_id)?.conv ?? 1;
        recipeMap.get(menuItemId)!.push({
          stock_item_id: ri.stock_item_id,
          qty: Number(ri.qty) / conv,
        });
      });

      // Per (itemId, branchId): accumulate open/in/out, count
      // open = latest stocktake before dateFrom (counted_qty)
      // count = latest stocktake within range
      type Acc = { open: number; inQ: number; outQ: number; count: number; hasStocktake: boolean };
      const acc = new Map<string, Acc>(); // key = itemId|branchId
      const keyOf = (i: string, b: string) => `${i}|${b}`;
      const ensure = (i: string, b: string): Acc => {
        const k = keyOf(i, b);
        if (!acc.has(k)) acc.set(k, { open: 0, inQ: 0, outQ: 0, count: 0, hasStocktake: false });
        return acc.get(k)!;
      };

      // Opening stock from latest stocktake before period
      const latestBefore = new Map<string, { qty: number; date: string }>();
      stocktakeData.forEach((si: any) => {
        const st = si.stocktakes;
        if (!st?.date || !st.branch_id) return;
        if (!beforePeriod(st.date)) return;
        const k = keyOf(si.stock_item_id, st.branch_id);
        const ex = latestBefore.get(k);
        if (!ex || st.date > ex.date) {
          latestBefore.set(k, { qty: Number(si.counted_qty), date: st.date });
        }
      });
      latestBefore.forEach((v, k) => {
        const [i, b] = k.split("|");
        ensure(i, b).open = v.qty;
      });

      // Latest stocktake within range → count
      const latestIn = new Map<string, { qty: number; date: string }>();
      stocktakeData.forEach((si: any) => {
        const st = si.stocktakes;
        if (!st?.date || !st.branch_id) return;
        if (!inRange(st.date)) return;
        const k = keyOf(si.stock_item_id, st.branch_id);
        const ex = latestIn.get(k);
        if (!ex || st.date > ex.date) {
          latestIn.set(k, { qty: Number(si.counted_qty), date: st.date });
        }
      });
      latestIn.forEach((v, k) => {
        const [i, b] = k.split("|");
        const a = ensure(i, b);
        a.count = v.qty;
        a.hasStocktake = true;
      });

      // Purchases IN
      purchaseData.forEach((pi: any) => {
        const po = pi.purchase_orders;
        if (!po || !inRange(po.date) || !po.branch_id || !pi.stock_item_id) return;
        ensure(pi.stock_item_id, po.branch_id).inQ += Number(pi.quantity);
      });

      // Production produced IN
      productionRecords.forEach((pr: any) => {
        if (!pr.date || !inRange(pr.date) || !pr.branch_id || !pr.product_id) return;
        ensure(pr.product_id, pr.branch_id).inQ += Number(pr.produced_qty);
      });

      // Production ingredients OUT
      productionIngData.forEach((ing: any) => {
        const pr = ing.production_records;
        if (!pr || !inRange(pr.date) || !pr.branch_id || !ing.stock_item_id) return;
        ensure(ing.stock_item_id, pr.branch_id).outQ += Number(ing.required_qty);
      });

      // Waste OUT
      wasteData.forEach((wi: any) => {
        const wr = wi.waste_records;
        if (!wr || !inRange(wr.date) || !wr.branch_id || !wi.stock_item_id) return;
        ensure(wi.stock_item_id, wr.branch_id).outQ += Number(wi.quantity);
      });

      // Transfers: source -> outQ, destination -> inQ (only when source/dest is a branch)
      const branchIds = new Set(branches.map((b) => b.id));
      transferData.forEach((ti: any) => {
        const tr = ti.transfers;
        if (!tr || !inRange(tr.date) || !ti.stock_item_id) return;
        const q = Number(ti.quantity);
        if (tr.source_id && branchIds.has(tr.source_id)) {
          ensure(ti.stock_item_id, tr.source_id).outQ += q;
        }
        if (tr.destination_id && branchIds.has(tr.destination_id)) {
          ensure(ti.stock_item_id, tr.destination_id).inQ += q;
        }
      });

      // POS sales → ingredients out per branch
      posSaleItems.forEach((sale: any) => {
        const ps = sale.pos_sales;
        if (!ps || !inRange(ps.date) || !ps.branch_id || !sale.pos_item_id) return;
        const ingredients = recipeMap.get(sale.pos_item_id);
        if (!ingredients) return;
        const qSold = Number(sale.quantity);
        ingredients.forEach((ing) => {
          ensure(ing.stock_item_id, ps.branch_id).outQ += ing.qty * qSold;
        });
      });

      // Build rows
      const round4 = (n: number) => Math.round(n * 10000) / 10000;
      return stockItems.map((si): RowData => {
        const branchValues: Record<string, number | null> = {};
        const valid: number[] = [];
        branches.forEach((b) => {
          const a = acc.get(keyOf(si.id, b.id));
          if (!a || !a.hasStocktake) {
            branchValues[b.id] = null; // "—"
            return;
          }
          const book = round4(a.open + a.inQ - a.outQ);
          let v = round4(a.count - book);
          if (Math.abs(v) < 0.01) v = 0;
          branchValues[b.id] = v;
          valid.push(v);
        });
        const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : 0;
        const minV = valid.length ? Math.min(...valid) : 0;
        const maxV = valid.length ? Math.max(...valid) : 0;
        // For variance mode, "variancePct" = absolute spread vs avg-of-abs to allow filtering
        const denom = Math.max(Math.abs(minV), Math.abs(maxV));
        const variancePct = denom > 0 ? ((maxV - minV) / denom) * 100 : 0;
        return {
          itemId: si.id,
          itemCode: si.code,
          itemName: si.name,
          unit: si.stock_unit,
          categoryId: si.category_id ?? null,
          categoryName: catMap.get(si.category_id) || "—",
          branchValues,
          avg,
          minVal: minV,
          maxVal: maxV,
          variancePct,
        };
      });
    }

    return [];
  }, [
    mode, datesReady, dateFrom, dateTo,
    stockItems, branches, categories, branchCosts, purchaseData,
    stocktakeData, productionRecords, productionIngData, wasteData,
    transferData, posSaleItems, recipeIngredients,
  ]);

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
      out = out.filter((r) => r.categoryId === categoryFilter);
    }
    if (varianceThreshold > 0) {
      out = out.filter((r) => r.variancePct >= varianceThreshold);
    }
    // In receipts/variance mode hide rows where every branch is 0/null
    if (mode !== "cost") {
      out = out.filter((r) =>
        Object.values(r.branchValues).some((v) => v !== null && Math.abs(v) > 0.0001)
      );
    }
    return out;
  }, [rows, search, categoryFilter, varianceThreshold, mode]);

  const stats = useMemo(() => {
    const withVariance = rows.filter((r) => r.variancePct >= 1).length;
    const high = rows.filter((r) => r.variancePct >= 15).length;
    const avgVariance =
      rows.length > 0 ? rows.reduce((s, r) => s + r.variancePct, 0) / rows.length : 0;
    return {
      totalItems: rows.length,
      withVariance,
      highVariance: high,
      avgVariance,
    };
  }, [rows]);

  // Cell coloring per mode
  const getCellClass = (val: number | null, row: RowData) => {
    if (val === null) return "text-muted-foreground/60 italic";
    if (mode === "variance") {
      // base text color
      let base = "text-muted-foreground";
      if (val < 0) base = "text-red-600 dark:text-red-500 font-semibold";
      else if (val > 0) base = "text-emerald-600 dark:text-emerald-500 font-semibold";
      // highlight worst short & biggest over within the row
      const isBiggestShort = val < 0 && val === row.minVal;
      const isBiggestOver = val > 0 && val === row.maxVal;
      // avoid highlighting when only one valid branch (nothing to compare)
      const validCount = Object.values(row.branchValues).filter((x) => x !== null).length;
      if (validCount >= 2) {
        if (isBiggestShort) return cn(base, "bg-red-500/15 ring-1 ring-inset ring-red-500/40 rounded");
        if (isBiggestOver) return cn(base, "bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/40 rounded");
      }
      return base;
    }
    if (row.minVal === row.maxVal) return "";
    if (val === row.minVal && val > 0) return "text-emerald-600 dark:text-emerald-500 font-semibold";
    if (val === row.maxVal) return "text-red-600 dark:text-red-500 font-semibold";
    return "";
  };

  // --- Export ---
  const modeLabel = mode === "cost" ? "التكلفة" : mode === "receipts" ? "الاستلامات" : "التباين";
  const valueFmt = mode === "cost" ? fmt : fmtQty;

  const buildExportData = () =>
    filteredRows.map((r) => {
      const row: Record<string, any> = {
        code: r.itemCode || "",
        name: r.itemName,
        unit: r.unit || "",
        category: r.categoryName,
      };
      branches.forEach((b) => {
        const v = r.branchValues[b.id];
        row[`branch_${b.id}`] = v === null ? "—" : valueFmt(v);
      });
      row.avg = valueFmt(r.avg);
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

  const periodLabel = dateFrom && dateTo
    ? `من ${format(dateFrom, "yyyy-MM-dd")} إلى ${format(dateTo, "yyyy-MM-dd")}`
    : "—";

  const exportFilters = [
    { label: "الوضع", value: modeLabel },
    ...(needsDates ? [{ label: "الفترة", value: periodLabel }] : []),
    { label: "المجموعة", value: categoryFilter === "all" ? "كل المجموعات" : (categories.find(c => c.id === categoryFilter)?.name ?? "—") },
    ...(varianceThreshold > 0 ? [{ label: "حد التباين", value: `≥ ${varianceThreshold}%` }] : []),
  ];

  const handleExportPDF = () => {
    exportToPDF({
      title: `مقارنة الفروع — ${modeLabel}`,
      filename: `branch-comparison-${mode}-${new Date().toISOString().slice(0, 10)}`,
      columns: buildExportColumns(),
      data: buildExportData(),
      filters: exportFilters,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: `مقارنة الفروع — ${modeLabel}`,
      filename: `branch-comparison-${mode}-${new Date().toISOString().slice(0, 10)}`,
      columns: buildExportColumns(),
      data: buildExportData(),
      filters: exportFilters,
    });
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
            مقارنة الفروع — {modeLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "cost" && "تكلفة كل صنف في كل فرع، مع المتوسط ونسبة التباين"}
            {mode === "receipts" && "كمية المشتريات الواردة لكل فرع خلال الفترة المحددة"}
            {mode === "variance" && "الشورت/الأوفر = (الجرد الفعلي - الرصيد الدفتري) لكل فرع خلال الفترة"}
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

      {/* Mode Toggle */}
      <Card className="print:hidden">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground ml-2">نوع المقارنة:</span>
            <Button
              size="sm"
              variant={mode === "cost" ? "default" : "outline"}
              onClick={() => setMode("cost")}
              className="gap-1 h-8 text-xs"
            >
              <DollarSign className="h-3.5 w-3.5" /> التكلفة
            </Button>
            <Button
              size="sm"
              variant={mode === "receipts" ? "default" : "outline"}
              onClick={() => setMode("receipts")}
              className="gap-1 h-8 text-xs"
            >
              <Package className="h-3.5 w-3.5" /> الاستلامات
            </Button>
            <Button
              size="sm"
              variant={mode === "variance" ? "default" : "outline"}
              onClick={() => setMode("variance")}
              className="gap-1 h-8 text-xs"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> التباين (شورت/أوفر)
            </Button>
          </div>
        </CardContent>
      </Card>

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
        <CardContent className="p-4 space-y-3">
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
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsDates && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-8 text-xs justify-start w-36", !dateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                        {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "اختر"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-8 text-xs justify-start w-36", !dateTo && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                        {dateTo ? format(dateTo, "yyyy-MM-dd") : "اختر"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>

          {/* Variance slider */}
          <div className="flex items-center gap-3 pt-1 border-t border-border/30">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              عرض التباين فقط ≥
            </label>
            <div className="flex-1 max-w-md">
              <Slider
                value={[varianceThreshold]}
                onValueChange={(v) => setVarianceThreshold(v[0])}
                min={0}
                max={50}
                step={1}
              />
            </div>
            <Badge variant="outline" className="text-xs tabular-nums min-w-[60px] justify-center">
              {varianceThreshold === 0 ? "الكل" : `${varianceThreshold}%`}
            </Badge>
            {varianceThreshold > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setVarianceThreshold(0)}>
                إلغاء
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-sm">الأصناف ({filteredRows.length})</h2>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
              {mode === "variance" ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> شورت (سالب)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> أوفر (موجب)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded ring-1 ring-inset ring-red-500/40 bg-red-500/15" /> أكبر عجز
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded ring-1 ring-inset ring-emerald-500/40 bg-emerald-500/15" /> أكبر أوفر
                  </span>
                  <span className="italic">— = لا يوجد جرد للفرع</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {mode === "cost" ? "الأرخص" : "الأقل"}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                    {mode === "cost" ? "الأغلى" : "الأكبر"}
                  </span>
                </>
              )}
            </div>
          </div>

          {needsDates && !datesReady && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              برجاء اختيار <strong>من تاريخ</strong> و<strong>إلى تاريخ</strong> لعرض البيانات
            </div>
          )}

          {(!needsDates || datesReady) && (
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
                      <TableCell colSpan={6 + branches.length} className="text-center py-8 text-muted-foreground text-sm">
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
                          const v = r.branchValues[b.id];
                          return (
                            <TableCell
                              key={b.id}
                              className={cn("text-xs text-center tabular-nums", getCellClass(v, r))}
                            >
                              {v === null ? "—" : valueFmt(v)}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-center tabular-nums font-bold bg-primary/5">
                          {valueFmt(r.avg)}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};
