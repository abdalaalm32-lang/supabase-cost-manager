import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingDown, TrendingUp, Minus, Loader2, Info } from "lucide-react";

export interface MenuBreakdownItem {
  id: string;
  name: string;
  code: string;
  category: string;
  classification: string;
  price: number;
  finalDirectCost: number;
  directCostPct: number;
  indirectExpenses: number;
  totalCost: number;
  netProfit: number;
  netPct: number;
}

export interface MenuBreakdownCategory {
  name: string;
  classification: string;
  price: number;
  direct: number;
  indirect: number;
  profit: number;
  directPct: number;
  indirectPct: number;
  netPct: number;
  itemCount: number;
}

export interface MenuBreakdown {
  totals: {
    price: number;
    direct: number;
    indirect: number;
    profit: number;
    directPct: number;
    indirectPct: number;
    netPct: number;
    itemCount: number;
    monthlySales: number;
  };
  categories: MenuBreakdownCategory[];
  items: MenuBreakdownItem[];
}

export interface ComparablePeriodLite {
  id: string;
  name: string;
  start_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: ComparablePeriodLite[];
  defaultPeriodId?: string | null;
  /** Loads a complete breakdown (totals + categories + items) for a given period id. */
  loadBreakdown: (periodId: string) => Promise<MenuBreakdown | null>;
}

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

const Diff: React.FC<{ a: number; b: number; positiveIsGood?: boolean; isPct?: boolean }> = ({
  a, b, positiveIsGood = true, isPct = false,
}) => {
  const diff = b - a;
  const p = a !== 0 ? (diff / Math.abs(a)) * 100 : (b === 0 ? 0 : 100);
  const good = positiveIsGood ? diff >= 0 : diff <= 0;
  const color = diff === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-500";
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <div className={`flex items-center justify-center gap-1 font-semibold ${color}`}>
      <Icon size={14} />
      <span>{diff > 0 ? "+" : ""}{isPct ? `${diff.toFixed(2)}%` : fmt(diff)}</span>
      {!isPct && <span className="text-xs">({diff > 0 ? "+" : ""}{p.toFixed(1)}%)</span>}
    </div>
  );
};

