import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Store, Warehouse, AlertTriangle, Package, DollarSign, TrendingDown, CalendarIcon, X } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLocationStock } from "@/hooks/useLocationStock";
import { useBranchCosts } from "@/hooks/useBranchCosts";

export const InventoryBalancesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(undefined);

  const asOfDateStr = asOfDate ? format(asOfDate, "yyyy-MM-dd") : null;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: itemLocations = [] } = useQuery({
    queryKey: ["stock-item-locations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: itemDepartments = [] } = useQuery({
    queryKey: ["stock-item-departments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_departments").select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const isLocationFiltered = locationFilter !== "";
  const activeDeptFilter = (departmentFilter && departmentFilter !== "all") ? departmentFilter : null;

  const { stockMap: locationStockMap, getLocationStock } = useLocationStock(
    isLocationFiltered ? locationFilter : null,
    locationType,
    activeDeptFilter,
    asOfDateStr,
  );

  const { getCost: getBranchCost } = useBranchCosts(
    isLocationFiltered ? locationFilter : null,
  );

  const getCatName = (id: string | null) => {
    if (!id) return "—";
    return categories.find((c: any) => c.id === id)?.name || "—";
  };

  const getDepNames = (itemId: string) => {
    const deps = itemDepartments.filter((d: any) => d.stock_item_id === itemId);
    const names = deps.map((d: any) => {
      const dep = departments.find((dp: any) => dp.id === d.department_id);
      return dep?.name || "";
    }).filter(Boolean);
    return names.length > 0 ? names.join("، ") : "—";
  };

  const getLocationNames = (itemId: string) => {
    const locs = itemLocations.filter((l: any) => l.stock_item_id === itemId);
    const names: string[] = [];
    locs.forEach((l: any) => {
      if (l.branch_id) {
        const b = branches.find((br: any) => br.id === l.branch_id);
        if (b) names.push(b.name);
      }
      if (l.warehouse_id) {
        const w = warehouses.find((wr: any) => wr.id === l.warehouse_id);
        if (w) names.push(w.name);
      }
    });
    return names.length > 0 ? names.join("، ") : "—";
  };

  // Suggest possible reason for negative stock
  const getNegativeReason = (item: any): string => {
    const itemId = item.id;
    const linked = itemLocations.some((l: any) =>
      locationType === "branch" ? l.branch_id === locationFilter && l.stock_item_id === itemId
                                : l.warehouse_id === locationFilter && l.stock_item_id === itemId
    );
    if (!linked) return "الصنف غير مرتبط بالموقع — راجع ربط المواقع";
    const cf = Number(item.conversion_factor);
    if (!cf || cf <= 0) return "معامل التحويل غير صحيح — راجع بيانات الصنف";
    return "لا يوجد جرد افتتاحي يغطي الاستهلاك — أنشئ جرد أول مدة";
  };

  const filtered = useMemo(() => {
    let result = [...items];

    if (departmentFilter && departmentFilter !== "all") {
      const itemIdsInDept = new Set(
        itemDepartments
          .filter((d: any) => d.department_id === departmentFilter)
          .map((d: any) => d.stock_item_id),
      );
      result = result.filter((item: any) => itemIdsInDept.has(item.id));
    }

    if (isLocationFiltered) {
      const itemIdsWithLocation = new Set(
        itemLocations
          .filter((l: any) => {
            if (locationType === "branch") return l.branch_id === locationFilter;
            return l.warehouse_id === locationFilter;
          })
          .map((l: any) => l.stock_item_id),
      );
      result = result.filter((item: any) => itemIdsWithLocation.has(item.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item: any) =>
          (item.code || "").toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          getCatName(item.category_id).toLowerCase().includes(q) ||
          item.stock_unit.toLowerCase().includes(q) ||
          getLocationNames(item.id).toLowerCase().includes(q) ||
          getDepNames(item.id).toLowerCase().includes(q),
      );
    }

    // Sort by code
    result.sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));
    return result;
  }, [items, departmentFilter, locationFilter, locationType, searchQuery, itemLocations, itemDepartments, categories, branches, warehouses, departments]);

  const summary = useMemo(() => {
    let totalValue = 0;
    let zeroCount = 0;
    let negativeCount = 0;
    let positiveCount = 0;
    for (const item of filtered) {
      const stock = getLocationStock(item.id);
      const cost = getBranchCost(item.id, item.avg_cost);
      totalValue += stock * cost;
      if (stock < 0) negativeCount++;
      else if (stock === 0) zeroCount++;
      else positiveCount++;
    }
    return { totalValue, zeroCount, negativeCount, positiveCount, totalItems: filtered.length };
  }, [filtered, locationStockMap, isLocationFiltered, getBranchCost]);

  const exportRows = filtered.map((item: any) => {
    const s = getLocationStock(item.id);
    const c = getBranchCost(item.id, item.avg_cost);
    return {
      code: item.code || "—",
      name: item.name,
      category: getCatName(item.category_id),
      unit: item.stock_unit,
      locations: getLocationNames(item.id),
      stock: s.toFixed(2),
      avgCost: c.toFixed(2),
      value: (s * c).toFixed(2),
    };
  });
  const exportColumns = [
    { key: "code", label: "الكود" },
    { key: "name", label: "الصنف" },
    { key: "category", label: "المجموعة" },
    { key: "unit", label: "الوحدة" },
    { key: "locations", label: "المواقع" },
    { key: "stock", label: "الرصيد" },
    { key: "avgCost", label: "متوسط التكلفة" },
    { key: "value", label: "قيمة المخزون" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">أرصدة المخزون</h1>
            {asOfDate && (
              <p className="text-sm text-muted-foreground mt-1">
                الرصيد كما في: {format(asOfDate, "dd MMMM yyyy", { locale: ar })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PrintButton data={exportRows} columns={exportColumns} title="أرصدة المخزون" />
            <ExportButtons
              data={exportRows}
              columns={exportColumns}
              filename="أرصدة_المخزون"
              title="أرصدة المخزون"
              filters={[
                { label: locationType === "branch" ? "الفرع" : "المخزن", value: !locationFilter ? "الكل" : ((locationType === "branch" ? branches : warehouses).find((l: any) => l.id === locationFilter)?.name ?? "—") },
                { label: "حتى تاريخ", value: asOfDate ? format(asOfDate, "yyyy/MM/dd") : "اليوم" },
              ]}
            />
          </div>
        </div>

        {/* Summary cards */}
        {isLocationFiltered && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="glass-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary"><DollarSign className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي قيمة المخزون</p>
                  <p className="text-lg font-bold">{summary.totalValue.toFixed(2)} ج.م</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><Package className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">عدد الأصناف</p>
                  <p className="text-lg font-bold">{summary.totalItems}</p>
                  <p className="text-[10px] text-muted-foreground">منها {summary.positiveCount} برصيد موجب</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500"><TrendingDown className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">أصناف برصيد صفر</p>
                  <p className="text-lg font-bold">{summary.zeroCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={cn("glass-card", summary.negativeCount > 0 && "border-destructive/40")}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">أصناف برصيد سالب</p>
                  <p className="text-lg font-bold text-destructive">{summary.negativeCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالكود، الاسم، المجموعة، القسم، الموقع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pr-9"
            />
          </div>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="كل الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departmentFilter && departmentFilter !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setDepartmentFilter("")}>إلغاء فلتر القسم</Button>
          )}

          {/* As-of date picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={asOfDate ? "default" : "outline"} className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {asOfDate ? format(asOfDate, "dd/MM/yyyy") : "الرصيد الحالي"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={asOfDate} onSelect={setAsOfDate} initialFocus />
            </PopoverContent>
          </Popover>
          {asOfDate && (
            <Button variant="ghost" size="sm" onClick={() => setAsOfDate(undefined)} className="gap-1">
              <X className="h-3 w-3" /> العودة للحالي
            </Button>
          )}
        </div>

        <Tabs
          value={locationType}
          onValueChange={(val) => {
            setLocationType(val as "branch" | "warehouse");
            setLocationFilter("");
          }}
          className="w-full"
        >
          <TabsList className="mb-4">
            <TabsTrigger value="warehouse" className="flex items-center gap-2">
              <Warehouse size={16} /> المخازن
            </TabsTrigger>
            <TabsTrigger value="branch" className="flex items-center gap-2">
              <Store size={16} /> الفروع
            </TabsTrigger>
          </TabsList>

          <TabsContent value="warehouse" className="mt-0">
            <div className="flex flex-wrap gap-2 mb-6">
              {warehouses.map((w: any) => (
                <Button key={w.id} variant={locationFilter === w.id ? "default" : "outline"} onClick={() => setLocationFilter(w.id)}>
                  {w.name}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="branch" className="mt-0">
            <div className="flex flex-wrap gap-2 mb-6">
              {branches.map((b: any) => (
                <Button key={b.id} variant={locationFilter === b.id ? "default" : "outline"} onClick={() => setLocationFilter(b.id)}>
                  {b.name}
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {!isLocationFiltered ? (
          <div className="glass-card flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Warehouse className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground font-medium">يرجى اختيار فرع أو مخزن لعرض بياناته</p>
            <p className="text-sm text-muted-foreground/70">Please select a branch or warehouse to display its data.</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">كود الصنف</TableHead>
                  <TableHead className="text-right">اسم الصنف</TableHead>
                  <TableHead className="text-right">المجموعة</TableHead>
                  <TableHead className="text-right">وحدة التخزين</TableHead>
                  <TableHead className="text-right">المواقع المرتبطة</TableHead>
                  <TableHead className="text-right bg-primary/10 text-primary font-bold">الرصيد بالفرع/المخزن</TableHead>
                  <TableHead className="text-right">متوسط التكلفة</TableHead>
                  <TableHead className="text-right">قيمة المخزون</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((item: any) => {
                      const stock = getLocationStock(item.id);
                      const cost = getBranchCost(item.id, item.avg_cost);
                      const inventoryValue = stock * cost;
                      const isNegative = stock < 0;
                      return (
                        <TableRow key={item.id} className={cn(isNegative && "bg-destructive/5 hover:bg-destructive/10")}>
                          <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.name}
                              {isNegative && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-4 w-4 text-destructive cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-[240px]">{getNegativeReason(item)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getCatName(item.category_id)}</TableCell>
                          <TableCell>{item.stock_unit}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate" title={getLocationNames(item.id)}>
                            {getLocationNames(item.id)}
                          </TableCell>
                          <TableCell className={cn(
                            "ring-2 rounded font-bold",
                            isNegative
                              ? "ring-destructive/40 bg-destructive/10 text-destructive"
                              : "ring-primary/40 bg-primary/5 text-primary"
                          )}>
                            {stock.toFixed(2)}
                          </TableCell>
                          <TableCell className={cn(isNegative && "text-destructive")}>{cost.toFixed(2)}</TableCell>
                          <TableCell className={cn("font-semibold", isNegative && "text-destructive")}>
                            {inventoryValue.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell colSpan={7} className="text-left">الإجمالي</TableCell>
                      <TableCell className="font-bold">{summary.totalValue.toFixed(2)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
