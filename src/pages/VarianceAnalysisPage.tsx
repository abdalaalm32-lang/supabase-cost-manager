import React, { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, subMonths } from "date-fns";
import { CalendarIcon, Store, Building2, Warehouse, Settings2, Package, AlertTriangle, CheckCircle2, Printer, FileDown, Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useBranchCosts } from "@/hooks/useBranchCosts";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* =========================================================
   VARIANCE ANALYSIS PAGE (تقرير انحراف خامات المطبخ)
   ---------------------------------------------------------
   Mirrors the client's Excel formulas:
    - Per-item deviation & analysis banding
    - Per-category summary (Allowed loss, Ratios/Sales)
    - Previous period comparison
    - Consumables ratio monitor vs configurable limit
   ========================================================= */

type Analysis = "Normal" | "Accept" | "Deviation" | "Operation error" | "High deflection" | "Issue";
type ResultSign = "Short" | "Over" | "Equal";
type PrevResult = "Better" | "High" | "Fixed" | "Change to Loss" | "Change to Increase";

const analyzeRate = (rate: number): Analysis => {
  const a = Math.abs(rate);
  if (a === 0) return "Normal";
  if (a <= 0.02) return "Normal";
  if (a <= 0.05) return "Accept";
  if (a <= 0.10) return "Deviation";
  if (a <= 0.20) return "Operation error";
  if (a <= 0.50) return "High deflection";
  return "Issue";
};