export const MenuAnalysisComparisonDialog: React.FC<Props> = ({
  open, onOpenChange, periods, defaultPeriodId, loadBreakdown,
}) => {
  const sorted = useMemo(
    () => [...periods].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [periods]
  );

  const [aId, setAId] = useState<string>(() => defaultPeriodId || sorted[0]?.id || "");
  const [bId, setBId] = useState<string>(() => {
    const fallback = sorted.find(p => p.id !== (defaultPeriodId || sorted[0]?.id));
    return fallback?.id || "";
  });

  const [A, setA] = useState<MenuBreakdown | null>(null);
  const [B, setB] = useState<MenuBreakdown | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  useEffect(() => {
    if (!open || !aId) { setA(null); return; }
    let cancelled = false;
    setLoadingA(true);
    loadBreakdown(aId).then(res => { if (!cancelled) setA(res); }).finally(() => { if (!cancelled) setLoadingA(false); });
    return () => { cancelled = true; };
  }, [open, aId, loadBreakdown]);

  useEffect(() => {
    if (!open || !bId) { setB(null); return; }
    let cancelled = false;
    setLoadingB(true);
    loadBreakdown(bId).then(res => { if (!cancelled) setB(res); }).finally(() => { if (!cancelled) setLoadingB(false); });
    return () => { cancelled = true; };
  }, [open, bId, loadBreakdown]);

  const aName = sorted.find(p => p.id === aId)?.name || "—";
  const bName = sorted.find(p => p.id === bId)?.name || "—";

  // === KPIs ===
  const KPIRow: React.FC<{ label: string; a: number; b: number; isPct?: boolean; positiveIsGood?: boolean }> = ({ label, a, b, isPct, positiveIsGood = true }) => (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-center">{isPct ? pct(a) : fmt(a)}</TableCell>
      <TableCell className="text-center">{isPct ? pct(b) : fmt(b)}</TableCell>
      <TableCell className="text-center"><Diff a={a} b={b} isPct={isPct} positiveIsGood={positiveIsGood} /></TableCell>
    </TableRow>
  );

  // === Category comparison rows ===
  const categoryRows = useMemo(() => {
    if (!A || !B) return [];
    const names = Array.from(new Set([...A.categories.map(c => c.name), ...B.categories.map(c => c.name)]));
    return names.map(name => {
      const ac = A.categories.find(c => c.name === name);
      const bc = B.categories.find(c => c.name === name);
      return {
        name,
        classification: ac?.classification || bc?.classification || "",
        aPrice: ac?.price ?? 0,
        bPrice: bc?.price ?? 0,
        aDirect: ac?.direct ?? 0,
        bDirect: bc?.direct ?? 0,
        aDirectPct: ac?.directPct ?? 0,
        bDirectPct: bc?.directPct ?? 0,
        aNetPct: ac?.netPct ?? 0,
        bNetPct: bc?.netPct ?? 0,
        aProfit: ac?.profit ?? 0,
        bProfit: bc?.profit ?? 0,
        isNew: !ac && !!bc,
        isRemoved: !!ac && !bc,
      };
    });
  }, [A, B]);

  // === Item-level: top changes ===
  const itemRows = useMemo(() => {
    if (!A || !B) return { top: [] as any[], added: [] as any[], removed: [] as any[] };
    const aMap = new Map(A.items.map(i => [i.id, i] as const));
    const bMap = new Map(B.items.map(i => [i.id, i] as const));
    const allIds = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));
    const rows = allIds.map(id => {
      const ai = aMap.get(id);
      const bi = bMap.get(id);
      const ref = bi || ai!;
      const aDP = ai?.directCostPct ?? 0;
      const bDP = bi?.directCostPct ?? 0;
      const aNP = ai?.netPct ?? 0;
      const bNP = bi?.netPct ?? 0;
      return {
        id,
        name: ref.name,
        code: ref.code,
        category: ref.category,
        classification: ref.classification,
        aPrice: ai?.price ?? 0,
        bPrice: bi?.price ?? 0,
        aDirect: ai?.finalDirectCost ?? 0,
        bDirect: bi?.finalDirectCost ?? 0,
        aDirectPct: aDP,
        bDirectPct: bDP,
        aNetPct: aNP,
        bNetPct: bNP,
        directPctDiff: bDP - aDP,
        netPctDiff: bNP - aNP,
        isNew: !ai && !!bi,
        isRemoved: !!ai && !bi,
      };
    });
    const added = rows.filter(r => r.isNew);
    const removed = rows.filter(r => r.isRemoved);
    const top = rows
      .filter(r => !r.isNew && !r.isRemoved)
      .sort((x, y) => Math.abs(y.directPctDiff) - Math.abs(x.directPctDiff))
      .slice(0, 15);
    return { top, added, removed };
  }, [A, B]);

  const ready = !!A && !!B && !loadingA && !loadingB;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>مقارنة تحليل المنيو بين فترتين</DialogTitle>
        </DialogHeader>

        {/* Period pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">الفترة الحالية</p>
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                {sorted.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">الفترة القديمة</p>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر فترة للمقارنة" /></SelectTrigger>
              <SelectContent>
                {sorted.filter(p => p.id !== aId).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(loadingA || loadingB) && (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="animate-spin" size={18} /> جاري حساب البيانات...
          </div>
        )}

        {ready && A && B && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
              <TabsTrigger value="categories">التصنيفات</TabsTrigger>
              <TabsTrigger value="items">الأصناف</TabsTrigger>
            </TabsList>

            {/* === Overview === */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">المؤشرات الإجمالية</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المؤشر</TableHead>
                        <TableHead className="text-center">(حالياً) {aName}</TableHead>
                        <TableHead className="text-center">(قديماً) {bName}</TableHead>
                        <TableHead className="text-center">الفرق</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <KPIRow label="إجمالي أسعار البيع (Selling Price)" a={A.totals.price} b={B.totals.price} />
                      <KPIRow label="إجمالي التكلفة المباشرة (Direct Cost)" a={A.totals.direct} b={B.totals.direct} positiveIsGood={false} />
                      <KPIRow label="نسبة التكلفة المباشرة %" a={A.totals.directPct} b={B.totals.directPct} isPct positiveIsGood={false} />
                      <KPIRow label="إجمالي المصاريف غير المباشرة" a={A.totals.indirect} b={B.totals.indirect} positiveIsGood={false} />
                      <KPIRow label="نسبة المصاريف غير المباشرة %" a={A.totals.indirectPct} b={B.totals.indirectPct} isPct positiveIsGood={false} />
                      <KPIRow label="صافي الربح" a={A.totals.profit} b={B.totals.profit} />
                      <KPIRow label="نسبة صافي الربح %" a={A.totals.netPct} b={B.totals.netPct} isPct />
                      <KPIRow label="عدد الأصناف" a={A.totals.itemCount} b={B.totals.itemCount} />
                      <KPIRow label="المبيعات المتوقعة الشهرية" a={A.totals.monthlySales} b={B.totals.monthlySales} />
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="text-[11px] text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded p-2 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>المقارنة مبنية على نفس قوائم الأصناف الحالية (فلتر الفرع/التصنيف) مع تطبيق إعدادات كل فترة (المستهلكات، التغليف، التكلفة الإضافية، المصاريف غير المباشرة).</span>
              </div>
            </TabsContent>

            {/* === Categories === */}
            <TabsContent value="categories" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">مقارنة على مستوى التصنيف (Category)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التصنيف</TableHead>
                          <TableHead className="text-center">القسم</TableHead>
                          <TableHead className="text-center">سعر البيع (حالياً)</TableHead>
                          <TableHead className="text-center">سعر البيع (قديماً)</TableHead>
                          <TableHead className="text-center">% تكلفة مباشرة (حالياً)</TableHead>
                          <TableHead className="text-center">% تكلفة مباشرة (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                          <TableHead className="text-center">% صافي ربح (حالياً)</TableHead>
                          <TableHead className="text-center">% صافي ربح (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryRows.map(r => (
                          <TableRow key={r.name}>
                            <TableCell className="font-medium">
                              {r.name}
                              {r.isNew && <Badge variant="outline" className="ml-2 text-[10px] text-blue-500 border-blue-500/50">🆕 جديد</Badge>}
                              {r.isRemoved && <Badge variant="outline" className="ml-2 text-[10px] text-purple-500 border-purple-500/50">✖ محذوف</Badge>}
                            </TableCell>
                            <TableCell className="text-center text-xs">{r.classification || "—"}</TableCell>
                            <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                            <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                            <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aDirectPct} b={r.bDirectPct} isPct positiveIsGood={false} /></TableCell>
                            <TableCell className="text-center">{pct(r.aNetPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aNetPct} b={r.bNetPct} isPct /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* === Items === */}
            <TabsContent value="items" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">أكبر 15 صنف تغيّرت نسبة تكلفته المباشرة</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead className="text-center">التصنيف</TableHead>
                          <TableHead className="text-center">سعر (حالياً)</TableHead>
                          <TableHead className="text-center">سعر (قديماً)</TableHead>
                          <TableHead className="text-center">% مباشرة (حالياً)</TableHead>
                          <TableHead className="text-center">% مباشرة (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                          <TableHead className="text-center">% صافي (قديماً)</TableHead>
                          <TableHead className="text-center">فرق صافي %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemRows.top.length === 0 ? (
                          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">لا توجد أصناف مشتركة بين الفترتين.</TableCell></TableRow>
                        ) : itemRows.top.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{r.name}</div>
                              <div className="text-[10px] text-muted-foreground">{r.category} {r.code ? `• ${r.code}` : ""}</div>
                            </TableCell>
                            <TableCell className="text-center text-xs">{r.classification || "—"}</TableCell>
                            <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                            <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                            <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aDirectPct} b={r.bDirectPct} isPct positiveIsGood={false} /></TableCell>
                            <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aNetPct} b={r.bNetPct} isPct /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-500">🆕 أصناف جديدة في (ب)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itemRows.added.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">لا يوجد</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">السعر</TableHead>
                            <TableHead className="text-center">% مباشرة</TableHead>
                            <TableHead className="text-center">% صافي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRows.added.map(r => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="font-medium text-sm">{r.name}</div>
                                <div className="text-[10px] text-muted-foreground">{r.category}</div>
                              </TableCell>
                              <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                              <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                              <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-purple-500">✖ أصناف اختفت في (ب)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itemRows.removed.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">لا يوجد</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">السعر</TableHead>
                            <TableHead className="text-center">% مباشرة</TableHead>
                            <TableHead className="text-center">% صافي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRows.removed.map(r => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="font-medium text-sm">{r.name}</div>
                                <div className="text-[10px] text-muted-foreground">{r.category}</div>
                              </TableCell>
                              <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                              <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                              <TableCell className="text-center">{pct(r.aNetPct)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
