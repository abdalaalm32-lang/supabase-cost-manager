import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Receipt, Search, Eye, Truck, Building2, TrendingUp, DollarSign, Warehouse, Download, FileText, FileSpreadsheet, Loader2, Package, Layers,
} from "lucide-react";

import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { Badge } from "@/components/ui/badge";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { toast } from "sonner";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export const SupplyInvoicesToBranchesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-lite", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name, code").eq("company_id", companyId);
      return data ?? [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-lite", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name, code").eq("company_id", companyId);
      return data ?? [];
    },
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["branch-policies-lite", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("branch_supply_policies")
        .select("branch_id, transportation_cost, loading_cost, profit_percentage, is_active")
        .eq("company_id", companyId);
      return data ?? [];
    },
  });

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["supply-transfers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("transfers")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const transferIds = useMemo(
    () => (transfers as any[]).map((t: any) => t.id).filter(Boolean),
    [transfers]
  );

  const { data: transferItems = [] } = useQuery({
    queryKey: ["supply-transfer-items", companyId, transferIds.length, transferIds[0]],
    enabled: !!companyId && transferIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("transfer_items")
        .select("id, transfer_id, quantity, avg_cost, total_cost")
        .in("transfer_id", transferIds);
      return data ?? [];
    },
  });

  const transferItemIds = useMemo(
    () => (transferItems as any[]).map((i: any) => i.id),
    [transferItems]
  );

  const { data: pricingRows = [] } = useQuery({
    queryKey: ["supply-pricing-breakdown", companyId, transferItemIds.length, transferItemIds[0]],
    enabled: !!companyId && transferItemIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("transfer_pricing_breakdown")
        .select("transfer_item_id, base_cost, manufacturing_cost, packaging_cost, transport_cost, loading_cost, profit_amount, final_unit_price")
        .in("transfer_item_id", transferItemIds);
      return data ?? [];
    },
  });


  const warehouseIds = useMemo(() => new Set(warehouses.map((w: any) => w.id)), [warehouses]);
  const branchIds = useMemo(() => new Set(branches.map((b: any) => b.id)), [branches]);
  const policyByBranch = useMemo(() => {
    const m: Record<string, any> = {};
    policies.forEach((p: any) => (m[p.branch_id] = p));
    return m;
  }, [policies]);

  // Per-transfer aggregates: raw (base+production), packing, applied overhead
  const perTransferCosts = useMemo(() => {
    const priceByItem = new Map<string, any>();
    (pricingRows as any[]).forEach((p: any) => priceByItem.set(p.transfer_item_id, p));
    const transferById = new Map<string, any>();
    (transfers as any[]).forEach((t: any) => transferById.set(t.id, t));
    const map = new Map<string, { raw: number; packing: number; overhead: number; loaded: number; hasBreakdown: boolean }>();
    (transferItems as any[]).forEach((it: any) => {
      const p = priceByItem.get(it.id);
      const qty = Number(it.quantity) || 0;
      const cur = map.get(it.transfer_id) || { raw: 0, packing: 0, overhead: 0, loaded: 0, hasBreakdown: false };
      if (p && Number(p.final_unit_price) > 0) {
        const base = Number(p.base_cost ?? 0) * qty;
        const manuf = Number(p.manufacturing_cost ?? 0) * qty;
        const pack = Number(p.packaging_cost ?? 0) * qty;
        const final = Number(p.final_unit_price ?? 0) * qty;
        const profit = Number(p.profit_amount ?? 0) * qty;
        const transport = Number(p.transport_cost ?? 0) * qty;
        const loading = Number(p.loading_cost ?? 0) * qty;
        const loaded = Math.max(final - profit - transport - loading, 0);
        const overhead = Math.max(loaded - base - manuf - pack, 0);
        // Raw = base + production (both captured in WAC as raw material cost)
        cur.raw += base + manuf;
        cur.packing += pack;
        cur.overhead += overhead;
        cur.loaded += loaded;
      } else {
        // No pricing snapshot → transfer_items.total_cost IS the actual cost
        // (avg_cost × qty), not a supply price. Build the loaded cost forward.
        const tr = transferById.get(it.transfer_id);
        const overheadRate = Number(tr?.overhead_rate_applied) || 0;
        const raw = Number(it.total_cost) || (Number(it.avg_cost) || 0) * qty;
        const overhead = raw * (overheadRate / 100);
        cur.raw += raw;
        cur.overhead += overhead;
        cur.loaded += raw + overhead;
      }
      cur.hasBreakdown = true;
      map.set(it.transfer_id, cur);
    });
    return map;
  }, [pricingRows, transferItems, transfers]);




  // supply invoices = warehouse → branch transfers
  const supplyInvoices = useMemo(() => {
    return (transfers as any[])
      .filter((t) => warehouseIds.has(t.source_id) && branchIds.has(t.destination_id))
      .map((t) => {
        const pol = policyByBranch[t.destination_id];
        const active = pol?.is_active !== false;
        // Prefer per-invoice stored fees; fallback to branch policy values.
        const storedTransport = Number(t.transportation_cost ?? 0);
        const storedLoading = Number(t.loading_cost ?? 0);
        const transport = storedTransport > 0
          ? storedTransport
          : (active ? Number(pol?.transportation_cost ?? 0) : 0);
        const loading = storedLoading > 0
          ? storedLoading
          : (active ? Number(pol?.loading_cost ?? 0) : 0);
        const itemsCost = Number(t.total_cost ?? 0);
        const grand = itemsCost + transport + loading;
        return { ...t, transport, loading, itemsCost, grand };
      });
  }, [transfers, warehouseIds, branchIds, policyByBranch]);

  const filtered = useMemo(() => {
    let arr = supplyInvoices;
    if (branchFilter !== "all") arr = arr.filter((t) => t.destination_id === branchFilter);
    if (dateFrom) arr = arr.filter((t) => (t.date || "") >= dateFrom);
    if (dateTo) arr = arr.filter((t) => (t.date || "") <= dateTo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((t) =>
        (t.record_number || "").toLowerCase().includes(q) ||
        (t.source_name || "").toLowerCase().includes(q) ||
        (t.destination_name || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [supplyInvoices, branchFilter, search, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const count = filtered.length;
    const total = filtered.reduce((s, t) => s + t.grand, 0);
    const surcharge = filtered.reduce((s, t) => s + t.transport + t.loading, 0);
    const top = filtered.reduce<any>((best, t) => (!best || t.grand > best.grand ? t : best), null);
    let rawCost = 0, packingCost = 0, overheadCost = 0;
    filtered.forEach((t) => {
      const c = perTransferCosts.get(t.id);
      if (c && c.hasBreakdown) {
        rawCost += c.raw; packingCost += c.packing; overheadCost += c.overhead;
      } else {
        // Fallback matches P&L inference. itemsCost = transfers.total_cost includes profit markup.
        const sales = Number(t.itemsCost) || 0;
        const pol = policyByBranch[t.destination_id];
        const profitPct = Number(pol?.profit_percentage) || 0;
        const overheadRate = Number(t.overhead_rate_applied) || 0;
        const loaded = profitPct > 0 ? sales / (1 + profitPct / 100) : sales;
        const rawPlusPack = overheadRate > 0 ? loaded / (1 + overheadRate / 100) : loaded;
        rawCost += rawPlusPack;
        overheadCost += Math.max(loaded - rawPlusPack, 0);
      }
    });
    return { count, total, surcharge, top, rawCost, packingCost, overheadCost };
  }, [filtered, perTransferCosts]);


  const branchName = branchFilter === "all"
    ? "الكل"
    : branches.find((b: any) => b.id === branchFilter)?.name || "—";

  const exportData = filtered.map((t: any, i: number) => ({
    idx: i + 1,
    record: t.record_number || "—",
    date: t.date || "—",
    from: t.source_name || "—",
    to: t.destination_name || "—",
    itemsCost: fmt(t.itemsCost),
    transport: fmt(t.transport),
    loading: fmt(t.loading),
    grand: fmt(t.grand),
    status: t.is_edited ? "معدَّل" : t.status || "—",
  }));

  const exportColumns = [
    { key: "idx", label: "م" },
    { key: "record", label: "رقم الأذن" },
    { key: "date", label: "التاريخ" },
    { key: "from", label: "المخزن" },
    { key: "to", label: "الفرع" },
    { key: "itemsCost", label: "قيمة الخامات" },
    { key: "transport", label: "تكلفة النقل" },
    { key: "loading", label: "تكلفة التحميل" },
    { key: "grand", label: "الإجمالي" },
    { key: "status", label: "الحالة" },
  ];

  const RowActions: React.FC<{ t: any; rowIndex: number }> = ({ t, rowIndex }) => {
    const navigate = useNavigate();
    const [loadingPdf, setLoadingPdf] = useState(false);
    const [loadingExcel, setLoadingExcel] = useState(false);

    const rowData = useMemo(() => [
      {
        idx: rowIndex + 1,
        record: t.record_number || "—",
        date: t.date || "—",
        from: t.source_name || "—",
        to: t.destination_name || "—",
        itemsCost: fmt(t.itemsCost),
        transport: fmt(t.transport),
        loading: fmt(t.loading),
        grand: fmt(t.grand),
        status: t.is_edited ? "معدَّل" : t.status || "—",
      },
    ], [t, rowIndex]);

    const filters = useMemo(() => [
      { label: "رقم الأذن", value: t.record_number || "—" },
      { label: "التاريخ", value: t.date || "—" },
      { label: "المخزن", value: t.source_name || "—" },
      { label: "الفرع", value: t.destination_name || "—" },
      { label: "الإجمالي", value: `${fmt(t.grand)} ج.م` },
    ], [t]);

    const safeName = (t.record_number || t.id || "غير_مسمى").replace(/\s+/g, "_");

    const handlePdf = async () => {
      setLoadingPdf(true);
      try {
        await exportToPDF({
          title: "فاتورة توريد للفرع",
          filename: `فاتورة_توريد_${safeName}`,
          columns: exportColumns,
          data: rowData,
          filters,
        });
        toast.success("تم تصدير PDF بنجاح");
      } catch (err) {
        console.error(err);
        toast.error("حدث خطأ أثناء التصدير");
      } finally {
        setLoadingPdf(false);
      }
    };

    const handleExcel = async () => {
      setLoadingExcel(true);
      try {
        await exportToExcel({
          title: "فاتورة توريد للفرع",
          filename: `فاتورة_توريد_${safeName}`,
          columns: exportColumns,
          data: rowData,
          filters,
        });
        toast.success("تم تصدير Excel بنجاح");
      } catch (err) {
        console.error(err);
        toast.error("حدث خطأ أثناء التصدير");
      } finally {
        setLoadingExcel(false);
      }
    };

    return (
      <div className="flex items-center justify-center gap-1">
        <PrintButton
          data={rowData}
          columns={exportColumns}
          title="فاتورة توريد للفرع"
          filters={filters}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-7 w-7">
              <Download size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handlePdf} disabled={loadingPdf} className="gap-2 cursor-pointer">
              {loadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              تصدير PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExcel} disabled={loadingExcel} className="gap-2 cursor-pointer">
              {loadingExcel ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-green-600" />}
              تصدير Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/transfers/${t.id}`)}>
          <Eye size={14} />
        </Button>
      </div>
    );
  };

  const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; tone: string }> = ({ icon, label, value, hint, tone }) => (
    <Card className="glass-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold truncate">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt size={28} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold">فواتير التوريدات للفروع</h1>
            <p className="text-xs text-muted-foreground">كل أذونات الصرف والتحويل الخارجة من المخازن إلى الفروع مع تكلفة النقل والتحميل لكل أذن.</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard icon={<Receipt size={20} className="text-primary"/>} tone="bg-primary/10"
          label="عدد الفواتير" value={String(kpis.count)} />
        <KpiCard icon={<DollarSign size={20} className="text-emerald-500"/>} tone="bg-emerald-500/10"
          label="إجمالي التوريدات" value={`${fmt(kpis.total)} ج.م`}
          hint="قيمة الخامات + النقل + التحميل" />
        <KpiCard icon={<Layers size={20} className="text-cyan-500"/>} tone="bg-cyan-500/10"
          label="تكلفة الخامات" value={`${fmt(kpis.rawCost)} ج.م`}
          hint="قبل الباكينج والمصاريف" />
        <KpiCard icon={<Package size={20} className="text-purple-500"/>} tone="bg-purple-500/10"
          label="تكلفة الباكينج" value={`${fmt(kpis.packingCost)} ج.م`} />
        <KpiCard icon={<Building2 size={20} className="text-amber-500"/>} tone="bg-amber-500/10"
          label="المصاريف الغير المباشرة المحملة" value={`${fmt(kpis.overheadCost)} ج.م`} />
        <KpiCard icon={<Truck size={20} className="text-orange-500"/>} tone="bg-orange-500/10"
          label="النقل والتحميل" value={`${fmt(kpis.surcharge)} ج.م`} />
        <KpiCard icon={<TrendingUp size={20} className="text-blue-500"/>} tone="bg-blue-500/10"
          label="أعلى فاتورة" value={kpis.top ? `${fmt(kpis.top.grand)} ج.م` : "—"}
          hint={kpis.top ? `${kpis.top.record_number} • ${kpis.top.destination_name}` : ""} />
      </div>


      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث برقم الأذن، المخزن، الفرع..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-muted-foreground"/>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[220px] h-10"><SelectValue placeholder="فلترة حسب الفرع"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">من:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px] h-10" />
            <span className="text-xs text-muted-foreground">إلى:</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px] h-10" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                مسح
              </Button>
            )}
          </div>
          <div className="mr-auto flex items-center gap-2">
            <PrintButton
              data={exportData}
              columns={exportColumns}
              title="فواتير التوريدات للفروع"
              filters={[
                { label: "الفرع", value: branchName },
                { label: "من تاريخ", value: dateFrom || "—" },
                { label: "إلى تاريخ", value: dateTo || "—" },
                { label: "عدد الفواتير", value: String(kpis.count) },
                { label: "إجمالي التوريدات", value: `${fmt(kpis.total)} ج.م` },
              ]}
              landscape
            />
            <ExportButtons
              data={exportData}
              columns={exportColumns}
              filename="فواتير_التوريدات_للفروع"
              title="فواتير التوريدات للفروع"
              filters={[
                { label: "الفرع", value: branchName },
                { label: "من تاريخ", value: dateFrom || "—" },
                { label: "إلى تاريخ", value: dateTo || "—" },
                { label: "عدد الفواتير", value: String(kpis.count) },
                { label: "إجمالي التوريدات", value: `${fmt(kpis.total)} ج.م` },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">م</TableHead>
                <TableHead className="text-center">رقم الأذن</TableHead>
                <TableHead className="text-center">التاريخ</TableHead>
                <TableHead className="text-center">المخزن</TableHead>
                <TableHead className="text-center">الفرع</TableHead>
                <TableHead className="text-center">قيمة الخامات</TableHead>
                <TableHead className="text-center">النقل</TableHead>
                <TableHead className="text-center">التحميل</TableHead>
                <TableHead className="text-center">الإجمالي</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">لا توجد فواتير توريد مطابقة</TableCell></TableRow>
              ) : (
                <>
                  {filtered.map((t: any, i: number) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-center text-xs">{i + 1}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{t.record_number || "—"}</TableCell>
                      <TableCell className="text-center text-xs">{t.date || "—"}</TableCell>
                      <TableCell className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1"><Warehouse size={12} className="text-muted-foreground"/>{t.source_name || "—"}</div>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1"><Building2 size={12} className="text-primary"/>{t.destination_name || "—"}</div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{fmt(t.itemsCost)}</TableCell>
                      <TableCell className="text-center tabular-nums text-orange-500">{fmt(t.transport)}</TableCell>
                      <TableCell className="text-center tabular-nums text-orange-500">{fmt(t.loading)}</TableCell>
                      <TableCell className="text-center tabular-nums font-bold text-emerald-500">{fmt(t.grand)}</TableCell>
                      <TableCell className="text-center">
                        {t.is_edited ? (
                          <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">معدَّل</Badge>
                        ) : t.status === "مكتمل" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">مكتمل</Badge>
                        ) : t.status === "مؤرشف" ? (
                          <Badge className="bg-red-500/15 text-red-500 border-red-500/30">مؤرشف</Badge>
                        ) : (
                          <Badge variant="outline">{t.status || "—"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <RowActions t={t} rowIndex={i} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={5} className="text-center">الإجمالي</TableCell>
                    <TableCell className="text-center tabular-nums">{fmt(filtered.reduce((s, t) => s + t.itemsCost, 0))}</TableCell>
                    <TableCell className="text-center tabular-nums">{fmt(filtered.reduce((s, t) => s + t.transport, 0))}</TableCell>
                    <TableCell className="text-center tabular-nums">{fmt(filtered.reduce((s, t) => s + t.loading, 0))}</TableCell>
                    <TableCell className="text-center tabular-nums text-emerald-500">{fmt(kpis.total)}</TableCell>
                    <TableCell colSpan={2}/>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default SupplyInvoicesToBranchesPage;
