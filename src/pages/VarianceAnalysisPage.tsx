import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, subMonths } from "date-fns";
import { CalendarIcon, Store, Building2, Warehouse, Settings2, Package, AlertTriangle, CheckCircle2, Printer, FileDown, Loader2, MessageSquare, TrendingUp, TrendingDown, BarChart3, PieChart as PieChartIcon, DollarSign, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useBranchCosts } from "@/hooks/useBranchCosts";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportToExcel } from "@/lib/exportUtils";

/* =========================================================
   VARIANCE ANALYSIS PAGE (تقرير انحراف خامات المطبخ)
   ---------------------------------------------------------
   Mirrors the client's Excel formulas:
    - Per-item deviation & analysis banding
    - Per-category summary (Allowed loss, Ratios/Sales)
    - Previous period comparison
    - Consumables ratio monitor vs configurable limit
   ========================================================= */

type Analysis = "Good" | "Normal" | "Accept" | "Deviation" | "Operation error" | "High deflection" | "Issue";
type ResultSign = "Short" | "Over" | "Equal";
type PrevResult = "Better" | "High" | "Fixed" | "Change to Loss" | "Change to Increase";

export type Thresholds = {
  normal: number;      // upper bound for Normal (e.g. 0.02)
  accept: number;      // upper bound for Accept
  deviation: number;   // upper bound for Deviation
  operation: number;   // upper bound for Operation error
  highDefl: number;    // upper bound for High deflection
};
const DEFAULT_THRESHOLDS: Thresholds = { normal: 0.02, accept: 0.05, deviation: 0.10, operation: 0.20, highDefl: 0.50 };

export type ConsumablesTargets = {
  packagingMin: number; packagingMax: number;
  generalMin: number;   generalMax: number;
};
const DEFAULT_CONSUMABLES_TARGETS: ConsumablesTargets = {
  packagingMin: 0.02, packagingMax: 0.05,
  generalMin:   0.005, generalMax:   0.02,
};

export type ActivityBenchmark = {
  key: string; name: string;
  acceptMin: number; acceptMax: number;   // مقبول
  warnMin: number;   warnMax: number;     // إنذار
  dangerMin: number;                      // خطر (> dangerMin)
};
const DEFAULT_ACTIVITY_BENCHMARKS: ActivityBenchmark[] = [
  { key: "pizza",   name: "بيتزا",         acceptMin: 0.01,  acceptMax: 0.025, warnMin: 0.025, warnMax: 0.04,  dangerMin: 0.04  },
  { key: "burger",  name: "برجر / فاست فود", acceptMin: 0.015, acceptMax: 0.03,  warnMin: 0.03,  warnMax: 0.045, dangerMin: 0.045 },
  { key: "grill",   name: "مشويات",        acceptMin: 0.02,  acceptMax: 0.04,  warnMin: 0.04,  warnMax: 0.055, dangerMin: 0.055 },
  { key: "eastern", name: "مطاعم شرقي",     acceptMin: 0.025, acceptMax: 0.05,  warnMin: 0.05,  warnMax: 0.07,  dangerMin: 0.07  },
  { key: "western", name: "مطاعم غربي",     acceptMin: 0.015, acceptMax: 0.035, warnMin: 0.035, warnMax: 0.05,  dangerMin: 0.05  },
  { key: "cafe",    name: "كافيه",          acceptMin: 0.01,  acceptMax: 0.02,  warnMin: 0.02,  warnMax: 0.03,  dangerMin: 0.03  },
  { key: "central", name: "سنتر كيتشن",     acceptMin: 0.005, acceptMax: 0.015, warnMin: 0.015, warnMax: 0.025, dangerMin: 0.025 },
];

const analyzeRate = (rate: number, t: Thresholds = DEFAULT_THRESHOLDS): Analysis => {
  const a = Math.abs(rate);
  if (a === 0) return "Good";
  if (a <= t.normal) return "Normal";
  if (a <= t.accept) return "Accept";
  if (a <= t.deviation) return "Deviation";
  if (a <= t.operation) return "Operation error";
  if (a <= t.highDefl) return "High deflection";
  return "Issue";
};

const analysisColor = (a: Analysis) => {
  switch (a) {
    case "Good": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "Normal": return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200";
    case "Accept": return "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200";
    case "Deviation": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200";
    case "Operation error": return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200";
    case "High deflection": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "Issue": return "bg-red-600 text-white";
  }
};

const compareToPrev = (curr: number, prev: number | null): PrevResult | null => {
  if (prev == null) return null;
  const c = Math.abs(curr), p = Math.abs(prev);
  if (curr === 0 && prev === 0) return "Fixed";
  // Sign flip
  if (curr > 0 && prev < 0) return "Change to Increase";
  if (curr < 0 && prev > 0) return "Change to Loss";
  if (c < p) return "Better";
  if (c > p) return "High";
  return "Fixed";
};

const prevResultColor = (r: PrevResult | null) => {
  switch (r) {
    case "Better": return "text-emerald-600 dark:text-emerald-400 font-semibold";
    case "High": return "text-red-600 dark:text-red-400 font-semibold";
    case "Fixed": return "text-muted-foreground";
    case "Change to Loss": return "text-red-700 dark:text-red-300 font-semibold";
    case "Change to Increase": return "text-emerald-700 dark:text-emerald-300 font-semibold";
    default: return "text-muted-foreground";
  }
};

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "0");
const fmtPct = (n: number, d = 2) => (Number.isFinite(n) ? (n * 100).toFixed(d) + "%" : "0%");

type ItemCalc = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  avgCost: number;
  openQty: number;
  inQty: number;      // Receive
  outQty: number;     // Theoretical consumption
  countQty: number;   // Actual balance
  bookQty: number;    // Last period (theoretical) = open + in - out
  diffQty: number;    // countQty - bookQty  (negative = short)
  costVar: number;    // diffQty * avgCost
  actualConsumedQty: number; // outQty - diffQty
  actualConsumedVal: number;
  receiveVal: number;
  rate: number;       // diffQty / actualConsumedQty
  prevRate: number | null;
  analysis: Analysis;
  result: ResultSign;
  chargedRatio: number; // -costVar * (1 - permissible)
  prevResult: PrevResult | null;
  isConsumable: boolean;
};

