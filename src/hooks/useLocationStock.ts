import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Calculates per-location stock for a specific branch or warehouse
 * by aggregating all completed transactions (purchases, production, waste, transfers, POS sales).
 * Returns a Map<stock_item_id, quantity>.
 */
export function useLocationStock(
  locationId: string | null | undefined,
  locationType: "branch" | "warehouse",
  departmentId?: string | null,
  asOfDate?: string | null,
) {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const enabled = !!companyId && !!locationId;

  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["loc-stock-purchases", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("stock_item_id, quantity, purchase_orders!inner(id, status, date, branch_id, warehouse_id, company_id, department_id)")
        .eq("purchase_orders.company_id", companyId!);
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: productionRecords = [] } = useQuery({
    queryKey: ["loc-stock-production-records", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("product_id, produced_qty, branch_id, warehouse_id, department_id, date, created_at")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: productionIngredients = [] } = useQuery({
    queryKey: ["loc-stock-production-ingredients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_ingredients")
        .select("stock_item_id, required_qty, production_records!inner(id, status, branch_id, warehouse_id, department_id, company_id, date, created_at)")
        .eq("production_records.company_id", companyId!)
        .eq("production_records.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: transferItems = [] } = useQuery({
    queryKey: ["loc-stock-transfers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items")
        .select("stock_item_id, quantity, transfers!inner(id, status, source_id, destination_id, source_department_id, destination_department_id, company_id, date, created_at)")
        .eq("transfers.company_id", companyId!)
        .eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: wasteItems = [] } = useQuery({
    queryKey: ["loc-stock-waste", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items")
        .select("stock_item_id, quantity, waste_records!inner(id, status, branch_id, warehouse_id, company_id, department_id, date, created_at)")
        .eq("waste_records.company_id", companyId!)
        .eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: posSaleItems = [] } = useQuery({
    queryKey: ["loc-stock-pos-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items")
        .select("pos_item_id, quantity, pos_sales!inner(id, status, branch_id, company_id, date, created_at)")
        .eq("pos_sales.company_id", companyId!)
        .eq("pos_sales.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["loc-stock-recipes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, menu_item_id, recipe_ingredients(stock_item_id, qty)")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  // Fetch stock items to get conversion_factor for unit conversion
  const { data: stockItemsData = [] } = useQuery({
    queryKey: ["loc-stock-items-conversion", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, conversion_factor")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  // Stocktake adjustments - use latest completed stocktake per location
  const { data: stocktakes = [] } = useQuery({
    queryKey: ["loc-stock-stocktakes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktakes")
        .select("id, branch_id, warehouse_id, department_id, date, created_at, type, stocktake_items(stock_item_id, counted_qty, book_qty)")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل")
        .neq("type", "فحص مخزون فوري")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled,
    staleTime: 30000,
  });

  const stockMap = useMemo(() => {
    if (!locationId) return new Map<string, number>();

    // Cutoff (asOfDate end-of-day) used for both stocktake selection AND filtering subsequent movements
    const cutoff = asOfDate ? `${asOfDate}T23:59:59.999Z` : null;
    const inDate = (rec: any): boolean => {
      if (!cutoff) return true;
      const d = (rec?.date as string) || (rec?.created_at as string) || "";
      if (!d) return true;
      return d <= cutoff;
    };

    const match = (branchId: string | null, warehouseId: string | null) => {
      if (locationType === "branch") return branchId === locationId;
      return warehouseId === locationId;
    };

    // ============================================================
    // STEP 1 — Find LATEST stocktake per item at this location
    //          (on/before cutoff). This is the RESET baseline.
    //          Balance = stocktake.counted_qty + movements AFTER stocktake date
    // ============================================================
    const normalizeStocktakeDate = (value: string): string => {
      if (!value) return "";
      // A stocktake date represents the closing balance of that whole day.
      // Normalize date-only values to end-of-day so same-day sales/waste are not deducted again.
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.999Z`;
      return value;
    };

    const baseline = new Map<string, { qty: number; date: string }>();
    for (const st of stocktakes) {
      if (!match(st.branch_id, st.warehouse_id)) continue;
      // A branch/warehouse stocktake with no department is a full location count,
      // so it must still be used as the baseline when viewing a specific department.
      if (departmentId && st.department_id && st.department_id !== departmentId) continue;
      const stDate = normalizeStocktakeDate((st.date as string) || (st.created_at as string) || "");
      if (cutoff && stDate && stDate > cutoff) continue;
      for (const si of (st.stocktake_items || [])) {
        if (!si.stock_item_id) continue;
        const existing = baseline.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          baseline.set(si.stock_item_id, { qty: Number(si.counted_qty) || 0, date: stDate });
        }
      }
    }

    // Helper: a movement is counted ONLY if it happened AFTER this item's stocktake date
    // (or always if the item has no stocktake baseline).
    const afterBaseline = (stockItemId: string | null, recDateRaw: string): boolean => {
      if (!stockItemId) return false;
      const base = baseline.get(stockItemId);
      if (!base) return true; // no stocktake → include all movements
      if (!recDateRaw) return false; // can't determine → safer to skip (avoid double-counting)
      // Compare lexicographically (ISO strings); strict > so same-day records aren't double-counted
      return recDateRaw > base.date;
    };

    const map = new Map<string, number>();
    // Seed with stocktake baselines
    for (const [id, v] of baseline) {
      map.set(id, v.qty);
    }
    const add = (id: string | null, qty: number) => {
      if (!id) return;
      map.set(id, (map.get(id) ?? 0) + qty);
    };
    const sub = (id: string | null, qty: number) => {
      if (!id) return;
      map.set(id, (map.get(id) ?? 0) - qty);
    };
    const recDate = (rec: any): string =>
      (rec?.date as string) || (rec?.created_at as string) || "";

    // ============================================================
    // STEP 2 — Apply only movements AFTER each item's baseline date
    // ============================================================

    // Purchases IN
    for (const pi of purchaseItems) {
      const po = pi.purchase_orders;
      if (po.status !== "مكتمل") continue;
      if (!inDate(po)) continue;
      if (!match(po.branch_id, po.warehouse_id)) continue;
      if (departmentId && po.department_id !== departmentId) continue;
      if (!afterBaseline(pi.stock_item_id, recDate(po))) continue;
      add(pi.stock_item_id, Number(pi.quantity));
    }

    // Production produced IN
    for (const pr of productionRecords) {
      if (!inDate(pr)) continue;
      if (!match(pr.branch_id, pr.warehouse_id)) continue;
      if (departmentId && pr.department_id !== departmentId) continue;
      if (!afterBaseline(pr.product_id, recDate(pr))) continue;
      add(pr.product_id, Number(pr.produced_qty));
    }

    // Production ingredients OUT
    for (const ing of productionIngredients) {
      const pr = ing.production_records;
      if (!inDate(pr)) continue;
      if (!match(pr.branch_id, pr.warehouse_id)) continue;
      if (departmentId && pr.department_id !== departmentId) continue;
      if (!afterBaseline(ing.stock_item_id, recDate(pr))) continue;
      sub(ing.stock_item_id, Number(ing.required_qty));
    }

    // Transfers
    for (const ti of transferItems) {
      const t = ti.transfers;
      if (!inDate(t)) continue;
      const tDate = recDate(t);
      if (t.source_id === locationId) {
        if (!departmentId || t.source_department_id === departmentId) {
          if (afterBaseline(ti.stock_item_id, tDate)) {
            sub(ti.stock_item_id, Number(ti.quantity));
          }
        }
      }
      if (t.destination_id === locationId) {
        if (!departmentId || t.destination_department_id === departmentId) {
          if (afterBaseline(ti.stock_item_id, tDate)) {
            add(ti.stock_item_id, Number(ti.quantity));
          }
        }
      }
    }

    // Waste OUT
    for (const wi of wasteItems) {
      const wr = wi.waste_records;
      if (!inDate(wr)) continue;
      if (!match(wr.branch_id, wr.warehouse_id)) continue;
      if (departmentId && wr.department_id !== departmentId) continue;
      if (!afterBaseline(wi.stock_item_id, recDate(wr))) continue;
      sub(wi.stock_item_id, Number(wi.quantity));
    }

    // POS Sales OUT (via recipes) - only for branches
    if (locationType === "branch") {
      const conversionMap = new Map<string, number>();
      for (const si of stockItemsData) {
        conversionMap.set(si.id, Number(si.conversion_factor) || 1);
      }
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      for (const r of recipes) {
        recipeMap.set(r.menu_item_id, (r.recipe_ingredients || []).map((i: any) => ({
          stock_item_id: i.stock_item_id,
          qty: Number(i.qty),
        })));
      }
      for (const si of posSaleItems) {
        const sale = si.pos_sales;
        if (!inDate(sale)) continue;
        if (sale.branch_id !== locationId) continue;
        const ings = recipeMap.get(si.pos_item_id);
        if (!ings) continue;
        const sDate = recDate(sale);
        for (const ing of ings) {
          if (!afterBaseline(ing.stock_item_id, sDate)) continue;
          const convFactor = conversionMap.get(ing.stock_item_id) || 1;
          const qtyInStockUnit = (ing.qty / convFactor) * Number(si.quantity);
          sub(ing.stock_item_id, qtyInStockUnit);
        }
      }
    }

    return map;
  }, [locationId, locationType, departmentId, asOfDate, purchaseItems, productionRecords, productionIngredients, transferItems, wasteItems, posSaleItems, recipes, stocktakes, stockItemsData]);

  const getLocationStock = (stockItemId: string): number => {
    return stockMap.get(stockItemId) || 0;
  };

  // Production-specific available balance:
  //   baseline = LATEST completed stocktake per item on/before production date (asOfDate),
  //   + ALL purchases at the same location dated AFTER that baseline stocktake (no upper date cutoff).
  // Does NOT subtract production/waste/transfers/POS and ignores stocktake adjustments other than baseline.
  const productionAvailableMap = useMemo(() => {
    if (!locationId) return new Map<string, number>();
    const map = new Map<string, number>();

    // Cutoff (asOfDate) — only used to pick baseline stocktake (latest on/before cutoff).
    // Purchases are NOT capped by cutoff: we include ALL purchases dated after the baseline stocktake.
    const cutoff = asOfDate || null;

    // Baseline = LATEST completed stocktake per item on/before cutoff at this location.
    const baseline = new Map<string, { qty: number; date: string }>();
    for (const st of stocktakes) {
      if (locationType === "branch" ? st.branch_id !== locationId : st.warehouse_id !== locationId) continue;
      if (departmentId && st.department_id && st.department_id !== departmentId) continue;
      const stDate = st.date || st.created_at || "";
      if (cutoff && stDate && stDate > cutoff) continue;
      for (const si of (st.stocktake_items || [])) {
        if (!si.stock_item_id) continue;
        const existing = baseline.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          baseline.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
        }
      }
    }
    for (const [id, v] of baseline) {
      map.set(id, (map.get(id) || 0) + v.qty);
    }

    // Add ALL purchases IN for the same branch/warehouse dated strictly after the baseline
    // stocktake date (no upper cutoff). Department is intentionally not used here because
    // production availability requested by the user is: latest stocktake + all purchases after it.
    // Items without a baseline stocktake include all completed purchases.
    for (const pi of purchaseItems) {
      const po = pi.purchase_orders;
      if (!["مكتمل", "مؤرشف"].includes(po.status)) continue;
      if (locationType === "branch" ? po.branch_id !== locationId : po.warehouse_id !== locationId) continue;
      if (!pi.stock_item_id) continue;
      const poDate = (po as any).date || "";
      const base = baseline.get(pi.stock_item_id);
      if (base && poDate && poDate <= base.date) continue;
      map.set(pi.stock_item_id, (map.get(pi.stock_item_id) || 0) + Number(pi.quantity));
    }

    return map;
  }, [locationId, locationType, departmentId, asOfDate, stocktakes, purchaseItems]);

  const getProductionAvailable = (stockItemId: string): number => {
    return productionAvailableMap.get(stockItemId) || 0;
  };

  return { stockMap, getLocationStock, getProductionAvailable };
}
