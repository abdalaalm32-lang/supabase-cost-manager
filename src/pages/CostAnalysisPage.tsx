import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Store, Printer, FileSpreadsheet, Layers, Building2, Download, FileText, BarChart3, TrendingUp, TrendingDown, Minus, Warehouse } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportUtils";
import { useBranchCosts } from "@/hooks/useBranchCosts";
import { CostAlertsCard } from "@/components/CostAlertsCard";
import { toast } from "sonner";
import {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, LineChart, Line,
} from "recharts";

// ItemCalc type
type ItemCalc = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  avgCost: number;
  openQty: number;
  inQty: number;
  outQty: number;
  bookQty: number;
  countQty: number;
  varQty: number;
  openVal: number;
  inVal: number;
  outVal: number;
  bookVal: number;
  countVal: number;
  varVal: number;
};

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(262, 83%, 58%)",
  "hsl(0, 84%, 60%)",
];

type ChartType = "bar" | "pie" | "radar" | "area" | "line";

export const CostAnalysisPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Derived location filters
  const branchFilter = locationType === "branch" ? locationFilter : "all";
  const warehouseFilter = locationType === "warehouse" ? locationFilter : "all";
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showCharts, setShowCharts] = useState(false);

  // Per-branch / per-warehouse costs (fallback to global avg_cost)
  const activeLocationId =
    branchFilter !== "all" ? branchFilter : warehouseFilter !== "all" ? warehouseFilter : null;
  const { getCost } = useBranchCosts(activeLocationId);

  // Charts dialog state
  const [chartCategoryFilter, setChartCategoryFilter] = useState<string>("all");
  const [chartItemFilter, setChartItemFilter] = useState<string>("all");
  const [selectedChartType, setSelectedChartType] = useState<ChartType>("bar");

  // --- Data queries ---
  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories } = useQuery({
    queryKey: ["inv-categories", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems } = useQuery({
    queryKey: ["stock-items-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items").select("*, inventory_categories:category_id(id, name)")
        .eq("company_id", companyId!).eq("active", true).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Additional category links (many-to-many)
  const { data: itemCategoryLinks } = useQuery({
    queryKey: ["stock-item-categories-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_categories")
        .select("stock_item_id, category_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Map: stock_item_id -> Set of all category ids (primary + additional)
  const itemAllCategories = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (stockItems || []).forEach((si: any) => {
      const set = new Set<string>();
      if (si.category_id) set.add(si.category_id);
      map.set(si.id, set);
    });
    (itemCategoryLinks || []).forEach((l: any) => {
      if (!map.has(l.stock_item_id)) map.set(l.stock_item_id, new Set());
      map.get(l.stock_item_id)!.add(l.category_id);
    });
    return map;
  }, [stockItems, itemCategoryLinks]);

  const { data: stocktakeData } = useQuery({
    queryKey: ["stocktake-data-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktake_items").select("*, stocktakes!inner(id, date, status, type, company_id, branch_id, warehouse_id)")
        .eq("stocktakes.company_id", companyId!)
        .eq("stocktakes.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseData } = useQuery({
    queryKey: ["purchase-data-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items").select("*, purchase_orders!inner(id, date, status, company_id, branch_id, warehouse_id, department_id)")
        .eq("purchase_orders.company_id", companyId!)
        .eq("purchase_orders.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionIngData } = useQuery({
    queryKey: ["production-ing-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_ingredients").select("*, production_records!inner(id, date, status, company_id, branch_id, warehouse_id, department_id)")
        .eq("production_records.company_id", companyId!)
        .eq("production_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionRecords } = useQuery({
    queryKey: ["production-rec-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records").select("*")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: wasteData } = useQuery({
    queryKey: ["waste-data-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items").select("*, waste_records!inner(id, date, status, company_id, branch_id, warehouse_id, department_id)")
        .eq("waste_records.company_id", companyId!)
        .eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transferData } = useQuery({
    queryKey: ["transfer-data-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items").select("*, transfers!inner(id, date, status, company_id, source_id, destination_id, source_department_id, destination_department_id)")
        .eq("transfers.company_id", companyId!)
        .eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posSaleItems } = useQuery({
    queryKey: ["pos-sale-items-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items").select("*, pos_sales!inner(id, date, status, company_id, branch_id)")
        .eq("pos_sales.company_id", companyId!)
        .eq("pos_sales.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients-costing", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients").select("*, recipes!inner(id, menu_item_id, company_id)")
        .eq("recipes.company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Helpers
  const inDateRange = (dateStr: string) => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };

  const isBeforePeriod = (dateStr: string) => {
    if (!dateFrom) return false;
    return new Date(dateStr) < dateFrom;
  };

  // Calculation logic
  const calcData = useMemo(() => {
    if (!stockItems) return new Map<string, ItemCalc>();
    const map = new Map<string, ItemCalc>();

    for (const si of stockItems) {
      if (categoryFilter !== "all") {
        const allCats = itemAllCategories.get(si.id);
        if (!allCats || !allCats.has(categoryFilter)) continue;
      }
      if (departmentFilter !== "all" && si.department_id !== departmentFilter) continue;

      map.set(si.id, {
        id: si.id,
        code: si.code,
        name: si.name,
        unit: si.stock_unit,
        avgCost: getCost(si.id, si.avg_cost),
        openQty: 0, inQty: 0, outQty: 0, bookQty: 0, countQty: 0, varQty: 0,
        openVal: 0, inVal: 0, outVal: 0, bookVal: 0, countVal: 0, varVal: 0,
      });
    }

    if (stocktakeData && dateFrom) {
      const latestStocktake = new Map<string, { qty: number; date: string }>();
      for (const si of stocktakeData) {
        const stDate = (si as any).stocktakes?.date;
        const brId = (si as any).stocktakes?.branch_id;
        const whId = (si as any).stocktakes?.warehouse_id;
        if (!stDate || !isBeforePeriod(stDate)) continue;
        if (branchFilter !== "all" && brId !== branchFilter) continue;
        if (warehouseFilter !== "all" && whId !== warehouseFilter) continue;
        if (!si.stock_item_id) continue;
        const existing = latestStocktake.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          latestStocktake.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
        }
      }
      for (const [itemId, data] of latestStocktake) {
        const calc = map.get(itemId);
        if (calc) {
          calc.openQty = data.qty;
          calc.openVal = data.qty * calc.avgCost;
        }
      }
    }

    if (purchaseData) {
      for (const pi of purchaseData) {
        const poDate = (pi as any).purchase_orders?.date;
        const poBranch = (pi as any).purchase_orders?.branch_id;
        const poWarehouse = (pi as any).purchase_orders?.warehouse_id;
        const poDept = (pi as any).purchase_orders?.department_id;
        if (!poDate || !inDateRange(poDate)) continue;
        if (branchFilter !== "all" && poBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && poWarehouse !== warehouseFilter) continue;
        if (departmentFilter !== "all" && poDept !== departmentFilter) continue;
        if (!pi.stock_item_id) continue;
        const calc = map.get(pi.stock_item_id);
        if (calc) {
          calc.inQty += Number(pi.quantity);
        }
      }
    }

    if (productionRecords) {
      for (const pr of productionRecords) {
        if (!inDateRange(pr.date)) continue;
        if (branchFilter !== "all" && pr.branch_id !== branchFilter) continue;
        if (warehouseFilter !== "all" && (pr as any).warehouse_id !== warehouseFilter) continue;
        if (departmentFilter !== "all" && pr.department_id !== departmentFilter) continue;
        if (!pr.product_id) continue;
        const calc = map.get(pr.product_id);
        if (calc) {
          calc.inQty += Number(pr.produced_qty);
        }
      }
    }

    if (productionIngData) {
      for (const ing of productionIngData) {
        const prDate = (ing as any).production_records?.date;
        const prBranch = (ing as any).production_records?.branch_id;
        const prWarehouse = (ing as any).production_records?.warehouse_id;
        const prDept = (ing as any).production_records?.department_id;
        if (!prDate || !inDateRange(prDate)) continue;
        if (branchFilter !== "all" && prBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && prWarehouse !== warehouseFilter) continue;
        if (departmentFilter !== "all" && prDept !== departmentFilter) continue;
        if (!ing.stock_item_id) continue;
        const calc = map.get(ing.stock_item_id);
        if (calc) {
          calc.outQty += Number(ing.required_qty);
        }
      }
    }

    if (posSaleItems && recipeIngredients) {
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      for (const ri of recipeIngredients) {
        const menuItemId = (ri as any).recipes?.menu_item_id;
        if (!menuItemId) continue;
        if (!recipeMap.has(menuItemId)) recipeMap.set(menuItemId, []);
        const si = stockItems?.find(s => s.id === ri.stock_item_id);
        const convFactor = Number(si?.conversion_factor) || 1;
        recipeMap.get(menuItemId)!.push({
          stock_item_id: ri.stock_item_id,
          qty: Number(ri.qty) / convFactor,
        });
      }
      for (const saleItem of posSaleItems) {
        const saleDate = (saleItem as any).pos_sales?.date;
        const saleBranch = (saleItem as any).pos_sales?.branch_id;
        if (!saleDate || !inDateRange(saleDate)) continue;
        if (branchFilter !== "all" && saleBranch !== branchFilter) continue;
        if (!saleItem.pos_item_id) continue;
        const ingredients = recipeMap.get(saleItem.pos_item_id);
        if (ingredients) {
          for (const ing of ingredients) {
            const calc = map.get(ing.stock_item_id);
            if (calc) {
              calc.outQty += ing.qty * Number(saleItem.quantity);
            }
          }
        }
      }
    }

    if (wasteData) {
      for (const wi of wasteData) {
        const wrDate = (wi as any).waste_records?.date;
        const wrBranch = (wi as any).waste_records?.branch_id;
        const wrWarehouse = (wi as any).waste_records?.warehouse_id;
        const wrDept = (wi as any).waste_records?.department_id;
        if (!wrDate || !inDateRange(wrDate)) continue;
        if (branchFilter !== "all" && wrBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && wrWarehouse !== warehouseFilter) continue;
        if (departmentFilter !== "all" && wrDept !== departmentFilter) continue;
        if (!wi.stock_item_id) continue;
        const calc = map.get(wi.stock_item_id);
        if (calc) {
          calc.outQty += Number(wi.quantity);
        }
      }
    }

    if (transferData) {
      for (const ti of transferData) {
        const trDate = (ti as any).transfers?.date;
        const trSource = (ti as any).transfers?.source_id;
        const trDest = (ti as any).transfers?.destination_id;
        const trSourceDept = (ti as any).transfers?.source_department_id;
        const trDestDept = (ti as any).transfers?.destination_department_id;
        if (!trDate || !inDateRange(trDate)) continue;
        if (!ti.stock_item_id) continue;
        const calc = map.get(ti.stock_item_id);
        if (!calc) continue;
        const qty = Number(ti.quantity);

        const selectedLocationId = branchFilter !== "all" ? branchFilter : warehouseFilter !== "all" ? warehouseFilter : null;

        if (selectedLocationId) {
          // Source matches → outgoing (filter by source department if dept filter active)
          if (trSource === selectedLocationId) {
            if (departmentFilter === "all" || trSourceDept === departmentFilter) {
              calc.outQty += qty;
            }
          }
          // Destination matches → incoming (filter by destination department if dept filter active)
          if (trDest === selectedLocationId) {
            if (departmentFilter === "all" || trDestDept === departmentFilter) {
              calc.inQty += qty;
            }
          }
        } else {
          // No location filter: internal transfers, no net change
        }
      }
    }

    if (stocktakeData) {
      const latestInPeriod = new Map<string, { qty: number; date: string }>();
      for (const si of stocktakeData) {
        const stDate = (si as any).stocktakes?.date;
        const brId = (si as any).stocktakes?.branch_id;
        const whId = (si as any).stocktakes?.warehouse_id;
        if (!stDate || !inDateRange(stDate)) continue;
        if (branchFilter !== "all" && brId !== branchFilter) continue;
        if (warehouseFilter !== "all" && whId !== warehouseFilter) continue;
        if (!si.stock_item_id) continue;
        const existing = latestInPeriod.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          latestInPeriod.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
        }
      }
      for (const [itemId, data] of latestInPeriod) {
        const calc = map.get(itemId);
        if (calc) {
          calc.countQty = data.qty;
        }
      }
    }

    for (const calc of map.values()) {
      calc.inVal = calc.inQty * calc.avgCost;
      calc.outVal = calc.outQty * calc.avgCost;
      calc.bookQty = calc.openQty + calc.inQty - calc.outQty;
      calc.bookVal = calc.bookQty * calc.avgCost;
      calc.countVal = calc.countQty * calc.avgCost;
      calc.varQty = calc.countQty - calc.bookQty;
      calc.varVal = calc.varQty * calc.avgCost;
    }

    return map;
  }, [stockItems, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, dateFrom, dateTo, branchFilter, warehouseFilter, categoryFilter, departmentFilter, getCost, itemAllCategories]);

  // Grouped data by category — an item can appear in multiple categories
  const grouped = useMemo(() => {
    if (!stockItems) return [];
    const map = new Map<string, { catName: string; catId: string; items: ItemCalc[] }>();
    const catNameById = new Map<string, string>();
    (categories || []).forEach((c: any) => catNameById.set(c.id, c.name));

    for (const item of stockItems) {
      const calc = calcData.get(item.id);
      if (!calc) continue;

      // Collect all categories: primary + additional links
      const allCats = itemAllCategories.get(item.id);
      const catIds: string[] = allCats && allCats.size > 0 ? Array.from(allCats) : ["uncategorized"];

      for (const catId of catIds) {
        const catName =
          catId === "uncategorized"
            ? "بدون مجموعة"
            : catNameById.get(catId) || (item as any).inventory_categories?.name || "بدون مجموعة";
        if (!map.has(catId)) map.set(catId, { catName, catId, items: [] });
        map.get(catId)!.items.push(calc);
      }
    }

    return Array.from(map.values());
  }, [stockItems, calcData, itemAllCategories, categories]);

  const catTotals = (items: ItemCalc[]) => {
    const t = { openQty: 0, openVal: 0, inQty: 0, inVal: 0, outQty: 0, outVal: 0, bookQty: 0, bookVal: 0, countQty: 0, countVal: 0, varQty: 0, varVal: 0 };
    for (const i of items) {
      t.openQty += i.openQty; t.openVal += i.openVal;
      t.inQty += i.inQty; t.inVal += i.inVal;
      t.outQty += i.outQty; t.outVal += i.outVal;
      t.bookQty += i.bookQty; t.bookVal += i.bookVal;
      t.countQty += i.countQty; t.countVal += i.countVal;
      t.varQty += i.varQty; t.varVal += i.varVal;
    }
    return t;
  };

  const grandTotals = useMemo(() => {
    const t = { openQty: 0, openVal: 0, inQty: 0, inVal: 0, outQty: 0, outVal: 0, bookQty: 0, bookVal: 0, countQty: 0, countVal: 0, varQty: 0, varVal: 0 };
    for (const g of grouped) {
      const ct = catTotals(g.items);
      t.openQty += ct.openQty; t.openVal += ct.openVal;
      t.inQty += ct.inQty; t.inVal += ct.inVal;
      t.outQty += ct.outQty; t.outVal += ct.outVal;
      t.bookQty += ct.bookQty; t.bookVal += ct.bookVal;
      t.countQty += ct.countQty; t.countVal += ct.countVal;
      t.varQty += ct.varQty; t.varVal += ct.varVal;
    }
    return t;
  }, [grouped]);

  // Chart data - filtered by chart dialog filters
  const chartFilteredData = useMemo(() => {
    // If a specific item is selected
    if (chartItemFilter !== "all") {
      const item = calcData.get(chartItemFilter);
      if (!item) return [];
      return [
        { name: "أول المدة", كمية: item.openQty, قيمة: item.openVal },
        { name: "الوارد", كمية: item.inQty, قيمة: item.inVal },
        { name: "المنصرف", كمية: item.outQty, قيمة: item.outVal },
        { name: "الدفتري", كمية: item.bookQty, قيمة: item.bookVal },
        { name: "الفعلي", كمية: item.countQty, قيمة: item.countVal },
        { name: "التباين", كمية: item.varQty, قيمة: item.varVal },
      ];
    }

    // If a specific category is selected
    if (chartCategoryFilter !== "all") {
      const group = grouped.find(g => g.catId === chartCategoryFilter);
      if (!group) return [];
      const ct = catTotals(group.items);
      return [
        { name: "أول المدة", كمية: ct.openQty, قيمة: ct.openVal },
        { name: "الوارد", كمية: ct.inQty, قيمة: ct.inVal },
        { name: "المنصرف", كمية: ct.outQty, قيمة: ct.outVal },
        { name: "الدفتري", كمية: ct.bookQty, قيمة: ct.bookVal },
        { name: "الفعلي", كمية: ct.countQty, قيمة: ct.countVal },
        { name: "التباين", كمية: ct.varQty, قيمة: ct.varVal },
      ];
    }

    // All data (grand totals)
    return [
      { name: "أول المدة", كمية: grandTotals.openQty, قيمة: grandTotals.openVal },
      { name: "الوارد", كمية: grandTotals.inQty, قيمة: grandTotals.inVal },
      { name: "المنصرف", كمية: grandTotals.outQty, قيمة: grandTotals.outVal },
      { name: "الدفتري", كمية: grandTotals.bookQty, قيمة: grandTotals.bookVal },
      { name: "الفعلي", كمية: grandTotals.countQty, قيمة: grandTotals.countVal },
      { name: "التباين", كمية: grandTotals.varQty, قيمة: grandTotals.varVal },
    ];
  }, [chartCategoryFilter, chartItemFilter, grandTotals, grouped, calcData]);

  // Pie chart data
  const pieData = useMemo(() => {
    return chartFilteredData.filter(d => d.name !== "التباين" && d.قيمة > 0).map((d, i) => ({
      name: d.name,
      value: Math.abs(d.قيمة),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [chartFilteredData]);

  // Items in currently selected chart category
  const chartCategoryItems = useMemo(() => {
    if (chartCategoryFilter === "all") {
      return Array.from(calcData.values());
    }
    const group = grouped.find(g => g.catId === chartCategoryFilter);
    return group?.items || [];
  }, [chartCategoryFilter, grouped, calcData]);

  const fmtNum = (n: number) => Number(n.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (n: number) => Number(n.toFixed(3)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const exportColumns = [
    { key: "code", label: "كود الصنف" },
    { key: "name", label: "اسم الصنف" },
    { key: "unit", label: "الوحدة" },
    { key: "openQty", label: "كمية" },
    { key: "openVal", label: "قيمة" },
    { key: "inQty", label: "كمية" },
    { key: "inVal", label: "قيمة" },
    { key: "outQty", label: "كمية" },
    { key: "outVal", label: "قيمة" },
    { key: "bookQty", label: "كمية" },
    { key: "bookVal", label: "قيمة" },
    { key: "countQty", label: "كمية" },
    { key: "countVal", label: "قيمة" },
    { key: "varQty", label: "كمية" },
    { key: "varVal", label: "قيمة" },
  ];

  const exportHeaderGroups = [
    { label: "كود الصنف", colSpan: 1 },
    { label: "اسم الصنف", colSpan: 1 },
    { label: "الوحدة", colSpan: 1 },
    { label: "جرد أول المدة", colSpan: 2 },
    { label: "الوارد", colSpan: 2 },
    { label: "المنصرف", colSpan: 2 },
    { label: "الرصيد الدفتري", colSpan: 2 },
    { label: "الجرد الفعلي", colSpan: 2 },
    { label: "التباين", colSpan: 2 },
  ];

  const exportData = useMemo(() => {
    const rows: Record<string, any>[] = [];
    for (const g of grouped) {
      for (const item of g.items) {
        rows.push({
          code: item.code || "—",
          name: item.name,
          unit: item.unit,
          openQty: fmtQty(item.openQty),
          openVal: fmtNum(item.openVal),
          inQty: fmtQty(item.inQty),
          inVal: fmtNum(item.inVal),
          outQty: fmtQty(item.outQty),
          outVal: fmtNum(item.outVal),
          bookQty: fmtQty(item.bookQty),
          bookVal: fmtNum(item.bookVal),
          countQty: fmtQty(item.countQty),
          countVal: fmtNum(item.countVal),
          varQty: fmtQty(item.varQty),
          varVal: fmtNum(item.varVal),
        });
      }
      // Group total row
      const ct = catTotals(g.items);
      rows.push({
        __rowType: "group-total",
        code: "",
        name: `إجمالي: ${g.catName}`,
        unit: "",
        openQty: "",
        openVal: fmtNum(ct.openVal),
        inQty: "",
        inVal: fmtNum(ct.inVal),
        outQty: "",
        outVal: fmtNum(ct.outVal),
        bookQty: "",
        bookVal: fmtNum(ct.bookVal),
        countQty: "",
        countVal: fmtNum(ct.countVal),
        varQty: "",
        varVal: fmtNum(ct.varVal),
      });
    }
    // Grand total row
    rows.push({
      __rowType: "grand-total",
      code: "",
      name: "الإجمالي العام",
      unit: "",
      openQty: "",
      openVal: fmtNum(grandTotals.openVal),
      inQty: "",
      inVal: fmtNum(grandTotals.inVal),
      outQty: "",
      outVal: fmtNum(grandTotals.outVal),
      bookQty: "",
      bookVal: fmtNum(grandTotals.bookVal),
      countQty: "",
      countVal: fmtNum(grandTotals.countVal),
      varQty: "",
      varVal: fmtNum(grandTotals.varVal),
    });
    return rows;
  }, [grouped, grandTotals]);

  const handleExportExcel = async () => {
    try {
      await exportToExcel({ title: "تحليل التكاليف", filename: "تحليل_التكاليف", columns: exportColumns, data: exportData, headerGroups: exportHeaderGroups });
      toast.success("تم تصدير الملف بنجاح");
    } catch (e) { console.error(e); toast.error("حدث خطأ أثناء التصدير"); }
  };
  const handleExportPdf = async () => {
    try {
      await exportToPDF({ title: "تحليل التكاليف", filename: "تحليل_التكاليف", columns: exportColumns, data: exportData, headerGroups: exportHeaderGroups });
      toast.success("تم تصدير الملف بنجاح");
    } catch (e) { console.error(e); toast.error("حدث خطأ أثناء التصدير"); }
  };

  const handlePrint = () => {
    if (exportData.length === 0) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const periodLabel = dateFrom && dateTo
      ? `من ${format(dateFrom, "yyyy-MM-dd")} إلى ${format(dateTo, "yyyy-MM-dd")}`
      : dateFrom ? `من ${format(dateFrom, "yyyy-MM-dd")}` : dateTo ? `حتى ${format(dateTo, "yyyy-MM-dd")}` : "";
    const locationLabel = locationFilter !== "all"
      ? (locationType === "branch"
        ? branches?.find(b => b.id === locationFilter)?.name
        : warehouses?.find(w => w.id === locationFilter)?.name) || ""
      : "";
    const deptLabel = departmentFilter !== "all" ? departments?.find(d => d.id === departmentFilter)?.name || "" : "";
    const catLabel = categoryFilter !== "all" ? categories?.find(c => c.id === categoryFilter)?.name || "" : "";
    const filterParts = [locationLabel, deptLabel, catLabel, periodLabel].filter(Boolean);
    const filterLine = filterParts.length > 0 ? filterParts.join(" • ") : "";

    // Build header row with groups
    let theadHTML = "<tr>";
    for (const grp of exportHeaderGroups) {
      theadHTML += `<th colspan="${grp.colSpan}" style="border:1px solid #000;padding:6px 8px;font-size:11px;text-align:center;background:#eee;font-weight:bold;">${grp.label}</th>`;
    }
    theadHTML += "</tr><tr>";
    for (const col of exportColumns) {
      theadHTML += `<th style="border:1px solid #000;padding:4px 6px;font-size:9px;text-align:center;white-space:nowrap;">${col.label}</th>`;
    }
    theadHTML += "</tr>";

    // Build body
    let tbodyHTML = "";
    exportData.forEach((row) => {
      const rowType = row.__rowType as string | undefined;
      const isTotal = rowType === "grand-total" || rowType === "group-total";
      const bg = rowType === "grand-total" ? "background:#ddd;" : rowType === "group-total" ? "background:#f0f0f0;" : "";
      tbodyHTML += "<tr>";
      for (const col of exportColumns) {
        const val = row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : "—";
        tbodyHTML += `<td style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;${isTotal ? "font-weight:bold;" : ""}${bg}">${val}</td>`;
      }
      tbodyHTML += "</tr>";
    });

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تحليل التكاليف</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:15px; color:#000; background:#fff; }
    @media print { @page { size:landscape; margin:8mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:12px; border-bottom:1px solid #000; padding-bottom:8px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:70px; height:70px; object-fit:contain; }
    .header h1 { font-size:16px; font-weight:bold; margin-bottom:2px; }
    .header p { font-size:10px; color:#333; }
    .filter-info { text-align:center; font-size:10px; color:#333; margin-bottom:8px; }
    table { width:100%; border-collapse:collapse; }
    .footer { text-align:center; margin-top:12px; font-size:8px; color:#000; border-top:1px solid #000; padding-top:6px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>تحليل التكاليف</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  ${filterLine ? `<div class="filter-info">${filterLine}</div>` : ""}
  <table><thead>${theadHTML}</thead><tbody>${tbodyHTML}</tbody></table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}window.print();window.onafterprint=function(){window.close();};})();
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };
  const hasFilters = dateFrom || dateTo || locationFilter !== "all" || categoryFilter !== "all" || departmentFilter !== "all";

  const VarianceArrow = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="h-3 w-3 inline ml-1 text-emerald-500 animate-bounce" />;
    if (value < 0) return <TrendingDown className="h-3 w-3 inline ml-1 text-destructive animate-bounce" />;
    return <Minus className="h-3 w-3 inline ml-1 text-muted-foreground" />;
  };

  const chartTypeOptions: { value: ChartType; label: string }[] = [
    { value: "bar", label: "أعمدة" },
    { value: "area", label: "مساحة" },
    { value: "line", label: "خطي" },
    { value: "pie", label: "دائري" },
    { value: "radar", label: "رادار" },
  ];

  const renderChart = (dataKey: "كمية" | "قيمة", title: string) => {
    const data = chartFilteredData;
    switch (selectedChartType) {
      case "pie":
        return (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{title}</h3>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <Pie data={data.filter(d => Math.abs(d[dataKey]) > 0).map((d, i) => ({ name: d.name, value: Math.abs(d[dataKey]), fill: CHART_COLORS[i % CHART_COLORS.length] }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case "radar":
        return (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{title}</h3>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Radar name={dataKey} dataKey={dataKey} stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case "area":
        return (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{title}</h3>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickMargin={10} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} tickMargin={10} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Area type="monotone" dataKey={dataKey} stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case "line":
        return (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{title}</h3>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickMargin={10} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} tickMargin={10} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Line type="monotone" dataKey={dataKey} stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ fill: CHART_COLORS[4], r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      default: // bar
        return (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{title}</h3>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickMargin={10} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} tickMargin={10} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground">تحليل التكاليف</h1>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCharts(true)}>
          <BarChart3 className="h-4 w-4" />
          التفاصيل البيانية
        </Button>
      </div>

      {/* Cost alerts banner */}
      <CostAlertsCard threshold={15} />

      {/* Filters */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Location type toggle */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/40">
            <Button
              variant={locationType === "branch" ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => { setLocationType("branch"); setLocationFilter("all"); }}
            >
              <Store className="h-3.5 w-3.5 ml-1" />
              فرع
            </Button>
            <Button
              variant={locationType === "warehouse" ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => { setLocationType("warehouse"); setLocationFilter("all"); }}
            >
              <Warehouse className="h-3.5 w-3.5 ml-1" />
              مخزن
            </Button>
          </div>

          <div className="min-w-[170px]">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="glass-input h-9 text-sm">
                {locationType === "branch" ? <Store className="h-4 w-4 ml-1 text-muted-foreground" /> : <Warehouse className="h-4 w-4 ml-1 text-muted-foreground" />}
                <SelectValue placeholder={locationType === "branch" ? "كل الفروع" : "كل المخازن"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{locationType === "branch" ? "كل الفروع" : "كل المخازن"}</SelectItem>
                {locationType === "branch"
                  ? branches?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                  : warehouses?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                }
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[170px]">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="glass-input h-9 text-sm">
                <Building2 className="h-4 w-4 ml-1 text-muted-foreground" />
                <SelectValue placeholder="كل الأقسام" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[170px]">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="glass-input h-9 text-sm">
                <Layers className="h-4 w-4 ml-1 text-muted-foreground" />
                <SelectValue placeholder="كل المجموعات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("glass-input h-9 text-sm min-w-[150px] justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 ml-1" />
                {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("glass-input h-9 text-sm min-w-[150px] justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 ml-1" />
                {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setLocationFilter("all"); setDepartmentFilter("all"); setCategoryFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              مسح الفلاتر
            </Button>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" className="glass-input" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-1" />
            طباعة
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="glass-input">
                <Download className="h-4 w-4 ml-1" />
                تصدير
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                <FileText className="h-4 w-4 ml-2" />
                تصدير PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead rowSpan={2} className="text-center border-l border-border/30 bg-muted/30 font-bold min-w-[90px]">كود الصنف</TableHead>
                <TableHead rowSpan={2} className="text-center border-l border-border/30 bg-muted/30 font-bold min-w-[160px]">اسم الصنف</TableHead>
                <TableHead rowSpan={2} className="text-center border-l border-border/30 bg-muted/30 font-bold min-w-[80px]">الوحدة</TableHead>
                <TableHead colSpan={2} className="text-center border-l border-border/30 bg-primary/10 font-bold text-primary">جرد أول المدة</TableHead>
                <TableHead colSpan={2} className="text-center border-l border-border/30 bg-emerald-500/10 font-bold text-emerald-600">الوارد</TableHead>
                <TableHead colSpan={2} className="text-center border-l border-border/30 bg-amber-500/10 font-bold text-amber-600">المنصرف</TableHead>
                <TableHead colSpan={2} className="text-center border-l border-border/30 bg-sky-500/10 font-bold text-sky-600">الرصيد الدفتري</TableHead>
                <TableHead colSpan={2} className="text-center border-l border-border/30 bg-violet-500/10 font-bold text-violet-600">الجرد الفعلي</TableHead>
                <TableHead colSpan={2} className="text-center bg-destructive/10 font-bold text-destructive">التباين</TableHead>
              </TableRow>
              <TableRow className="border-b border-border/50">
                <TableHead className="text-center border-l border-border/30 bg-primary/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-primary/5 text-xs min-w-[90px]">قيمة</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-emerald-500/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-emerald-500/5 text-xs min-w-[90px]">قيمة</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-amber-500/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-amber-500/5 text-xs min-w-[90px]">قيمة</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-sky-500/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-sky-500/5 text-xs min-w-[90px]">قيمة</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-violet-500/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-violet-500/5 text-xs min-w-[90px]">قيمة</TableHead>
                <TableHead className="text-center border-l border-border/30 bg-destructive/5 text-xs min-w-[80px]">كمية</TableHead>
                <TableHead className="text-center bg-destructive/5 text-xs min-w-[90px]">قيمة</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {grouped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={15} className="text-center py-12 text-muted-foreground">لا توجد بيانات</TableCell>
                </TableRow>
              )}

              {grouped.map((group) => {
                const ct = catTotals(group.items);
                return (
                  <React.Fragment key={group.catName}>
                    {group.items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/20">
                        <TableCell className="text-center border-l border-border/20 text-xs text-muted-foreground">{item.code || "—"}</TableCell>
                        <TableCell className="text-center border-l border-border/20 text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-center border-l border-border/20 text-xs text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-primary/[0.04] text-sm">{fmtQty(item.openQty)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-primary/[0.04] text-sm">{fmtNum(item.openVal)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-emerald-500/[0.04] text-sm">{fmtQty(item.inQty)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-emerald-500/[0.04] text-sm">{fmtNum(item.inVal)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-amber-500/[0.04] text-sm">{fmtQty(item.outQty)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-amber-500/[0.04] text-sm">{fmtNum(item.outVal)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-sky-500/[0.04] text-sm">{fmtQty(item.bookQty)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-sky-500/[0.04] text-sm">{fmtNum(item.bookVal)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-violet-500/[0.04] text-sm">{fmtQty(item.countQty)}</TableCell>
                        <TableCell className="text-center border-l border-border/20 bg-violet-500/[0.04] text-sm">{fmtNum(item.countVal)}</TableCell>
                        <TableCell className={cn("text-center border-l border-border/20 bg-destructive/[0.04] text-sm font-semibold", item.varQty < 0 && "text-destructive")}>
                          {fmtQty(item.varQty)} <VarianceArrow value={item.varQty} />
                        </TableCell>
                        <TableCell className={cn("text-center bg-destructive/[0.04] text-sm font-semibold", item.varVal < 0 && "text-destructive")}>
                          {fmtNum(item.varVal)}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-b-2 border-border/40">
                      <TableCell colSpan={3} className="font-bold text-sm text-primary py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          إجمالي: {group.catName}
                        </div>
                      </TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-primary/10 font-semibold text-sm"></TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-primary/10 font-semibold text-sm">{fmtNum(ct.openVal)}</TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-emerald-500/10 font-semibold text-sm"></TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-emerald-500/10 font-semibold text-sm">{fmtNum(ct.inVal)}</TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-amber-500/10 font-semibold text-sm"></TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-amber-500/10 font-semibold text-sm">{fmtNum(ct.outVal)}</TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-sky-500/10 font-semibold text-sm"></TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-sky-500/10 font-semibold text-sm">{fmtNum(ct.bookVal)}</TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-violet-500/10 font-semibold text-sm"></TableCell>
                      <TableCell className="text-center border-l border-border/30 bg-violet-500/10 font-semibold text-sm">{fmtNum(ct.countVal)}</TableCell>
                      <TableCell className={cn("text-center border-l border-border/30 bg-destructive/10 font-semibold text-sm", ct.varQty < 0 && "text-destructive")}></TableCell>
                      <TableCell className={cn("text-center bg-destructive/10 font-semibold text-sm", ct.varVal < 0 && "text-destructive")}>{fmtNum(ct.varVal)}</TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>

            {grouped.length > 0 && (
              <TableFooter>
                <TableRow className="bg-muted/60 font-bold text-sm">
                  <TableCell colSpan={3} className="text-center py-3 text-foreground font-black">الإجمالي العام</TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-primary/15"></TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-primary/15">{fmtNum(grandTotals.openVal)}</TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-emerald-500/15"></TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-emerald-500/15">{fmtNum(grandTotals.inVal)}</TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-amber-500/15"></TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-amber-500/15">{fmtNum(grandTotals.outVal)}</TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-sky-500/15"></TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-sky-500/15">{fmtNum(grandTotals.bookVal)}</TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-violet-500/15"></TableCell>
                  <TableCell className="text-center border-l border-border/30 bg-violet-500/15">{fmtNum(grandTotals.countVal)}</TableCell>
                  <TableCell className={cn("text-center border-l border-border/30 bg-destructive/15", grandTotals.varQty < 0 && "text-destructive")}></TableCell>
                  <TableCell className={cn("text-center bg-destructive/15", grandTotals.varVal < 0 && "text-destructive")}>{fmtNum(grandTotals.varVal)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      {/* Charts Dialog */}
      <Dialog open={showCharts} onOpenChange={setShowCharts}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">التفاصيل البيانية لتحليل التكاليف</DialogTitle>
          </DialogHeader>

          {/* Chart Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-2 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="min-w-[160px]">
              <Select value={chartCategoryFilter} onValueChange={(v) => { setChartCategoryFilter(v); setChartItemFilter("all"); }}>
                <SelectTrigger className="h-8 text-sm">
                  <Layers className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                  <SelectValue placeholder="كل المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {grouped.map((g) => <SelectItem key={g.catId} value={g.catId}>{g.catName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select value={chartItemFilter} onValueChange={setChartItemFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="كل الخامات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الخامات</SelectItem>
                  {chartCategoryItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            {/* Chart type selector */}
            <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 border border-border/40">
              {chartTypeOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={selectedChartType === opt.value ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-7 text-xs px-2.5", selectedChartType === opt.value && "shadow-sm")}
                  onClick={() => setSelectedChartType(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-8 mt-2">
            {/* Quantities Chart */}
            {renderChart("كمية", "مقارنة الكميات")}

            {/* Values Chart */}
            {renderChart("قيمة", "مقارنة القيم المالية")}

            {/* Variance Analysis */}
            <div className="glass-card rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">تحليل التباين</h3>
              <div className="grid grid-cols-3 gap-4">
                {(() => {
                  const src = chartItemFilter !== "all"
                    ? calcData.get(chartItemFilter)
                    : chartCategoryFilter !== "all"
                      ? (() => { const g = grouped.find(x => x.catId === chartCategoryFilter); return g ? catTotals(g.items) : grandTotals; })()
                      : grandTotals;
                  const varQ = src ? ('varQty' in src ? src.varQty : 0) : 0;
                  const varV = src ? ('varVal' in src ? src.varVal : 0) : 0;
                  return (
                    <>
                      <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                        <div className="text-2xl font-bold text-emerald-600">
                          {varQ > 0 ? fmtQty(varQ) : "0"}
                          <TrendingUp className="h-5 w-5 inline ml-1 animate-bounce" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">فائض</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-destructive/10">
                        <div className="text-2xl font-bold text-destructive">
                          {varQ < 0 ? fmtQty(Math.abs(varQ)) : "0"}
                          <TrendingDown className="h-5 w-5 inline ml-1 animate-bounce" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">عجز</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/40">
                        <div className="text-2xl font-bold text-foreground">
                          {varQ === 0 ? "✓" : fmtNum(varV)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {varQ === 0 ? "لا يوجد تباين" : "قيمة التباين"}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