export const VarianceAnalysisPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [consumablesLimitPct, setConsumablesLimitPct] = useState<number>(3); // default 3%
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<"permissible" | "consumables" | "thresholds">("permissible");
  const [consumableDeptFilter, setConsumableDeptFilter] = useState<string>("all");
  const [consumableCatFilter, setConsumableCatFilter] = useState<string>("all");
  const [consumableSearch, setConsumableSearch] = useState<string>("");

  // New UI state
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");
  const [topSortMode, setTopSortMode] = useState<"rate" | "costVar">("rate");
  const [showSubtotals, setShowSubtotals] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<string>("all");
  const [thresholds, setThresholds] = useState<Thresholds>(() => {
    try {
      const raw = localStorage.getItem("variance-thresholds");
      return raw ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) } : DEFAULT_THRESHOLDS;
    } catch { return DEFAULT_THRESHOLDS; }
  });
  useEffect(() => {
    localStorage.setItem("variance-thresholds", JSON.stringify(thresholds));
  }, [thresholds]);
  const [noteEditor, setNoteEditor] = useState<{ itemId: string; itemName: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ note: string; action_status: string }>({ note: "", action_status: "pending" });

  const activeLocationId = branchFilter !== "all" ? branchFilter : null;
  const { getCost } = useBranchCosts(activeLocationId);

  // Previous period: same day-of-month range shifted back by 1 month
  const prevRange = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    return { from: subMonths(dateFrom, 1), to: subMonths(dateTo, 1) };
  }, [dateFrom, dateTo]);

  /* ================= Reference data ================= */
  const { data: branches } = useQuery({
    queryKey: ["var-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id,name").eq("company_id", companyId!).eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: departments } = useQuery({
    queryKey: ["var-departments", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,name").eq("company_id", companyId!).eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: categories } = useQuery({
    queryKey: ["var-categories", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_categories")
        .select("id,name,department_id,permissible_percentage")
        .eq("company_id", companyId!)
        .eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: stockItems } = useQuery({
    queryKey: ["var-stock-items", companyId],
    queryFn: async () => {
      return fetchAllRows<any>((from, to) =>
        supabase
          .from("stock_items")
          .select("id,name,code,stock_unit,avg_cost,conversion_factor,category_id,department_id,is_consumable")
          .eq("company_id", companyId!)
          .eq("active", true)
          .order("created_at", { ascending: true })
          .range(from, to)
      );
    },
    enabled: !!companyId,
  });

  const { data: itemCategoryLinks } = useQuery({
    queryKey: ["var-item-cat-links", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_item_categories")
        .select("stock_item_id,category_id")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  /* ============ Transactions ============ */
  const { data: stocktakeData } = useQuery({
    queryKey: ["var-stocktakes", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("stocktake_items")
          .select("stock_item_id,counted_qty,stocktakes!inner(date,status,company_id,branch_id,warehouse_id,type)")
          .eq("stocktakes.company_id", companyId!)
          .eq("stocktakes.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: purchaseData } = useQuery({
    queryKey: ["var-purchases", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("purchase_items")
          .select("stock_item_id,quantity,purchase_orders!inner(date,status,company_id,branch_id,warehouse_id,department_id)")
          .eq("purchase_orders.company_id", companyId!)
          .eq("purchase_orders.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: productionIngData } = useQuery({
    queryKey: ["var-prod-ing", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("production_ingredients")
          .select("stock_item_id,required_qty,production_records!inner(date,status,company_id,branch_id,department_id)")
          .eq("production_records.company_id", companyId!)
          .eq("production_records.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: productionRecords } = useQuery({
    queryKey: ["var-prod-rec", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("production_records")
          .select("product_id,produced_qty,date,status,company_id,branch_id,department_id")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: wasteData } = useQuery({
    queryKey: ["var-waste", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("waste_items")
          .select("stock_item_id,quantity,waste_records!inner(date,status,company_id,branch_id,department_id)")
          .eq("waste_records.company_id", companyId!)
          .eq("waste_records.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: transferData } = useQuery({
    queryKey: ["var-transfers", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("transfer_items")
          .select("stock_item_id,quantity,transfers!inner(date,status,company_id,source_id,destination_id,source_department_id,destination_department_id)")
          .eq("transfers.company_id", companyId!)
          .eq("transfers.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: posSaleItems } = useQuery({
    queryKey: ["var-pos-sale-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("pos_sale_items")
          .select("pos_item_id,quantity,pos_sales!inner(date,status,company_id,branch_id)")
          .eq("pos_sales.company_id", companyId!)
          .eq("pos_sales.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["var-recipe-ing", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("recipe_ingredients")
          .select("stock_item_id,qty,recipes!inner(menu_item_id,company_id)")
          .eq("recipes.company_id", companyId!)
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: posSales } = useQuery({
    queryKey: ["var-pos-sales", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("pos_sales")
          .select("id,date,total_amount,tax_amount,discount_amount,discount_in_pnl,branch_id,status")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  /* ============ Helpers ============ */
  const inRange = (dateStr: string, from?: Date, to?: Date) => {
    if (!from || !to || !dateStr) return false;
    const d = new Date(dateStr);
    const end = new Date(to); end.setHours(23, 59, 59, 999);
    return d >= from && d <= end;
  };
  const beforeDate = (dateStr: string, from?: Date) => {
    if (!from || !dateStr) return false;
    return new Date(dateStr) < from;
  };

  // Item → category list (primary + additional)
  const itemCats = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (stockItems || []).forEach((si: any) => {
      const s = new Set<string>();
      if (si.category_id) s.add(si.category_id);
      m.set(si.id, s);
    });
    (itemCategoryLinks || []).forEach((l: any) => {
      if (!m.has(l.stock_item_id)) m.set(l.stock_item_id, new Set());
      m.get(l.stock_item_id)!.add(l.category_id);
    });
    return m;
  }, [stockItems, itemCategoryLinks]);

  /* ============ Core computation for a given period ============ */
  const computeForRange = (from?: Date, to?: Date): Map<string, ItemCalc> => {
    const map = new Map<string, ItemCalc>();
    if (!stockItems || !from || !to) return map;

    for (const si of stockItems as any[]) {
      // Category filter via department: item's categories must belong to selected dept (if set)
      if (departmentFilter !== "all") {
        const cats = itemCats.get(si.id);
        if (!cats) continue;
        const inDept = Array.from(cats).some((cid) =>
          (categories || []).find((c: any) => c.id === cid && c.department_id === departmentFilter)
        );
        if (!inDept && si.department_id !== departmentFilter) continue;
      }
      map.set(si.id, {
        id: si.id, name: si.name, code: si.code, unit: si.stock_unit,
        avgCost: getCost(si.id, si.avg_cost),
        openQty: 0, inQty: 0, outQty: 0, countQty: 0, bookQty: 0,
        diffQty: 0, costVar: 0, actualConsumedQty: 0, actualConsumedVal: 0, receiveVal: 0,
        rate: 0, prevRate: null, analysis: "Normal", result: "Equal", chargedRatio: 0, prevResult: null,
        isConsumable: !!si.is_consumable,
      });
    }

    // Opening = last stocktake before `from` (matching branch)
    if (stocktakeData) {
      const latest = new Map<string, { qty: number; date: string }>();
      for (const s of stocktakeData as any[]) {
        const d = s.stocktakes?.date;
        if (!d || !beforeDate(d, from)) continue;
        if (branchFilter !== "all" && s.stocktakes?.branch_id !== branchFilter) continue;
        if (!s.stock_item_id) continue;
        const ex = latest.get(s.stock_item_id);
        if (!ex || d > ex.date) latest.set(s.stock_item_id, { qty: Number(s.counted_qty), date: d });
      }
      for (const [id, v] of latest) { const c = map.get(id); if (c) c.openQty = v.qty; }
    }

    // Purchases IN
    (purchaseData || []).forEach((pi: any) => {
      const d = pi.purchase_orders?.date;
      if (!inRange(d, from, to)) return;
      if (branchFilter !== "all" && pi.purchase_orders?.branch_id !== branchFilter) return;
      const c = map.get(pi.stock_item_id);
      if (c) c.inQty += Number(pi.quantity || 0);
    });

    // Production produced IN
    (productionRecords || []).forEach((pr: any) => {
      if (!inRange(pr.date, from, to)) return;
      if (branchFilter !== "all" && pr.branch_id !== branchFilter) return;
      const c = map.get(pr.product_id);
      if (c) c.inQty += Number(pr.produced_qty || 0);
    });

    // Production ingredients OUT
    (productionIngData || []).forEach((ing: any) => {
      const d = ing.production_records?.date;
      if (!inRange(d, from, to)) return;
      if (branchFilter !== "all" && ing.production_records?.branch_id !== branchFilter) return;
      const c = map.get(ing.stock_item_id);
      if (c) c.outQty += Number(ing.required_qty || 0);
    });

    // Waste OUT
    (wasteData || []).forEach((wi: any) => {
      const d = wi.waste_records?.date;
      if (!inRange(d, from, to)) return;
      if (branchFilter !== "all" && wi.waste_records?.branch_id !== branchFilter) return;
      const c = map.get(wi.stock_item_id);
      if (c) c.outQty += Number(wi.quantity || 0);
    });

    // Transfers (only when branch selected)
    if (branchFilter !== "all") {
      (transferData || []).forEach((ti: any) => {
        const d = ti.transfers?.date;
        if (!inRange(d, from, to)) return;
        const c = map.get(ti.stock_item_id);
        if (!c) return;
        const q = Number(ti.quantity || 0);
        if (ti.transfers?.source_id === branchFilter) c.outQty += q;
        if (ti.transfers?.destination_id === branchFilter) c.inQty += q;
      });
    }

    // POS sales consumption OUT via recipes
    if (posSaleItems && recipeIngredients && stockItems) {
      const conv = new Map<string, number>();
      (stockItems as any[]).forEach((si) => conv.set(si.id, Number(si.conversion_factor) || 1));
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      (recipeIngredients as any[]).forEach((ri) => {
        const mid = ri.recipes?.menu_item_id;
        if (!mid) return;
        if (!recipeMap.has(mid)) recipeMap.set(mid, []);
        recipeMap.get(mid)!.push({ stock_item_id: ri.stock_item_id, qty: Number(ri.qty || 0) / (conv.get(ri.stock_item_id) || 1) });
      });
      (posSaleItems as any[]).forEach((si) => {
        const d = si.pos_sales?.date;
        if (!inRange(d, from, to)) return;
        if (branchFilter !== "all" && si.pos_sales?.branch_id !== branchFilter) return;
        const ings = recipeMap.get(si.pos_item_id);
        if (!ings) return;
        for (const ing of ings) {
          const c = map.get(ing.stock_item_id);
          if (c) c.outQty += ing.qty * Number(si.quantity || 0);
        }
      });
    }

    // Closing = last stocktake in range
    if (stocktakeData) {
      const latest = new Map<string, { qty: number; date: string }>();
      for (const s of stocktakeData as any[]) {
        const d = s.stocktakes?.date;
        if (!inRange(d, from, to)) continue;
        if (branchFilter !== "all" && s.stocktakes?.branch_id !== branchFilter) continue;
        if (!s.stock_item_id) continue;
        const ex = latest.get(s.stock_item_id);
        if (!ex || d > ex.date) latest.set(s.stock_item_id, { qty: Number(s.counted_qty), date: d });
      }
      for (const [id, v] of latest) { const c = map.get(id); if (c) c.countQty = v.qty; }
    }

    // Finalize per-item metrics
    for (const c of map.values()) {
      const round = (n: number) => Math.round(n * 10000) / 10000;
      c.openQty = round(c.openQty); c.inQty = round(c.inQty); c.outQty = round(c.outQty); c.countQty = round(c.countQty);
      c.bookQty = round(c.openQty + c.inQty - c.outQty);
      c.diffQty = round(c.countQty - c.bookQty);
      if (Math.abs(c.diffQty) < 0.005) c.diffQty = 0;
      // Actual consumption absorbs the variance (shortage/surplus)
      c.actualConsumedQty = round(c.outQty - c.diffQty);
      c.actualConsumedVal = round(c.actualConsumedQty * c.avgCost);
      c.receiveVal = round(c.inQty * c.avgCost);

      if (c.isConsumable) {
        // For consumables: theoretical consumption absorbs the variance,
        // so theoretical end == actual balance and diff == 0.
        c.outQty = c.actualConsumedQty;
        c.bookQty = c.countQty;
        c.diffQty = 0;
        c.costVar = 0;
        c.rate = 0;
      } else {
        c.costVar = round(c.diffQty * c.avgCost);
        c.rate = c.actualConsumedQty > 0 ? c.diffQty / c.actualConsumedQty : 0;
      }
      c.analysis = analyzeRate(c.rate, thresholds);
      c.result = c.diffQty < 0 ? "Short" : c.diffQty > 0 ? "Over" : "Equal";
    }
    return map;
  };

  // Current period
  const current = useMemo(() => computeForRange(dateFrom, dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, dateFrom, dateTo, branchFilter, departmentFilter, itemCats, categories, getCost, thresholds]);

  // Previous period (for prev-rate)
  const previous = useMemo(() => computeForRange(prevRange?.from, prevRange?.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, prevRange, branchFilter, departmentFilter, itemCats, categories, getCost, thresholds]);

  // Net sales for period (branch scope)
  const netSales = useMemo(() => {
    let total = 0;
    (posSales || []).forEach((s: any) => {
      if (!inRange(s.date, dateFrom, dateTo)) return;
      if (branchFilter !== "all" && s.branch_id !== branchFilter) return;
      const invoiceTotal = Number(s.total_amount ?? 0);
      const taxAmount = Number(s.tax_amount ?? 0);
      const discountAmount = s.discount_in_pnl === false ? 0 : Number(s.discount_amount ?? 0);
      total += invoiceTotal - taxAmount - discountAmount;
    });
    return total;
  }, [posSales, dateFrom, dateTo, branchFilter]);

  // Merge prev rate + permissible% + prev-result into current items
  const enriched = useMemo(() => {
    const catById = new Map<string, any>();
    (categories || []).forEach((c: any) => catById.set(c.id, c));
    const out: { catId: string; catName: string; permissible: number; items: ItemCalc[] }[] = [];
    const groupMap = new Map<string, { catId: string; catName: string; permissible: number; items: ItemCalc[] }>();

    for (const item of current.values()) {
      const prev = previous.get(item.id);
      item.prevRate = prev ? prev.rate : 0;
      item.prevResult = compareToPrev(item.rate, item.prevRate);

      const cats = itemCats.get(item.id);
      let catIds = cats && cats.size > 0 ? Array.from(cats) : ["__none__"];
      if (departmentFilter !== "all") {
        catIds = catIds.filter((cid) => {
          if (cid === "__none__") return false;
          return catById.get(cid)?.department_id === departmentFilter;
        });
      }
      for (const cid of catIds) {
        const cat = catById.get(cid);
        const key = cid;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            catId: cid,
            catName: cid === "__none__" ? "بدون مجموعة" : cat?.name || "غير معروف",
            permissible: Number(cat?.permissible_percentage ?? 0.05),
            items: [],
          });
        }
        // set chargedRatio using this category's permissible
        const perm = groupMap.get(key)!.permissible;
        const cloned: ItemCalc = { ...item, chargedRatio: -item.costVar * (1 - perm) };
        groupMap.get(key)!.items.push(cloned);
      }
    }
    for (const g of groupMap.values()) {
      out.push(g);
    }
    return out;
  }, [current, previous, categories, itemCats, departmentFilter]);

  // Consumables monitor — broken down per department
  const classifyDeptKind = (name: string): "packaging" | "general" | "consumables" => {
    const n = (name || "").toLowerCase();
    if (n.includes("باكينج") || n.includes("packing") || n.includes("packaging") || n.includes("تغليف")) return "packaging";
    if (n.includes("جنرال") || n.includes("general") || n.includes("عام")) return "general";
    return "consumables";
  };

  const consumables = useMemo(() => {
    const catById = new Map<string, any>();
    (categories || []).forEach((c: any) => catById.set(c.id, c));
    const deptById = new Map<string, any>();
    (departments || []).forEach((d: any) => deptById.set(d.id, d));

    // Resolve item -> set of department ids (filtered by current department filter)
    const resolveItemDepts = (itemId: string, primaryDeptId: string | null): string[] => {
      const set = new Set<string>();
      const cats = itemCats.get(itemId);
      if (cats) {
        for (const cid of cats) {
          const did = catById.get(cid)?.department_id;
          if (did) set.add(did);
        }
      }
      if (set.size === 0 && primaryDeptId) set.add(primaryDeptId);
      let arr = Array.from(set);
      if (departmentFilter !== "all") arr = arr.filter((d) => d === departmentFilter);
      return arr;
    };

    // Group per department, with per-category sub-breakdown
    type CatRow = { catId: string; catName: string; consumedVal: number; ratio: number };
    type Row = { deptId: string; deptName: string; kind: "packaging" | "general" | "consumables"; consumedVal: number; cats: Map<string, CatRow> };
    const perDept = new Map<string, Row>();
    const primaryDeptMap = new Map<string, string | null>();
    (stockItems || []).forEach((si: any) => primaryDeptMap.set(si.id, si.department_id ?? null));

    // Resolve item -> categories relevant to a given department
    const itemCatsForDept = (itemId: string, deptId: string): string[] => {
      const cats = itemCats.get(itemId);
      const out: string[] = [];
      if (cats) {
        for (const cid of cats) {
          if (catById.get(cid)?.department_id === deptId) out.push(cid);
        }
      }
      return out;
    };

    for (const c of current.values()) {
      if (!c.isConsumable) continue;
      const depts = resolveItemDepts(c.id, primaryDeptMap.get(c.id) ?? null);
      if (depts.length === 0) continue;
      const share = c.actualConsumedVal / depts.length;
      for (const did of depts) {
        if (!perDept.has(did)) {
          const dName = deptById.get(did)?.name || "غير معروف";
          perDept.set(did, { deptId: did, deptName: dName, kind: classifyDeptKind(dName), consumedVal: 0, cats: new Map() });
        }
        const row = perDept.get(did)!;
        row.consumedVal += share;

        // sub-split share across item's categories inside this department
        const catIds = itemCatsForDept(c.id, did);
        const useCatIds = catIds.length > 0 ? catIds : ["__none__"];
        const catShare = share / useCatIds.length;
        for (const cid of useCatIds) {
          if (!row.cats.has(cid)) {
            const cName = cid === "__none__" ? "بدون مجموعة" : (catById.get(cid)?.name || "غير معروف");
            row.cats.set(cid, { catId: cid, catName: cName, consumedVal: 0, ratio: 0 });
          }
          row.cats.get(cid)!.consumedVal += catShare;
        }
      }
    }

    const limit = consumablesLimitPct / 100;
    const rows = Array.from(perDept.values())
      .map((r) => {
        const ratio = netSales > 0 ? r.consumedVal / netSales : 0;
        const status: "ok" | "alert" =
          r.kind === "consumables" ? (ratio <= limit ? "ok" : "alert") : "ok";
        const cats = Array.from(r.cats.values())
          .map((cr) => ({ ...cr, ratio: netSales > 0 ? cr.consumedVal / netSales : 0 }))
          .sort((a, b) => b.consumedVal - a.consumedVal);
        return { ...r, ratio, status, cats };
      })
      .sort((a, b) => b.consumedVal - a.consumedVal);

    const totalConsumedVal = rows
      .filter((r) => r.kind === "consumables")
      .reduce((s, r) => s + r.consumedVal, 0);
    const totalRatio = netSales > 0 ? totalConsumedVal / netSales : 0;

    return {
      // aggregate (only "consumables" kind departments — packaging/general excluded)
      consumedVal: totalConsumedVal,
      ratio: totalRatio,
      limit,
      status: (totalRatio <= limit ? "ok" : "alert") as "ok" | "alert",
      rows,
    };
  }, [current, netSales, consumablesLimitPct, categories, departments, itemCats, stockItems, departmentFilter]);

  /* ============ Category permissible update ============ */
  const [savingCat, setSavingCat] = useState<string | null>(null);
  const updatePermissible = async (catId: string, pct: number) => {
    setSavingCat(catId);
    const { error } = await supabase.from("inventory_categories").update({ permissible_percentage: pct }).eq("id", catId);
    setSavingCat(null);
    if (error) { toast.error("فشل الحفظ"); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["var-categories", companyId] });
  };

  const toggleConsumable = async (itemId: string, val: boolean) => {
    const { error } = await supabase.from("stock_items").update({ is_consumable: val }).eq("id", itemId);
    if (error) { toast.error("فشل التحديث"); return; }
    qc.invalidateQueries({ queryKey: ["var-stock-items", companyId] });
  };

  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkToggleConsumable = async (ids: string[], val: boolean) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase.from("stock_items").update({ is_consumable: val }).in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error("فشل التحديث الجماعي"); return; }
    toast.success(val ? `تم تحديد ${ids.length} خامة كمستهلكات` : `تم إلغاء تحديد ${ids.length} خامة`);
    qc.invalidateQueries({ queryKey: ["var-stock-items", companyId] });
  };

  /* ============ Aggregated summary stats (for boxes like Excel) ============ */
  const summaryStats = useMemo(() => {
    const items = Array.from(current.values());
    const total = items.length || 1;
    const cnt = (fn: (i: ItemCalc) => boolean) => items.filter(fn).length;
    const pct = (n: number) => n / total;

    // Result: Short / Over / Equal
    const resultRows = [
      { label: "Short", count: cnt((i) => i.result === "Short"), ratio: pct(cnt((i) => i.result === "Short")) },
      { label: "Over", count: cnt((i) => i.result === "Over"), ratio: pct(cnt((i) => i.result === "Over")) },
      { label: "Equal", count: cnt((i) => i.result === "Equal"), ratio: pct(cnt((i) => i.result === "Equal")) },
    ];

    // Analysis distribution: 0% -> Good, 1%-2% -> Normal
    const analyses: Analysis[] = ["Good", "Normal", "Accept", "Deviation", "Operation error", "High deflection", "Issue"];
    const analysisRows = analyses.map((a) => {
      const c = cnt((i) => i.analysis === a);
      return { label: a, count: c, ratio: pct(c) };
    });

    // Previous comparison distribution
    const prevLabels: (PrevResult | "None")[] = ["Better", "High", "Fixed", "Change to Loss", "Change to Increase"];
    const prevRows = prevLabels.map((l) => {
      const c = cnt((i) => (i.prevResult || "None") === l);
      return { label: l, count: c, ratio: pct(c) };
    });

    return { total: items.length, resultRows, analysisRows, prevRows };
  }, [current]);

  /* ============ Cost variance KPIs & prev period comparison ============ */
  const costKpis = useMemo(() => {
    const items = Array.from(current.values()).filter(i => !i.isConsumable);
    const shortVal = items.filter(i => i.costVar < 0).reduce((s, i) => s + i.costVar, 0);
    const overVal = items.filter(i => i.costVar > 0).reduce((s, i) => s + i.costVar, 0);
    const netVal = shortVal + overVal;
    const absSum = items.reduce((s, i) => s + Math.abs(i.rate), 0);
    const avgRate = items.length ? absSum / items.length : 0;

    const prevItems = Array.from(previous.values()).filter(i => !i.isConsumable);
    const prevAbsSum = prevItems.reduce((s, i) => s + Math.abs(i.rate), 0);
    const prevAvgRate = prevItems.length ? prevAbsSum / prevItems.length : 0;
    const prevNet = prevItems.reduce((s, i) => s + i.costVar, 0);
    return { shortVal, overVal, netVal, avgRate, prevAvgRate, prevNet };
  }, [current, previous]);

  /* ============ Top N (all deviations sorted) ============ */
  const topDeviations = useMemo(() => {
    const items = Array.from(current.values()).filter(i => !i.isConsumable && i.rate !== 0);
    if (topSortMode === "rate") {
      items.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
    } else {
      items.sort((a, b) => Math.abs(b.costVar) - Math.abs(a.costVar));
    }
    return items;
  }, [current, topSortMode]);

  /* ============ Notes ============ */
  const { data: notesData } = useQuery({
    queryKey: ["var-notes", companyId, dateFrom, dateTo, branchFilter],
    queryFn: async () => {
      let q = supabase.from("variance_item_notes").select("*").eq("company_id", companyId!);
      if (dateFrom) q = q.eq("period_from", format(dateFrom, "yyyy-MM-dd"));
      if (dateTo) q = q.eq("period_to", format(dateTo, "yyyy-MM-dd"));
      if (branchFilter !== "all") q = q.eq("branch_id", branchFilter);
      else q = q.is("branch_id", null);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId && !!dateFrom && !!dateTo,
  });
  const notesByItem = useMemo(() => {
    const m = new Map<string, any>();
    (notesData || []).forEach((n: any) => m.set(n.stock_item_id, n));
    return m;
  }, [notesData]);

  const openNoteEditor = (itemId: string, itemName: string) => {
    const existing = notesByItem.get(itemId);
    setNoteDraft({ note: existing?.note || "", action_status: existing?.action_status || "pending" });
    setNoteEditor({ itemId, itemName });
  };
  const saveNote = async () => {
    if (!noteEditor || !companyId) return;
    const existing = notesByItem.get(noteEditor.itemId);
    const payload = {
      company_id: companyId,
      stock_item_id: noteEditor.itemId,
      branch_id: branchFilter !== "all" ? branchFilter : null,
      period_from: dateFrom ? format(dateFrom, "yyyy-MM-dd") : null,
      period_to: dateTo ? format(dateTo, "yyyy-MM-dd") : null,
      note: noteDraft.note,
      action_status: noteDraft.action_status,
      created_by: auth.user?.id ?? null,
    };
    const { error } = existing
      ? await supabase.from("variance_item_notes").update(payload).eq("id", existing.id)
      : await supabase.from("variance_item_notes").insert(payload);
    if (error) { toast.error("فشل حفظ الملاحظة"); return; }
    toast.success("تم الحفظ");
    setNoteEditor(null);
    qc.invalidateQueries({ queryKey: ["var-notes", companyId] });
  };

  /* ============ Print + PDF (structured report, not UI capture) ============ */
  const reportRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const branchName = branchFilter === "all" ? "كل الفروع" : (branches || []).find((b: any) => b.id === branchFilter)?.name || "-";
  const deptName = departmentFilter === "all" ? "كل الأقسام" : (departments || []).find((d: any) => d.id === departmentFilter)?.name || "-";

  const buildReportHTML = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const periodStr = `${dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""} → ${dateTo ? format(dateTo, "yyyy-MM-dd") : ""}`;
    const prevStr = prevRange ? `${format(prevRange.from, "yyyy-MM-dd")} → ${format(prevRange.to, "yyyy-MM-dd")}` : "-";
    const logoSrc = `${window.location.origin}/logo.png`;

    // Filter chips
    const filtersHTML = `
      <div class="filters">
        <span><b>الفرع:</b> ${branchName}</span>
        <span><b>القسم:</b> ${deptName}</span>
        <span><b>الفترة:</b> ${periodStr}</span>
        <span><b>الفترة السابقة:</b> ${prevStr}</span>
      </div>`;

    // KPI row
    const kpiHTML = `
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-title">بيانات الفترة</div>
          <div class="kpi-line"><span>مبيعات الفترة</span><b>${fmt(netSales)} ج.م</b></div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">رقابة المستهلكات</div>
          <div class="kpi-line"><span>قيمة استهلاك المستهلكات</span><b>${fmt(consumables.consumedVal)} ج.م</b></div>
          <div class="kpi-line"><span>النسبة / المبيعات</span><b>${fmtPct(consumables.ratio)}</b></div>
          <div class="kpi-line"><span>الحد المسموح</span><b>${consumablesLimitPct}%</b></div>
          <div class="kpi-line"><span>الحالة</span><b>${consumables.status === "alert" ? "تخطت النسبة" : "مستقر"}</b></div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">نسب الانحراف</div>
          <div class="range-line"><span>طبيعي</span><b>0% : 2%</b></div>
          <div class="range-line"><span>مقبول</span><b>2% : 5%</b></div>
          <div class="range-line"><span>انحراف</span><b>5% : 10%</b></div>
          <div class="range-line"><span>خطأ تشغيلي</span><b>10% : 20%</b></div>
          <div class="range-line"><span>انحراف عالي</span><b>20% : 50%</b></div>
          <div class="range-line"><span>مشكلة</span><b>&gt; 50%</b></div>
        </div>
      </div>`;

    // Groups tables
    const groupsHTML = enriched.map((group) => {
      const shortSum = group.items.filter(i => i.costVar < 0).reduce((s, i) => s + i.costVar, 0);
      const overSum = group.items.filter(i => i.costVar > 0).reduce((s, i) => s + i.costVar, 0);
      const netSum = shortSum + overSum;
      const receiveValSum = group.items.reduce((s, i) => s + i.receiveVal, 0);
      const consumedValSum = group.items.reduce((s, i) => s + i.actualConsumedVal, 0);
      const chargedSum = group.items.reduce((s, i) => s + i.chargedRatio, 0);
      const costSum = group.items.reduce((s, i) => s + i.costVar, 0);
      const allowedLoss = netSum * group.permissible;
      const ratioReceiptsSales = netSales > 0 ? receiveValSum / netSales : 0;
      const ratioConsumeSales = netSales > 0 ? consumedValSum / netSales : 0;
      const ratioVarSales = netSales > 0 ? netSum / netSales : 0;
      const ratioVarConsume = consumedValSum > 0 ? netSum / consumedValSum : 0;

      const rows = group.items.map((i) => `
        <tr>
          <td class="name">${i.name}</td>
          <td>${fmt(i.openQty, 3)}</td>
          <td>${fmt(i.inQty, 3)}</td>
          <td>${fmt(i.outQty, 3)}</td>
          <td>${fmt(i.bookQty, 3)}</td>
          <td>${fmt(i.countQty, 3)}</td>
          <td class="${i.diffQty < 0 ? "neg" : i.diffQty > 0 ? "pos" : ""}">${fmt(i.diffQty, 3)}</td>
          <td class="${i.costVar < 0 ? "neg" : i.costVar > 0 ? "pos" : ""}">${fmt(i.costVar)}</td>
          <td>${fmt(i.actualConsumedQty, 3)}</td>
          <td>${fmtPct(i.rate)}</td>
          <td>${i.result === "Short" ? "عجز" : i.result === "Over" ? "زيادة" : "متطابق"}</td>
          <td>${i.analysis}</td>
          <td>${fmt(i.chargedRatio)}</td>
          <td>${i.prevRate != null ? fmtPct(i.prevRate) : "-"}</td>
          <td>${i.prevResult || "-"}</td>
        </tr>`).join("");

      return `
        <div class="group">
          <div class="group-title">
            <span>${group.catName}</span>
            <span>نسبة السماح: <b>${fmtPct(group.permissible)}</b></span>
          </div>
          <table class="items">
            <thead>
              <tr>
                <th>الخامة</th><th>أول المدة</th><th>وارد</th><th>استهلاك نظري</th>
                <th>آخر المدة نظري</th><th>الرصيد الفعلي</th><th>الفرق</th><th>قيمة الانحراف</th>
                <th>استهلاك فعلي</th><th>نسبة الانحراف</th><th>النتيجة</th><th>التحليل</th>
                <th>القيمة المحملة</th><th>النسبة السابقة</th><th>مقارنة</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total">
                <td>إجمالي ${group.catName}</td>
                <td colspan="6"></td>
                <td class="${costSum < 0 ? "neg" : costSum > 0 ? "pos" : ""}">${fmt(costSum)}</td>
                <td colspan="4"></td>
                <td>${fmt(chargedSum)}</td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
          <div class="group-summary">
            <div><span>نسبة السماح</span><b>${fmtPct(group.permissible)}</b></div>
            <div><span>القيمة المسموحة</span><b>${fmt(allowedLoss)}</b></div>
            <div><span>إجمالي الاستلامات</span><b>${fmt(receiveValSum)}</b></div>
            <div><span>إجمالي الاستهلاك الفعلي</span><b>${fmt(consumedValSum)}</b></div>
            <div><span>إجمالي العجز</span><b class="neg">${fmt(shortSum)}</b></div>
            <div><span>إجمالي الزيادة</span><b class="pos">${fmt(overSum)}</b></div>
            <div><span>صافي الانحراف</span><b class="${netSum < 0 ? "neg" : "pos"}">${fmt(netSum)}</b></div>
            <div><span>الاستلامات / المبيعات</span><b>${fmtPct(ratioReceiptsSales)}</b></div>
            <div><span>الاستهلاك / المبيعات</span><b>${fmtPct(ratioConsumeSales)}</b></div>
            <div><span>الانحراف / المبيعات</span><b>${fmtPct(ratioVarSales)}</b></div>
            <div><span>الانحراف / الاستهلاك</span><b>${fmtPct(ratioVarConsume)}</b></div>
          </div>
        </div>`;
    }).join("");

    // Summary boxes
    const boxHTML = (title: string, rows: { ratio: string; count: number; label: string }[]) => {
      const total = rows.reduce((s, r) => s + r.count, 0);
      return `
        <div class="sbox">
          <div class="sbox-title">${title}</div>
          <table class="sbox-table">
            <thead><tr><th>Ratio</th><th>No.Repetition</th><th>Result</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.ratio}</td><td>${r.count}</td><td>${r.label}</td></tr>`).join("")}
              <tr class="total"><td></td><td>${total}</td><td></td></tr>
            </tbody>
          </table>
        </div>`;
    };
    const summaryHTML = `
      <div class="summary-row">
        ${boxHTML("النتيجة (Result)", summaryStats.resultRows.map(r => ({ ratio: fmtPct(r.ratio), count: r.count, label: r.label })))}
        ${boxHTML("التحليل (Analysis)", summaryStats.analysisRows.map(r => ({ ratio: fmtPct(r.ratio), count: r.count, label: r.label })))}
        ${boxHTML("مقارنة بالفترة السابقة", summaryStats.prevRows.map(r => ({ ratio: fmtPct(r.ratio), count: r.count, label: r.label })))}
      </div>`;

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تحليل الانحرافات</title>
  <style>
    @font-face { font-family: 'CairoLocal'; src: url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); font-display: swap; }
    @font-face { font-family: 'AmiriLocal'; src: url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-display: swap; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'CairoLocal', 'AmiriLocal', sans-serif; direction: rtl; padding: 12px; color: #000; background: #fff; }
    @media print { @page { size: A4 landscape; margin: 6mm; } body { padding: 0; } }
    .header { display: flex; align-items: center; justify-content: center; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .header img { width: 60px; height: 60px; object-fit: contain; }
    .header h1 { font-size: 16px; }
    .header p { font-size: 10px; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; border: 1px solid #000; padding: 5px 8px; font-size: 10px; margin-bottom: 8px; }
    .kpi-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px; }
    .kpi-box { border: 1px solid #000; padding: 6px 8px; font-size: 10px; }
    .kpi-title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 4px; font-size: 11px; }
    .kpi-line, .range-line { display: flex; justify-content: space-between; padding: 1px 0; }
    .group { border: 1px solid #000; margin-bottom: 8px; page-break-inside: avoid; }
    .group-title { background: #f0f0f0; padding: 5px 8px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; border-bottom: 1px solid #000; }
    table.items { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    table.items th, table.items td { border: 1px solid #666; padding: 2px 3px; text-align: center; }
    table.items th { background: #e5e5e5; font-weight: bold; }
    table.items td.name { text-align: right; font-weight: 500; }
    table.items tr.total td { background: #ddd; font-weight: bold; }
    .neg { color: #b91c1c; font-weight: bold; }
    .pos { color: #059669; font-weight: bold; }
    .group-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 6px; font-size: 9px; background: #fafafa; }
    .group-summary > div { border: 1px solid #ccc; padding: 3px 6px; display: flex; justify-content: space-between; }
    .summary-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 6px; }
    .sbox { border: 1px solid #000; }
    .sbox-title { background: #f0f0f0; padding: 4px 8px; font-size: 11px; font-weight: bold; border-bottom: 1px solid #000; }
    .sbox-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    .sbox-table th, .sbox-table td { border: 1px solid #666; padding: 3px 5px; text-align: center; }
    .sbox-table th { background: #e5e5e5; }
    .sbox-table tr.total td { background: #ddd; font-weight: bold; }
    .footer { text-align: center; margin-top: 10px; font-size: 8px; border-top: 1px solid #000; padding-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" onerror="this.style.display='none'" />
    <div>
      <h1>تحليل الانحرافات - تقرير انحراف خامات المطبخ</h1>
      <p>نظام إدارة التكاليف • ${dateStr}</p>
    </div>
  </div>
  ${filtersHTML}
  ${kpiHTML}
  ${groupsHTML || '<div style="text-align:center;padding:20px;border:1px solid #000;">لا توجد بيانات</div>'}
  ${summaryHTML}
  <div class="footer">Powered by Mohamed Abdel Aal</div>
</body>
</html>`;
  };

  const handlePrint = () => {
    if (!hasPeriod) return;
    const html = buildReportHTML();
    const w = window.open("", "_blank");
    if (!w) { toast.error("افتح النوافذ المنبثقة"); return; }
    w.document.write(html + `<script>
      (async function(){ try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(e){}
        setTimeout(function(){ window.print(); window.onafterprint = function(){ window.close(); }; }, 300);
      })();
    </script>`);
    w.document.close();
  };

  const handleExportPdf = async () => {
    if (!hasPeriod) return;
    setPdfBusy(true);
    try {
      // Render the same HTML off-screen then rasterize to PDF (preserves formatted report layout)
      const html = buildReportHTML();
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-10000px";
      iframe.style.top = "0";
      iframe.style.width = "1200px";
      iframe.style.height = "800px";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      // wait for fonts + images
      await new Promise((r) => setTimeout(r, 600));
      try { await (doc as any).fonts?.ready; } catch {}
      const body = doc.body;
      body.style.width = "1200px";
      const canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 1200 });
      document.body.removeChild(iframe);

      const pdf = new jsPDF("l", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // ── Cover page ──
      const printDateStr = new Date().toLocaleString("ar-EG");
      pdf.setFillColor(240, 240, 240);
      pdf.rect(0, 0, pageW, pageH, "F");
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.text("Variance Analysis Report", pageW / 2, 60, { align: "center" });
      pdf.setFontSize(14);
      pdf.text("Kitchen Materials Deviation", pageW / 2, 72, { align: "center" });
      pdf.setDrawColor(0);
      pdf.line(30, 82, pageW - 30, 82);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      const meta: [string, string][] = [
        ["Branch", branchFilter === "all" ? "All Branches" : ((branches || []).find((b: any) => b.id === branchFilter)?.name || "-")],
        ["Department", departmentFilter === "all" ? "All Departments" : ((departments || []).find((d: any) => d.id === departmentFilter)?.name || "-")],
        ["Period From", dateFrom ? format(dateFrom, "yyyy-MM-dd") : "-"],
        ["Period To", dateTo ? format(dateTo, "yyyy-MM-dd") : "-"],
        ["Previous Period", prevRange ? `${format(prevRange.from, "yyyy-MM-dd")} → ${format(prevRange.to, "yyyy-MM-dd")}` : "-"],
        ["Net Sales", `${fmt(netSales)} EGP`],
        ["Net Cost Variance", `${fmt(costKpis.netVal)} EGP`],
        ["Total Items", String(current.size)],
        ["Printed At", printDateStr],
        ["Printed By", auth.profile?.full_name || "-"],
      ];
      let ly = 100;
      meta.forEach(([k, v]) => {
        pdf.setFont("helvetica", "bold");
        pdf.text(`${k}:`, 40, ly);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(v), 90, ly);
        ly += 8;
      });
      pdf.setFontSize(8);
      pdf.text("Powered by Mohamed Abdel Aal", pageW / 2, pageH - 8, { align: "center" });

      // ── Content pages ──
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      let heightLeft = imgH;
      let position = 0;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      // ── Footer with page numbers on all pages ──
      const total = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`Page ${i} / ${total}`, pageW - 15, pageH - 5, { align: "right" });
        pdf.text(printDateStr, 15, pageH - 5);
      }
      pdf.save(`تحليل-الانحرافات-${dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""}_${dateTo ? format(dateTo, "yyyy-MM-dd") : ""}.pdf`);
      toast.success("تم تصدير PDF");
    } catch (e) {
      console.error(e);
      toast.error("فشل التصدير");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (!hasPeriod) return;
    try {
      const columns = [
        { key: "catName", label: "المجموعة" },
        { key: "name", label: "الخامة" },
        { key: "unit", label: "الوحدة" },
        { key: "openQty", label: "أول المدة" },
        { key: "inQty", label: "وارد" },
        { key: "outQty", label: "استهلاك نظري" },
        { key: "bookQty", label: "آخر المدة نظري" },
        { key: "countQty", label: "الرصيد الفعلي" },
        { key: "diffQty", label: "الفرق" },
        { key: "costVar", label: "قيمة الانحراف" },
        { key: "actualConsumedQty", label: "استهلاك فعلي" },
        { key: "actualConsumedVal", label: "قيمة الاستهلاك" },
        { key: "rate", label: "نسبة الانحراف" },
        { key: "result", label: "النتيجة" },
        { key: "analysis", label: "التحليل" },
        { key: "prevRate", label: "نسبة سابقة" },
        { key: "prevResult", label: "مقارنة" },
        { key: "note", label: "ملاحظة" },
        { key: "action_status", label: "حالة الإجراء" },
      ];
      const rows: any[] = [];
      for (const g of enriched) {
        for (const i of g.items) {
          const n = notesByItem.get(i.id);
          rows.push({
            catName: g.catName,
            name: i.name,
            unit: i.unit,
            openQty: Number(i.openQty.toFixed(3)),
            inQty: Number(i.inQty.toFixed(3)),
            outQty: Number(i.outQty.toFixed(3)),
            bookQty: Number(i.bookQty.toFixed(3)),
            countQty: Number(i.countQty.toFixed(3)),
            diffQty: Number(i.diffQty.toFixed(3)),
            costVar: Number(i.costVar.toFixed(2)),
            actualConsumedQty: Number(i.actualConsumedQty.toFixed(3)),
            actualConsumedVal: Number(i.actualConsumedVal.toFixed(2)),
            rate: (i.rate * 100).toFixed(2) + "%",
            result: i.result === "Short" ? "عجز" : i.result === "Over" ? "زيادة" : "متطابق",
            analysis: i.analysis,
            prevRate: i.prevRate != null ? (i.prevRate * 100).toFixed(2) + "%" : "-",
            prevResult: i.prevResult || "-",
            note: n?.note || "",
            action_status: n?.action_status || "",
          });
        }
      }
      await exportToExcel({
        title: "تحليل الانحرافات",
        filename: `variance-analysis-${dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""}_${dateTo ? format(dateTo, "yyyy-MM-dd") : ""}`,
        columns,
        data: rows,
        filters: [
          { label: "الفرع", value: branchFilter === "all" ? "الكل" : ((branches || []).find((b: any) => b.id === branchFilter)?.name || "-") },
          { label: "القسم", value: departmentFilter === "all" ? "الكل" : ((departments || []).find((d: any) => d.id === departmentFilter)?.name || "-") },
          { label: "الفترة", value: `${dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""} → ${dateTo ? format(dateTo, "yyyy-MM-dd") : ""}` },
        ],
      });
      toast.success("تم تصدير Excel");
    } catch (e) {
      console.error(e);
      toast.error("فشل التصدير");
    }
  };

  /* ============ UI ============ */
  const hasPeriod = dateFrom && dateTo;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold">تحليل الانحرافات - Variance Analysis</h1>
          <p className="text-sm text-muted-foreground">تقرير انحراف خامات المطبخ - مقارنة الاستهلاك النظري بالفعلي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handlePrint} disabled={!hasPeriod}>
            <Printer className="w-4 h-4 ml-2" /> طباعة
          </Button>
          <Button variant="outline" onClick={handleExportPdf} disabled={!hasPeriod || pdfBusy}>
            {pdfBusy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <FileDown className="w-4 h-4 ml-2" />} تصدير PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} disabled={!hasPeriod}>
            <FileDown className="w-4 h-4 ml-2 text-green-600" /> تصدير Excel
          </Button>
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="w-4 h-4 ml-2" /> الإعدادات
          </Button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-5 print-area">

      {/* Filters */}
      <div className="bg-card border rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs mb-1 block">الفرع</Label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger><Building2 className="w-4 h-4 ml-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {(branches || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">القسم</Label>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger><Warehouse className="w-4 h-4 ml-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {(departments || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">من تاريخ</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="ml-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "اختر"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" /></PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs mb-1 block">إلى تاريخ</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="ml-2 h-4 w-4" />
                {dateTo ? format(dateTo, "yyyy-MM-dd") : "اختر"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" /></PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Top info + Legend + Consumables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales info */}
        <div className="bg-card border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2"><Store className="w-4 h-4" /> بيانات الفترة</div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">مبيعات الفترة</span><span className="font-bold">{fmt(netSales)} ج.م</span></div>
          {prevRange && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>الفترة السابقة</span>
              <span>{format(prevRange.from, "yyyy-MM-dd")} → {format(prevRange.to, "yyyy-MM-dd")}</span>
            </div>
          )}
        </div>

        {/* Consumables monitor — per department */}
        <div className={cn("border rounded-lg p-4 space-y-2",
          consumables.status === "alert" ? "bg-red-50 dark:bg-red-950/30 border-red-300" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300")}>
          <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2">
            <Package className="w-4 h-4" /> رقابة المستهلكات {departmentFilter !== "all" ? "(القسم المحدد)" : "(كل الأقسام)"}
          </div>

          {consumables.rows.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">لا توجد مستهلكات مسجلة لهذا النطاق</div>
          )}

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {consumables.rows.map((r) => {
              const label =
                r.kind === "packaging" ? "Packaging Cost %"
                : r.kind === "general" ? "General Consumables %"
                : "نسبة المستهلكات";
              const badgeCls =
                r.kind === "packaging" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                : r.kind === "general" ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
                : r.status === "alert" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
              return (
                <div key={r.deptId} className="border rounded p-2 bg-background/60 space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold">{r.deptName}</span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", badgeCls)}>{label}</span>
                  </div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">قيمة الاستهلاك</span><span className="font-bold">{fmt(r.consumedVal)} ج.م</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">النسبة / المبيعات</span><span className="font-bold">{fmtPct(r.ratio)}</span></div>
                  {r.kind === "consumables" && (
                    <div className={cn("text-[11px] font-semibold", r.status === "alert" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
                      {r.status === "alert" ? "تخطت الحد" : "مستقر"}
                    </div>
                  )}
                  {r.kind !== "consumables" && (
                    <div className="text-[11px] text-muted-foreground">مؤشر مستقل — لا يخضع لحد رقابة المستهلكات</div>
                  )}
                  {r.cats.length > 0 && (
                    <div className="mt-2 border-t pt-2 space-y-1">
                      <div className="text-[10px] font-semibold text-muted-foreground">تفصيل حسب المجموعة</div>
                      {r.cats.map((cr) => (
                        <div key={cr.catId} className="rounded bg-muted/40 px-2 py-1">
                          <div className="flex justify-between text-[11px] font-semibold"><span>{cr.catName}</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">قيمة الاستهلاك</span><span className="font-bold">{fmt(cr.consumedVal)} ج.م</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">النسبة / المبيعات</span><span className="font-bold">{fmtPct(cr.ratio)}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">إجمالي المستهلكات (بدون Packaging/General)</span><span className="font-bold">{fmt(consumables.consumedVal)} ج.م</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">النسبة الإجمالية</span><span className="font-bold">{fmtPct(consumables.ratio)}</span></div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">الحد المسموح %</Label>
              <Input type="number" step="0.1" className="h-7 w-20 text-xs" value={consumablesLimitPct} onChange={(e) => setConsumablesLimitPct(Number(e.target.value) || 0)} />
            </div>
            <div className={cn("flex items-center gap-2 text-xs font-semibold", consumables.status === "alert" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
              {consumables.status === "alert" ? <><AlertTriangle className="w-3.5 h-3.5" /> تخطت النسبة المحددة - رقابة مطلوبة</> : <><CheckCircle2 className="w-3.5 h-3.5" /> الوضع مستقر</>}
            </div>
          </div>
        </div>

        {/* Variance ranges */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2 mb-2">نسب الانحراف</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><span>جيد (Good)</span><span className="font-bold">0%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"><span>طبيعي (Normal)</span><span className="font-bold">1% : 2%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200"><span>مقبول (Accept)</span><span className="font-bold">2% : 5%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"><span>انحراف (Deviation)</span><span className="font-bold">5% : 10%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200"><span>خطأ تشغيلي</span><span className="font-bold">10% : 20%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"><span>انحراف عالي</span><span className="font-bold">20% : 50%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-red-600 text-white"><span>مشكلة (Issue)</span><span className="font-bold">&gt; 50%</span></div>
          </div>
        </div>
      </div>

      {/* Cost Variance KPI + Previous period comparison */}
      {hasPeriod && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="w-4 h-4" /> صافي التأثير المالي</div>
            <div className={cn("text-xl font-bold mt-1", costKpis.netVal < 0 ? "text-red-600" : costKpis.netVal > 0 ? "text-emerald-600" : "")}>{fmt(costKpis.netVal)} ج.م</div>
            <div className="text-[10px] text-muted-foreground mt-1">الفترة السابقة: {fmt(costKpis.prevNet)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300"><TrendingDown className="w-4 h-4" /> قيمة العجز</div>
            <div className="text-xl font-bold mt-1 text-red-700 dark:text-red-300">{fmt(costKpis.shortVal)} ج.م</div>
          </div>
          <div className="border rounded-lg p-4 bg-emerald-50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"><TrendingUp className="w-4 h-4" /> قيمة الزيادة</div>
            <div className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{fmt(costKpis.overVal)} ج.م</div>
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">متوسط نسبة الانحراف</div>
            <div className="text-xl font-bold mt-1">{fmtPct(costKpis.avgRate)}</div>
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              الفترة السابقة: {fmtPct(costKpis.prevAvgRate)}
              {costKpis.avgRate < costKpis.prevAvgRate ? <ArrowDown className="w-3 h-3 text-emerald-600" /> :
                costKpis.avgRate > costKpis.prevAvgRate ? <ArrowUp className="w-3 h-3 text-red-600" /> :
                <Minus className="w-3 h-3" />}
            </div>
          </div>
        </div>
      )}

      {/* Preset filters + Subtotals toggle */}
      {hasPeriod && (
        <div className="flex items-center gap-2 flex-wrap border rounded-lg p-2 bg-card no-print">
          <span className="text-xs text-muted-foreground ml-2">فلاتر سريعة:</span>
          {[
            { id: "all", label: "الكل" },
            { id: "consumables", label: "المستهلكات فقط" },
            { id: "high", label: "أعلى انحراف (Deviation+)" },
            { id: "with-notes", label: "بها ملاحظات" },
            { id: "short", label: "العجز فقط" },
            { id: "over", label: "الزيادة فقط" },
          ].map(p => (
            <Button key={p.id} size="sm" variant={activePreset === p.id ? "default" : "outline"} onClick={() => setActivePreset(p.id)}>{p.label}</Button>
          ))}
          {(departments || []).slice(0, 4).map((d: any) => (
            <Button key={d.id} size="sm" variant={departmentFilter === d.id ? "default" : "outline"} onClick={() => setDepartmentFilter(departmentFilter === d.id ? "all" : d.id)}>قسم: {d.name}</Button>
          ))}
          <div className="mr-auto flex items-center gap-2">
            <Checkbox id="subs" checked={showSubtotals} onCheckedChange={(v) => setShowSubtotals(!!v)} />
            <Label htmlFor="subs" className="text-xs cursor-pointer">عرض إجماليات المجموعات</Label>
          </div>
        </div>
      )}

      {/* Chart + Top-N side by side */}
      {hasPeriod && summaryStats.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> توزيع الانحرافات</div>
              <div className="flex gap-1">
                <Button size="sm" variant={chartType === "bar" ? "default" : "outline"} onClick={() => setChartType("bar")}><BarChart3 className="w-4 h-4" /></Button>
                <Button size="sm" variant={chartType === "pie" ? "default" : "outline"} onClick={() => setChartType("pie")}><PieChartIcon className="w-4 h-4" /></Button>
              </div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                {chartType === "bar" ? (
                  <BarChart data={summaryStats.analysisRows}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e">
                      {summaryStats.analysisRows.map((r, i) => (
                        <Cell key={i} fill={
                          r.label === "Good" ? "#10b981" :
                          r.label === "Normal" ? "#14b8a6" :
                          r.label === "Accept" ? "#84cc16" :
                          r.label === "Deviation" ? "#eab308" :
                          r.label === "Operation error" ? "#f97316" :
                          r.label === "High deflection" ? "#ef4444" : "#7f1d1d"} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Pie data={summaryStats.analysisRows.filter(r => r.count > 0)} dataKey="count" nameKey="label" outerRadius={90} label>
                      {summaryStats.analysisRows.filter(r => r.count > 0).map((r, i) => (
                        <Cell key={i} fill={
                          r.label === "Good" ? "#10b981" :
                          r.label === "Normal" ? "#14b8a6" :
                          r.label === "Accept" ? "#84cc16" :
                          r.label === "Deviation" ? "#eab308" :
                          r.label === "Operation error" ? "#f97316" :
                          r.label === "High deflection" ? "#ef4444" : "#7f1d1d"} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold">أعلى الانحرافات</div>
              <div className="flex gap-1">
                <Button size="sm" variant={topSortMode === "rate" ? "default" : "outline"} onClick={() => setTopSortMode("rate")}>حسب النسبة</Button>
                <Button size="sm" variant={topSortMode === "costVar" ? "default" : "outline"} onClick={() => setTopSortMode("costVar")}>حسب القيمة</Button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="text-right">الخامة</TableHead>
                    <TableHead className="text-center">النسبة</TableHead>
                    <TableHead className="text-center">قيمة الفرق</TableHead>
                    <TableHead className="text-center">التحليل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDeviations.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-3">لا توجد انحرافات</TableCell></TableRow>
                  )}
                  {topDeviations.map((i) => (
                    <TableRow key={i.id} className="text-xs">
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-center">{fmtPct(i.rate)}</TableCell>
                      <TableCell className={cn("text-center font-semibold", i.costVar < 0 ? "text-red-600" : "text-emerald-600")}>{fmt(i.costVar)}</TableCell>
                      <TableCell className="text-center"><span className={cn("px-2 py-0.5 rounded font-semibold", analysisColor(i.analysis))}>{i.analysis}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {!hasPeriod && (
        <div className="p-8 text-center text-muted-foreground border rounded-lg">اختر فترة زمنية (من / إلى) لعرض التقرير</div>
      )}

      {/* Groups */}
      {hasPeriod && enriched.length === 0 && (
        <div className="p-8 text-center text-muted-foreground border rounded-lg">لا توجد بيانات مطابقة للفلاتر</div>
      )}



      {hasPeriod && enriched.map((group) => {
        // apply preset filter
        const items = group.items.filter((i) => {
          if (activePreset === "consumables") return i.isConsumable;
          if (activePreset === "high") {
            return ["Deviation", "Operation error", "High deflection", "Issue"].includes(i.analysis);
          }
          if (activePreset === "with-notes") return notesByItem.has(i.id);
          if (activePreset === "short") return i.result === "Short";
          if (activePreset === "over") return i.result === "Over";
          return true;
        });
        if (items.length === 0) return null;
        const shortSum = items.filter(i => i.costVar < 0).reduce((s, i) => s + i.costVar, 0);
        const overSum = items.filter(i => i.costVar > 0).reduce((s, i) => s + i.costVar, 0);
        const netSum = shortSum + overSum;
        const receiveValSum = items.reduce((s, i) => s + i.receiveVal, 0);
        const consumedValSum = items.reduce((s, i) => s + i.actualConsumedVal, 0);
        const chargedSum = items.reduce((s, i) => s + i.chargedRatio, 0);
        const costSum = items.reduce((s, i) => s + i.costVar, 0);
        const allowedLoss = netSum * group.permissible;
        const ratioReceiptsSales = netSales > 0 ? receiveValSum / netSales : 0;
        const ratioConsumeSales = netSales > 0 ? consumedValSum / netSales : 0;
        const ratioVarSales = netSales > 0 ? netSum / netSales : 0;
        const ratioVarConsume = consumedValSum > 0 ? netSum / consumedValSum : 0;

        return (
          <div key={group.catId} className="border rounded-lg overflow-hidden bg-card">
            <div className="bg-primary/10 px-4 py-2 flex justify-between items-center">
              <h2 className="font-bold text-base">{group.catName} <span className="text-xs text-muted-foreground font-normal">({items.length} خامة)</span></h2>
              <div className="text-xs text-muted-foreground">
                نسبة السماح: <span className="font-bold text-foreground">{fmtPct(group.permissible)}</span>
              </div>
            </div>

            {/* Items table (RTL — first col = Items) */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 text-xs">
                    <TableHead className="text-right">الخامة</TableHead>
                    <TableHead className="text-center">أول المدة</TableHead>
                    <TableHead className="text-center">وارد</TableHead>
                    <TableHead className="text-center">استهلاك نظري</TableHead>
                    <TableHead className="text-center">آخر المدة نظري</TableHead>
                    <TableHead className="text-center">الرصيد الفعلي</TableHead>
                    <TableHead className="text-center">الفرق</TableHead>
                    <TableHead className="text-center">قيمة الانحراف</TableHead>
                    <TableHead className="text-center">استهلاك فعلي</TableHead>
                    <TableHead className="text-center">نسبة الانحراف</TableHead>
                    <TableHead className="text-center">النتيجة</TableHead>
                    <TableHead className="text-center">التحليل</TableHead>
                    <TableHead className="text-center">القيمة المحملة</TableHead>
                    <TableHead className="text-center">النسبة السابقة</TableHead>
                    <TableHead className="text-center">مقارنة</TableHead>
                    <TableHead className="text-center">ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const note = notesByItem.get(i.id);
                    const statusColor = note?.action_status === "settled" ? "text-emerald-600" :
                      note?.action_status === "reviewed" ? "text-blue-600" :
                      note?.action_status === "needs_recount" ? "text-orange-600" :
                      note?.action_status === "pending" ? "text-yellow-600" : "text-muted-foreground";
                    return (
                    <TableRow key={i.id} className="text-xs">
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-center">{fmt(i.openQty, 3)}</TableCell>
                      <TableCell className="text-center">{fmt(i.inQty, 3)}</TableCell>
                      <TableCell className="text-center">{fmt(i.outQty, 3)}</TableCell>
                      <TableCell className="text-center">{fmt(i.bookQty, 3)}</TableCell>
                      <TableCell className="text-center">{fmt(i.countQty, 3)}</TableCell>
                      <TableCell className={cn("text-center font-semibold", i.diffQty < 0 ? "text-red-600" : i.diffQty > 0 ? "text-emerald-600" : "")}>{fmt(i.diffQty, 3)}</TableCell>
                      <TableCell className={cn("text-center font-semibold", i.costVar < 0 ? "text-red-600" : i.costVar > 0 ? "text-emerald-600" : "")}>{fmt(i.costVar)}</TableCell>
                      <TableCell className="text-center">{fmt(i.actualConsumedQty, 3)}</TableCell>
                      <TableCell className="text-center">{fmtPct(i.rate)}</TableCell>
                      <TableCell className="text-center">{i.result === "Short" ? "عجز" : i.result === "Over" ? "زيادة" : "متطابق"}</TableCell>
                      <TableCell className="text-center"><span className={cn("px-2 py-0.5 rounded text-xs font-semibold", analysisColor(i.analysis))}>{i.analysis}</span></TableCell>
                      <TableCell className="text-center">{fmt(i.chargedRatio)}</TableCell>
                      <TableCell className="text-center">{i.prevRate != null ? fmtPct(i.prevRate) : "-"}</TableCell>
                      <TableCell className={cn("text-center", prevResultColor(i.prevResult))}>{i.prevResult || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openNoteEditor(i.id, i.name)} title={note?.note || "أضف ملاحظة"}>
                          <MessageSquare className={cn("w-4 h-4", note ? statusColor : "text-muted-foreground/50")} />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {/* Group total row */}
                  {showSubtotals && (
                    <TableRow className="bg-muted font-bold text-xs">
                      <TableCell>إجمالي {group.catName}</TableCell>
                      <TableCell colSpan={6}></TableCell>
                      <TableCell className={cn("text-center", costSum < 0 ? "text-red-600" : costSum > 0 ? "text-emerald-600" : "")}>{fmt(costSum)}</TableCell>
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-center">{fmt(chargedSum)}</TableCell>
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Group summary box */}
            {showSubtotals && (
            <div className="p-4 border-t bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة السماح</div>
                <div className="font-bold">{fmtPct(group.permissible)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">القيمة المسموحة (Allowed Loss)</div>
                <div className={cn("font-bold", allowedLoss < 0 ? "text-red-600" : "text-emerald-600")}>{fmt(allowedLoss)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">إجمالي قيمة الاستلامات</div>
                <div className="font-bold">{fmt(receiveValSum)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">إجمالي قيمة الاستهلاك الفعلي</div>
                <div className="font-bold">{fmt(consumedValSum)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">إجمالي العجز</div>
                <div className="font-bold text-red-600">{fmt(shortSum)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">إجمالي الزيادة</div>
                <div className="font-bold text-emerald-600">{fmt(overSum)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">صافي الانحراف</div>
                <div className={cn("font-bold", netSum < 0 ? "text-red-600" : netSum > 0 ? "text-emerald-600" : "")}>{fmt(netSum)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة الاستلامات / المبيعات</div>
                <div className="font-bold">{fmtPct(ratioReceiptsSales)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة الاستهلاك / المبيعات</div>
                <div className="font-bold">{fmtPct(ratioConsumeSales)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة الانحراف / المبيعات</div>
                <div className={cn("font-bold", ratioVarSales < 0 ? "text-red-600" : ratioVarSales > 0 ? "text-emerald-600" : "")}>{fmtPct(ratioVarSales)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة الانحراف / الاستهلاك</div>
                <div className={cn("font-bold", ratioVarConsume < 0 ? "text-red-600" : ratioVarConsume > 0 ? "text-emerald-600" : "")}>{fmtPct(ratioVarConsume)}</div>
              </div>
            </div>
            )}
          </div>
        );
      })}


      {/* Excel-style summary boxes */}
      {hasPeriod && summaryStats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryBox
            title="النتيجة (Result)"
            headers={["Ratio", "No.Repetition", "Result"]}
            rows={summaryStats.resultRows.map((r) => ({
              ratio: fmtPct(r.ratio, 2),
              count: r.count,
              label: r.label,
              color: r.label === "Short" ? "bg-red-50 dark:bg-red-950/30" : r.label === "Over" ? "bg-amber-50 dark:bg-amber-950/30" : "bg-emerald-50 dark:bg-emerald-950/30",
            }))}
          />
          <SummaryBox
            title="التحليل (Analysis)"
            headers={["Ratio", "No.Repetition", "Result"]}
            rows={summaryStats.analysisRows.map((r) => ({
              ratio: fmtPct(r.ratio, 2),
              count: r.count,
              label: r.label,
              color: analysisColor(r.label as Analysis) || "",
            }))}
          />
          <SummaryBox
            title="مقارنة بالفترة السابقة (Previous)"
            headers={["Ratio", "No.Repetition", "Result"]}
            rows={summaryStats.prevRows.map((r) => ({
              ratio: fmtPct(r.ratio, 2),
              count: r.count,
              label: r.label,
              color: r.label === "Better" || r.label === "Change to Increase"
                ? "bg-emerald-50 dark:bg-emerald-950/30"
                : r.label === "High" || r.label === "Change to Loss"
                ? "bg-red-50 dark:bg-red-950/30"
                : "bg-muted",
            }))}
          />
        </div>
      )}
      </div>{/* /print-area */}


      {/* Manage dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader><DialogTitle>إعدادات تحليل الانحرافات</DialogTitle></DialogHeader>
          <div className="flex gap-2 border-b">
            <button className={cn("px-3 py-2 text-sm border-b-2", manageTab === "permissible" ? "border-primary font-bold" : "border-transparent text-muted-foreground")} onClick={() => setManageTab("permissible")}>نسب السماح للفئات</button>
            <button className={cn("px-3 py-2 text-sm border-b-2", manageTab === "consumables" ? "border-primary font-bold" : "border-transparent text-muted-foreground")} onClick={() => setManageTab("consumables")}>خامات المستهلكات</button>
            <button className={cn("px-3 py-2 text-sm border-b-2", manageTab === "thresholds" ? "border-primary font-bold" : "border-transparent text-muted-foreground")} onClick={() => setManageTab("thresholds")}>عتبات التصنيف</button>
          </div>
          <div className="overflow-y-auto flex-1 py-3">
            {manageTab === "thresholds" && (
              <div className="space-y-3 max-w-lg mx-auto">
                <p className="text-xs text-muted-foreground">حدّد الحد الأقصى (%) لكل تصنيف. القيم يجب أن تكون تصاعدية.</p>
                {([
                  ["normal", "Normal - طبيعي"],
                  ["accept", "Accept - مقبول"],
                  ["deviation", "Deviation - انحراف"],
                  ["operation", "Operation error - خطأ تشغيلي"],
                  ["highDefl", "High deflection - انحراف عالي"],
                ] as const).map(([k, lbl]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <Label className="text-sm">{lbl}</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.1" className="h-8 w-24 text-center"
                        value={(thresholds[k] * 100).toString()}
                        onChange={(e) => setThresholds({ ...thresholds, [k]: (Number(e.target.value) || 0) / 100 })} />
                      <span className="text-xs">%</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>إعادة الافتراضي</Button>
                </div>
              </div>
            )}
            {manageTab === "permissible" && (
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">الفئة</TableHead><TableHead className="text-center">نسبة السماح %</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(categories || []).map((c: any) => (
                    <PermissibleRow key={c.id} category={c} saving={savingCat === c.id} onSave={(pct) => updatePermissible(c.id, pct)} />
                  ))}
                </TableBody>
              </Table>
            )}
            {manageTab === "consumables" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs mb-1 block">القسم</Label>
                    <Select value={consumableDeptFilter} onValueChange={setConsumableDeptFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الأقسام</SelectItem>
                        {(departments || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">المجموعة</Label>
                    <Select value={consumableCatFilter} onValueChange={setConsumableCatFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المجموعات</SelectItem>
                        {(categories || [])
                          .filter((c: any) => consumableDeptFilter === "all" || c.department_id === consumableDeptFilter)
                          .map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">بحث باسم الخامة</Label>
                    <Input value={consumableSearch} onChange={(e) => setConsumableSearch(e.target.value)} placeholder="ابحث..." className="h-9" />
                  </div>
                </div>
                {(() => {
                  const filteredItems = (stockItems || []).filter((si: any) => {
                    if (consumableSearch.trim()) {
                      const q = consumableSearch.trim().toLowerCase();
                      if (!(si.name || "").toLowerCase().includes(q) && !(si.code || "").toLowerCase().includes(q)) return false;
                    }
                    if (consumableCatFilter !== "all") {
                      const cats = itemCats.get(si.id);
                      const inCat = (cats && cats.has(consumableCatFilter)) || si.category_id === consumableCatFilter;
                      if (!inCat) return false;
                    }
                    if (consumableDeptFilter !== "all") {
                      const cats = itemCats.get(si.id);
                      const inDept = cats && Array.from(cats).some((cid) =>
                        (categories || []).find((c: any) => c.id === cid && c.department_id === consumableDeptFilter)
                      );
                      if (!inDept && si.department_id !== consumableDeptFilter) return false;
                    }
                    return true;
                  });
                  const allSelected = filteredItems.length > 0 && filteredItems.every((si: any) => si.is_consumable);
                  const someSelected = filteredItems.some((si: any) => si.is_consumable);
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm bg-muted/50 rounded px-3 py-2">
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">إجمالي المستهلكات: <span className="font-bold text-foreground">{(stockItems || []).filter((si: any) => si.is_consumable).length}</span></span>
                          <span className="text-muted-foreground">المعروض: <span className="font-bold text-foreground">{filteredItems.length}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={bulkBusy || filteredItems.length === 0}
                            onClick={() => bulkToggleConsumable(filteredItems.map((s: any) => s.id), !allSelected)}>
                            {bulkBusy ? "..." : allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                          </Button>
                          {someSelected && !allSelected && (
                            <Button size="sm" variant="ghost" disabled={bulkBusy}
                              onClick={() => bulkToggleConsumable(filteredItems.filter((s: any) => s.is_consumable).map((s: any) => s.id), false)}>
                              إلغاء المحددة
                            </Button>
                          )}
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-center w-12">
                              <Checkbox checked={allSelected} onCheckedChange={(v) => bulkToggleConsumable(filteredItems.map((s: any) => s.id), !!v)} />
                            </TableHead>
                            <TableHead className="text-right">الخامة</TableHead>
                            <TableHead className="text-right">الكود</TableHead>
                            <TableHead className="text-center">مستهلكات؟</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredItems.map((si: any) => (
                            <TableRow key={si.id}>
                              <TableCell className="text-center">
                                <Checkbox checked={!!si.is_consumable} onCheckedChange={(v) => toggleConsumable(si.id, !!v)} />
                              </TableCell>
                              <TableCell>{si.name}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{si.code || "-"}</TableCell>
                              <TableCell className="text-center">
                                {si.is_consumable ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  );
                })()}

              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setManageOpen(false)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note editor dialog */}
      <Dialog open={!!noteEditor} onOpenChange={(o) => !o && setNoteEditor(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>ملاحظة على: {noteEditor?.itemName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">حالة الإجراء</Label>
              <Select value={noteDraft.action_status} onValueChange={(v) => setNoteDraft({ ...noteDraft, action_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="reviewed">تمت المراجعة</SelectItem>
                  <SelectItem value="needs_recount">يحتاج جرد</SelectItem>
                  <SelectItem value="settled">تمت التسوية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">الملاحظة</Label>
              <Textarea rows={4} value={noteDraft.note} onChange={(e) => setNoteDraft({ ...noteDraft, note: e.target.value })} placeholder="اكتب ملاحظتك..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteEditor(null)}>إلغاء</Button>
            <Button onClick={saveNote}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ---------- Permissible % row (inline edit) ---------- */
const PermissibleRow: React.FC<{ category: any; saving: boolean; onSave: (pct: number) => void }> = ({ category, saving, onSave }) => {
  const [val, setVal] = useState<string>(((Number(category.permissible_percentage ?? 0.05)) * 100).toString());
  return (
    <TableRow>
      <TableCell>{category.name}</TableCell>
      <TableCell className="text-center">
        <Input type="number" step="0.1" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-24 mx-auto text-center" />
      </TableCell>
      <TableCell className="text-center">
        <Button size="sm" disabled={saving} onClick={() => onSave((Number(val) || 0) / 100)}>{saving ? "..." : "حفظ"}</Button>
      </TableCell>
    </TableRow>
  );
};

/* ---------- Summary box (Excel-style) ---------- */
const SummaryBox: React.FC<{
  title: string;
  headers: [string, string, string];
  rows: { ratio: string; count: number; label: string; color?: string }[];
}> = ({ title, headers, rows }) => {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="bg-primary/10 px-3 py-2 text-sm font-bold">{title}</div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 text-xs">
            <TableHead className="text-center">{headers[0]}</TableHead>
            <TableHead className="text-center">{headers[1]}</TableHead>
            <TableHead className="text-center">{headers[2]}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} className="text-xs">
              <TableCell className="text-center font-medium">{r.ratio}</TableCell>
              <TableCell className="text-center">{r.count}</TableCell>
              <TableCell className={cn("text-center font-semibold", r.color)}>{r.label}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted font-bold text-xs">
            <TableCell></TableCell>
            <TableCell className="text-center">{total}</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

export default VarianceAnalysisPage;

