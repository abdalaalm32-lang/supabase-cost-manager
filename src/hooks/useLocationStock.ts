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
  departmentId?: string | null
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
        .eq("purchase_orders.company_id", companyId!)
        .eq("purchase_orders.status", "مكتمل");
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
        .select("product_id, produced_qty, branch_id, warehouse_id, department_id")
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
        .select("stock_item_id, required_qty, production_records!inner(id, status, branch_id, warehouse_id, department_id, company_id)")
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
        .select("stock_item_id, quantity, transfers!inner(id, status, source_id, destination_id, source_department_id, destination_department_id, company_id)")
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
        .select("stock_item_id, quantity, waste_records!inner(id, status, branch_id, warehouse_id, company_id, department_id)")
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
        .select("pos_item_id, quantity, pos_sales!inner(id, status, branch_id, company_id)")
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

    const map = new Map<string, number>();
    const add = (id: string | null, qty: number) => {
      if (!id) return;
      map.set(id, (map.get(id) || 0) + qty);
    };
    const sub = (id: string | null, qty: number) => {
      if (!id) return;
      map.set(id, (map.get(id) || 0) - qty);
    };

    const match = (branchId: string | null, warehouseId: string | null) => {
      if (locationType === "branch") return branchId === locationId;
      return warehouseId === locationId;
    };

    // Purchases IN (filter by department if departmentId is provided)
    for (const pi of purchaseItems) {
      const po = pi.purchase_orders;
      if (match(po.branch_id, po.warehouse_id)) {
        if (departmentId && po.department_id !== departmentId) continue;
        add(pi.stock_item_id, Number(pi.quantity));
      }
    }

    // Production produced IN (filter by department if departmentId is provided)
    for (const pr of productionRecords) {
      if (match(pr.branch_id, pr.warehouse_id)) {
        if (departmentId && pr.department_id !== departmentId) continue;
        add(pr.product_id, Number(pr.produced_qty));
      }
    }

    // Production ingredients OUT (filter by department if departmentId is provided)
    for (const ing of productionIngredients) {
      const pr = ing.production_records;
      if (match(pr.branch_id, pr.warehouse_id)) {
        if (departmentId && pr.department_id !== departmentId) continue;
        sub(ing.stock_item_id, Number(ing.required_qty));
      }
    }

    // Transfers (with department filtering)
    for (const ti of transferItems) {
      const t = ti.transfers;
      if (t.source_id === locationId) {
        // Only subtract if departmentId matches source_department_id (or no department filter)
        if (!departmentId || t.source_department_id === departmentId) {
          sub(ti.stock_item_id, Number(ti.quantity));
        }
      }
      if (t.destination_id === locationId) {
        // Only add if departmentId matches destination_department_id (or no department filter)
        if (!departmentId || t.destination_department_id === departmentId) {
          add(ti.stock_item_id, Number(ti.quantity));
        }
      }
    }

    // Waste OUT (filter by department if departmentId is provided)
    for (const wi of wasteItems) {
      const wr = wi.waste_records;
      if (match(wr.branch_id, wr.warehouse_id)) {
        if (departmentId && wr.department_id !== departmentId) continue;
        sub(wi.stock_item_id, Number(wi.quantity));
      }
    }

    // POS Sales OUT (via recipes) - only for branches
    // Recipe quantities are in recipe_unit (grams/ml), must convert to stock_unit using conversion_factor
    if (locationType === "branch") {
      // Build conversion factor map: stock_item_id -> conversion_factor
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
        if (sale.branch_id === locationId) {
          const ings = recipeMap.get(si.pos_item_id);
          if (ings) {
            for (const ing of ings) {
              // Convert recipe qty (grams/ml/pieces) to stock unit (kg/liters) by dividing by conversion_factor
              const convFactor = conversionMap.get(ing.stock_item_id) || 1;
              const qtyInStockUnit = (ing.qty / convFactor) * Number(si.quantity);
              sub(ing.stock_item_id, qtyInStockUnit);
            }
          }
        }
      }
    }

    // Stocktake adjustments (counted_qty - book_qty for this location, filtered by department)
    for (const st of stocktakes) {
      if (match(st.branch_id, st.warehouse_id)) {
        if (departmentId && st.department_id !== departmentId) continue;
        for (const si of (st.stocktake_items || [])) {
          if (si.stock_item_id) {
            const adjustment = Number(si.counted_qty) - Number(si.book_qty || 0);
            if (adjustment !== 0) {
              add(si.stock_item_id, adjustment);
            }
          }
        }
      }
    }

    return map;
  }, [locationId, locationType, departmentId, purchaseItems, productionRecords, productionIngredients, transferItems, wasteItems, posSaleItems, recipes, stocktakes, stockItemsData]);

  const getLocationStock = (stockItemId: string): number => {
    return stockMap.get(stockItemId) || 0;
  };

  // Production-specific available balance: opening-period stocktake counted_qty + purchases AFTER that opening date.
  // Uses the EARLIEST completed stocktake per item as "جرد أول المدة" baseline,
  // then adds only purchases dated on/after that opening date.
  // Does NOT subtract production/waste/transfers/POS and ignores later stocktake adjustments.
  const productionAvailableMap = useMemo(() => {
    if (!locationId) return new Map<string, number>();
    const map = new Map<string, number>();

    // Opening stock = EARLIEST completed stocktake per item at this location.
    // Prefer records of type "جرد أول المدة" if present; otherwise fall back to the oldest record.
    const opening = new Map<string, { qty: number; date: string; isOpening: boolean }>();
    for (const st of stocktakes) {
      if (locationType === "branch" ? st.branch_id !== locationId : st.warehouse_id !== locationId) continue;
      if (departmentId && st.department_id && st.department_id !== departmentId) continue;
      const stDate = st.date || st.created_at || "";
      const isOpening = st.type === "جرد أول المدة";
      for (const si of (st.stocktake_items || [])) {
        if (!si.stock_item_id) continue;
        const existing = opening.get(si.stock_item_id);
        const shouldReplace =
          !existing ||
          (isOpening && !existing.isOpening) ||
          (isOpening === existing.isOpening && stDate < existing.date);
        if (shouldReplace) {
          opening.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate, isOpening });
        }
      }
    }
    for (const [id, v] of opening) {
      map.set(id, (map.get(id) || 0) + v.qty);
    }

    // Add purchases IN dated on/after the opening stocktake date for that item.
    // For items without an opening stocktake, include all purchases.
    for (const pi of purchaseItems) {
      const po = pi.purchase_orders;
      if (locationType === "branch" ? po.branch_id !== locationId : po.warehouse_id !== locationId) continue;
      if (departmentId && po.department_id !== departmentId) continue;
      if (!pi.stock_item_id) continue;
      const op = opening.get(pi.stock_item_id);
      const poDate = (po as any).date || "";
      if (op && poDate && poDate < op.date) continue;
      map.set(pi.stock_item_id, (map.get(pi.stock_item_id) || 0) + Number(pi.quantity));
    }

    return map;
  }, [locationId, locationType, departmentId, stocktakes, purchaseItems]);

  const getProductionAvailable = (stockItemId: string): number => {
    return productionAvailableMap.get(stockItemId) || 0;
  };

  return { stockMap, getLocationStock, getProductionAvailable };
}