const analysisColor = (a: Analysis) => {
  switch (a) {
    case "Normal": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
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
  const [manageTab, setManageTab] = useState<"permissible" | "consumables">("permissible");
  const [consumableDeptFilter, setConsumableDeptFilter] = useState<string>("all");
  const [consumableCatFilter, setConsumableCatFilter] = useState<string>("all");
  const [consumableSearch, setConsumableSearch] = useState<string>("");

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
      // Consumables: if in shortage, zero out the difference (set actual = book)
      if (c.isConsumable && c.diffQty < 0) {
        c.countQty = c.bookQty;
        c.diffQty = 0;
      }
      c.costVar = round(c.diffQty * c.avgCost);
      c.actualConsumedQty = round(c.outQty - c.diffQty);
      c.actualConsumedVal = round(c.actualConsumedQty * c.avgCost);
      c.receiveVal = round(c.inQty * c.avgCost);
      c.rate = c.actualConsumedQty > 0 ? c.diffQty / c.actualConsumedQty : 0;
      c.analysis = analyzeRate(c.rate);
      c.result = c.diffQty < 0 ? "Short" : c.diffQty > 0 ? "Over" : "Equal";
    }
    return map;
  };

  // Current period
  const current = useMemo(() => computeForRange(dateFrom, dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, dateFrom, dateTo, branchFilter, departmentFilter, itemCats, categories, getCost]);

  // Previous period (for prev-rate)
  const previous = useMemo(() => computeForRange(prevRange?.from, prevRange?.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, prevRange, branchFilter, departmentFilter, itemCats, categories, getCost]);

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

  // Consumables monitor
  const consumables = useMemo(() => {
    let consumedVal = 0;
    for (const c of current.values()) {
      if (c.isConsumable) consumedVal += c.actualConsumedVal;
    }
    const ratio = netSales > 0 ? consumedVal / netSales : 0;
    const limit = consumablesLimitPct / 100;
    return {
      consumedVal,
      ratio,
      limit,
      status: ratio <= limit ? "ok" : "alert" as "ok" | "alert",
    };
  }, [current, netSales, consumablesLimitPct]);

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

    // Analysis distribution
    const analyses: Analysis[] = ["Normal", "Accept", "Deviation", "Operation error", "High deflection", "Issue"];
    const analysisRows = analyses.map((a) => {
      const c = cnt((i) => i.analysis === a);
      return { label: a, count: c, ratio: pct(c) };
    });
    // include Equal-only (rate=0) as "Equal" first row to mirror the excel image
    const equalCount = cnt((i) => i.rate === 0 && i.result === "Equal");
    const analysisFull = [{ label: "Equal", count: equalCount, ratio: pct(equalCount) }, ...analysisRows];

    // Previous comparison distribution
    const prevLabels: (PrevResult | "None")[] = ["Better", "High", "Fixed", "Change to Loss", "Change to Increase"];
    const prevRows = prevLabels.map((l) => {
      const c = cnt((i) => (i.prevResult || "None") === l);
      return { label: l, count: c, ratio: pct(c) };
    });

    return { total: items.length, resultRows, analysisRows: analysisFull, prevRows };
  }, [current]);

  /* ============ Print + PDF ============ */
  const reportRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setPdfBusy(true);
    try {
      const el = reportRef.current;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF("l", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
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

        {/* Consumables monitor */}
        <div className={cn("border rounded-lg p-4 space-y-2",
          consumables.status === "alert" ? "bg-red-50 dark:bg-red-950/30 border-red-300" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300")}>
          <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2">
            <Package className="w-4 h-4" /> رقابة المستهلكات
          </div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">قيمة استهلاك المستهلكات</span><span className="font-bold">{fmt(consumables.consumedVal)} ج.م</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">النسبة / المبيعات</span><span className="font-bold">{fmtPct(consumables.ratio)}</span></div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">الحد المسموح %</Label>
            <Input type="number" step="0.1" className="h-7 w-20 text-xs" value={consumablesLimitPct} onChange={(e) => setConsumablesLimitPct(Number(e.target.value) || 0)} />
          </div>
          <div className={cn("flex items-center gap-2 text-sm font-semibold", consumables.status === "alert" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
            {consumables.status === "alert" ? <><AlertTriangle className="w-4 h-4" /> تخطت النسبة المحددة - رقابة مطلوبة</> : <><CheckCircle2 className="w-4 h-4" /> الوضع مستقر</>}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2 mb-2">دلالة الألوان</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><span>Normal</span><span>0% : 2%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200"><span>Accept</span><span>2% : 5%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"><span>Deviation</span><span>5% : 10%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200"><span>Operation error</span><span>10% : 20%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"><span>High deflection</span><span>20% : 50%</span></div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-red-600 text-white"><span>Issue</span><span>&gt; 50%</span></div>
          </div>
        </div>
      </div>

      {!hasPeriod && (
        <div className="p-8 text-center text-muted-foreground border rounded-lg">اختر فترة زمنية (من / إلى) لعرض التقرير</div>
      )}

      {/* Groups */}
      {hasPeriod && enriched.length === 0 && (
        <div className="p-8 text-center text-muted-foreground border rounded-lg">لا توجد بيانات مطابقة للفلاتر</div>
      )}

      {hasPeriod && enriched.map((group) => {
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

        return (
          <div key={group.catId} className="border rounded-lg overflow-hidden bg-card">
            <div className="bg-primary/10 px-4 py-2 flex justify-between items-center">
              <h2 className="font-bold text-base">{group.catName}</h2>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((i) => (
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
                    </TableRow>
                  ))}
                  {/* Group total row */}
                  <TableRow className="bg-muted font-bold text-xs">
                    <TableCell>إجمالي {group.catName}</TableCell>
                    <TableCell colSpan={6}></TableCell>
                    <TableCell className={cn("text-center", costSum < 0 ? "text-red-600" : costSum > 0 ? "text-emerald-600" : "")}>{fmt(costSum)}</TableCell>
                    <TableCell colSpan={4}></TableCell>
                    <TableCell className="text-center">{fmt(chargedSum)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Group summary box */}
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
                <div className={cn("font-bold", ratioVarSales < 0 ? "text-red-600" : ratioVarSales > 0 ? "text-emerald-600" : "")}>{fmtPct(ratioVarSales, 4)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">نسبة الانحراف / الاستهلاك</div>
                <div className={cn("font-bold", ratioVarConsume < 0 ? "text-red-600" : ratioVarConsume > 0 ? "text-emerald-600" : "")}>{fmtPct(ratioVarConsume, 4)}</div>
              </div>
            </div>
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
          </div>
          <div className="overflow-y-auto flex-1 py-3">
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
                <div className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                  <span className="text-muted-foreground">عدد الخامات المحددة كمستهلكات</span>
                  <span className="font-bold">{(stockItems || []).filter((si: any) => si.is_consumable).length}</span>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead className="text-right">الخامة</TableHead><TableHead className="text-center">مستهلكات؟</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(stockItems || [])
                      .filter((si: any) => {
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
                      })
                      .map((si: any) => (
                        <TableRow key={si.id}>
                          <TableCell>{si.name}</TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={!!si.is_consumable} onCheckedChange={(v) => toggleConsumable(si.id, !!v)} />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setManageOpen(false)}>إغلاق</Button></DialogFooter>
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

export default VarianceAnalysisPage;
