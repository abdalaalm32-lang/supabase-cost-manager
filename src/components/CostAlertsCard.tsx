/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CostAlertsCard
 * --------------------------------------------------
 * مكون يعرض تنبيهات لما تكلفة صنف في فرع معين تزيد عن
 * متوسط نفس الصنف في باقي الفروع بنسبة معينة (افتراضي 15%).
 *
 * يعتمد على جدول `stock_item_branch_costs` لمقارنة تكاليف
 * نفس الصنف عبر الفروع المختلفة.
 *
 * Usage:
 *   <CostAlertsCard threshold={15} compact />
 *   <CostAlertsCard threshold={20} />
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, TrendingUp, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CostAlertsCardProps {
  /** نسبة الانحراف عن المتوسط لاعتباره تنبيه (افتراضي: 15%) */
  threshold?: number;
  /** عرض مدمج (للوحة التحكم) */
  compact?: boolean;
  /** أقصى عدد تنبيهات تُعرض في الوضع المدمج */
  maxItems?: number;
}

interface CostAlert {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  branchId: string;
  branchName: string;
  branchCost: number;
  avgOtherBranchesCost: number;
  diffPct: number;
}

export const CostAlertsCard: React.FC<CostAlertsCardProps> = ({
  threshold: initialThreshold = 15,
  compact = false,
  maxItems = 5,
}) => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const [threshold, setThreshold] = useState<number>(initialThreshold);
  const [expanded, setExpanded] = useState(false);

  // Stock items (for names/codes)
  const { data: stockItems = [] } = useQuery({
    queryKey: ["cost-alerts-stock-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("id, name, code")
        .eq("company_id", companyId!);
      return (data as { id: string; name: string; code: string | null }[]) || [];
    },
    enabled: !!companyId,
  });

  // Branches
  const { data: branches = [] } = useQuery({
    queryKey: ["cost-alerts-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("active", true);
      return (data as { id: string; name: string }[]) || [];
    },
    enabled: !!companyId,
  });

  // Per-branch costs
  const { data: branchCosts = [], isLoading } = useQuery({
    queryKey: ["cost-alerts-branch-costs", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, branch_id, avg_cost")
        .eq("company_id", companyId!);
      return (data as { stock_item_id: string; branch_id: string; avg_cost: number }[]) || [];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Compute alerts
  const alerts = useMemo<CostAlert[]>(() => {
    if (branches.length < 2 || !branchCosts.length) return [];

    const itemMap = new Map(stockItems.map((i) => [i.id, i]));
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    // Group costs by stock_item_id
    const byItem = new Map<string, { branch_id: string; avg_cost: number }[]>();
    branchCosts.forEach((bc) => {
      if (!byItem.has(bc.stock_item_id)) byItem.set(bc.stock_item_id, []);
      byItem.get(bc.stock_item_id)!.push({ branch_id: bc.branch_id, avg_cost: Number(bc.avg_cost) });
    });

    const result: CostAlert[] = [];
    byItem.forEach((rows, itemId) => {
      // Need at least 2 branches with costs > 0 to compare
      const validRows = rows.filter((r) => r.avg_cost > 0 && branchMap.has(r.branch_id));
      if (validRows.length < 2) return;

      validRows.forEach((row) => {
        const others = validRows.filter((r) => r.branch_id !== row.branch_id);
        if (others.length === 0) return;
        const avgOthers = others.reduce((s, r) => s + r.avg_cost, 0) / others.length;
        if (avgOthers <= 0) return;
        const diffPct = ((row.avg_cost - avgOthers) / avgOthers) * 100;
        if (diffPct >= threshold) {
          const item = itemMap.get(itemId);
          const branch = branchMap.get(row.branch_id);
          if (!item || !branch) return;
          result.push({
            itemId,
            itemName: item.name,
            itemCode: item.code,
            branchId: row.branch_id,
            branchName: branch.name,
            branchCost: row.avg_cost,
            avgOtherBranchesCost: avgOthers,
            diffPct,
          });
        }
      });
    });

    return result.sort((a, b) => b.diffPct - a.diffPct);
  }, [stockItems, branches, branchCosts, threshold]);

  if (isLoading) return null;

  // Need at least 2 branches to be meaningful
  if (branches.length < 2) return null;

  if (alerts.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-bold">تكاليف الفروع متوازنة</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          لا يوجد فرع تكلفته تزيد عن متوسط الفروع الأخرى بأكثر من {threshold}%
        </p>
      </div>
    );
  }

  const visibleAlerts = compact && !expanded ? alerts.slice(0, maxItems) : alerts;
  const hiddenCount = compact ? alerts.length - maxItems : 0;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-red-500/5 p-4 backdrop-blur-sm" dir="rtl">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">تنبيهات تكاليف الفروع</h3>
            <p className="text-[11px] text-muted-foreground">
              {alerts.length} تنبيه • فروع تكلفتها تزيد عن المتوسط بأكثر من {threshold}%
            </p>
          </div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Settings2 className="h-3 w-3 ml-1" />
              نسبة التنبيه: {threshold}%
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" dir="rtl">
            <div className="space-y-2">
              <label className="text-xs font-medium">حد التنبيه (%)</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                أي فرع تكلفته تزيد عن متوسط باقي الفروع بهذه النسبة سيظهر في التنبيهات
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        {visibleAlerts.map((alert, i) => (
          <div
            key={`${alert.itemId}-${alert.branchId}-${i}`}
            className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-card/60 border border-border/30"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-foreground truncate">{alert.itemName}</span>
                {alert.itemCode && (
                  <Badge variant="outline" className="text-[9px] h-4 font-mono px-1">
                    {alert.itemCode}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-amber-600 dark:text-amber-500 font-semibold">{alert.branchName}</span>
                {" • "}
                <span dir="ltr">{alert.branchCost.toFixed(2)}</span> ج.م
                {" "}vs متوسط الفروع{" "}
                <span dir="ltr">{alert.avgOtherBranchesCost.toFixed(2)}</span> ج.م
              </p>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-bold whitespace-nowrap ${
                alert.diffPct >= 30
                  ? "border-red-500/40 text-red-600 bg-red-500/10"
                  : "border-amber-500/40 text-amber-600 bg-amber-500/10"
              }`}
            >
              +{alert.diffPct.toFixed(1)}%
            </Badge>
          </div>
        ))}
      </div>

      {compact && hiddenCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 ml-1" />
              إخفاء {hiddenCount} تنبيه
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 ml-1" />
              عرض {hiddenCount} تنبيه إضافي
            </>
          )}
        </Button>
      )}
    </div>
  );
};
