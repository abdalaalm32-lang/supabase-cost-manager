import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Store, Tags, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export const PosChannelsPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [tab, setTab] = useState("channels");

  // channel dialog state
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fMarkup, setFMarkup] = useState("0");
  const [fActive, setFActive] = useState(true);

  // pricing tab state
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: channels = [] } = useQuery({
    queryKey: ["pos-channels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_channels").select("*").eq("company_id", companyId!)
        .order("sort_order").order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["pos-items-channels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_items")
        .select("*, categories:category_id(name), branches:branch_id(name)")
        .eq("company_id", companyId!).eq("active", true).order("code");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: channelPrices = [] } = useQuery({
    queryKey: ["pos-channel-prices", companyId, selectedChannel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_item_channel_prices").select("*").eq("channel_id", selectedChannel);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && !!selectedChannel,
  });

  const priceMap = useMemo(() => {
    const m = new Map<string, any>();
    channelPrices.forEach((p) => m.set(p.pos_item_id, p));
    return m;
  }, [channelPrices]);

  const activeChannel = channels.find((c) => c.id === selectedChannel);
  const markup = Number(activeChannel?.markup_percent ?? 0);

  const categoryNames = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => {
      const n = i.categories?.name || i.category;
      if (n) s.add(n);
    });
    return Array.from(s).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let r = items;
    if (filterBranch !== "all") r = r.filter((i) => i.branch_id === filterBranch);
    if (filterCategory !== "all") r = r.filter((i) => (i.categories?.name || i.category || "") === filterCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q));
    }
    return r;
  }, [items, filterBranch, filterCategory, search]);

  const suggestedPrice = (base: number) => Number((base * (1 + markup / 100)).toFixed(2));

  const effectivePrice = (item: any) => {
    const row = priceMap.get(item.id);
    if (row && row.active) return Number(row.price);
    return suggestedPrice(Number(item.price ?? 0));
  };

  const saveChannel = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId!,
        name: fName.trim(),
        code: fCode.trim() || null,
        markup_percent: parseFloat(fMarkup) || 0,
        active: fActive,
      };
      if (!payload.name) throw new Error("اكتب اسم القناة");
      if (editId) {
        const { error } = await supabase.from("pos_channels").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pos_channels").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-channels"] });
      toast.success(editId ? "تم تعديل القناة" : "تم إضافة القناة");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleChannel = useMutation({
    mutationFn: async (ch: any) => {
      const { error } = await supabase.from("pos_channels").update({ active: !ch.active }).eq("id", ch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-channels"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePrice = useMutation({
    mutationFn: async ({ itemId, price }: { itemId: string; price: number }) => {
      const { error } = await supabase.from("pos_item_channel_prices").upsert(
        { company_id: companyId!, channel_id: selectedChannel, pos_item_id: itemId, price, active: true },
        { onConflict: "channel_id,pos_item_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-channel-prices"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const resetPrice = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("pos_item_channel_prices")
        .delete().eq("channel_id", selectedChannel).eq("pos_item_id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-channel-prices"] });
      toast.success("رجع للسعر المحسوب تلقائيًا");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyMarkupToAll = useMutation({
    mutationFn: async () => {
      const rows = filteredItems.map((i) => ({
        company_id: companyId!, channel_id: selectedChannel, pos_item_id: i.id,
        price: suggestedPrice(Number(i.price ?? 0)), active: true,
      }));
      if (!rows.length) throw new Error("لا توجد أصناف");
      const { error } = await supabase.from("pos_item_channel_prices")
        .upsert(rows, { onConflict: "channel_id,pos_item_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["pos-channel-prices"] });
      setDrafts({});
      toast.success(`تم تطبيق نسبة الزيادة على ${n} صنف`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditId(null); setFName(""); setFCode(""); setFMarkup("0"); setFActive(true); setOpen(true);
  };
  const openEdit = (ch: any) => {
    setEditId(ch.id); setFName(ch.name); setFCode(ch.code || "");
    setFMarkup(String(ch.markup_percent ?? 0)); setFActive(ch.active); setOpen(true);
  };

  React.useEffect(() => {
    if (!selectedChannel && channels.length) {
      const nonDefault = channels.find((c) => !c.is_default && c.active);
      setSelectedChannel((nonDefault || channels[0]).id);
    }
  }, [channels, selectedChannel]);

  const customCount = filteredItems.filter((i) => priceMap.has(i.id)).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold">قنوات البيع وأسعارها</h1>
        <p className="text-sm text-muted-foreground mt-1">
          نفس المنيو بدون تكرار أصناف — كل قناة (صالة، طلبات، أوبر…) ليها سعرها الخاص لنفس الصنف.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="channels" className="gap-2"><Store size={16} /> القنوات</TabsTrigger>
          <TabsTrigger value="prices" className="gap-2"><Tags size={16} /> أسعار الأصناف</TabsTrigger>
        </TabsList>

        {/* Channels tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={openAdd}><Plus size={18} /> إضافة قناة</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editId ? "تعديل قناة" : "إضافة قناة بيع"}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>اسم القناة</Label>
                    <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="مثال: طلبات" />
                  </div>
                  <div className="space-y-2">
                    <Label>كود مختصر (اختياري)</Label>
                    <Input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="TLB" />
                  </div>
                  <div className="space-y-2">
                    <Label>نسبة الزيادة الافتراضية %</Label>
                    <Input type="number" inputMode="decimal" value={fMarkup} onChange={(e) => setFMarkup(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                      تُستخدم تلقائيًا لأي صنف مش محدد له سعر خاص في القناة دي.
                    </p>
                  </div>
                  <div className="flex items-center justify-between border rounded-lg p-3">
                    <Label>مفعّلة</Label>
                    <Switch checked={fActive} onCheckedChange={setFActive} />
                  </div>
                  <Button className="w-full" disabled={saveChannel.isPending} onClick={() => saveChannel.mutate()}>
                    حفظ
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">القناة</TableHead>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">نسبة الزيادة</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((ch) => (
                    <TableRow key={ch.id}>
                      <TableCell className="text-right font-semibold">
                        {ch.name}
                        {ch.is_default && <Badge variant="secondary" className="mr-2 text-[10px]">افتراضية</Badge>}
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono">{ch.code || "—"}</TableCell>
                      <TableCell className="text-center">{Number(ch.markup_percent ?? 0).toFixed(2)}%</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={ch.active ? "default" : "secondary"}>{ch.active ? "مفعّلة" : "موقوفة"}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ch)}><Pencil size={15} /></Button>
                          {!ch.is_default && (
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleChannel.mutate(ch)}>
                              {ch.active ? "إيقاف" : "تفعيل"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {channels.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد قنوات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prices tab */}
        <TabsContent value="prices" className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">القناة</Label>
                  <Select value={selectedChannel} onValueChange={(v) => { setSelectedChannel(v); setDrafts({}); }}>
                    <SelectTrigger><SelectValue placeholder="اختر القناة" /></SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الفرع</Label>
                  <Select value={filterBranch} onValueChange={setFilterBranch}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفروع</SelectItem>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المجموعة</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المجموعات</SelectItem>
                      {categoryNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">بحث</Label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input className="pr-9" placeholder="اسم أو كود الصنف" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Badge variant="outline">عدد الأصناف: {filteredItems.length}</Badge>
                <Badge variant="outline">بسعر خاص: {customCount}</Badge>
                <Badge variant="outline">نسبة الزيادة: {markup.toFixed(2)}%</Badge>
                <Button size="sm" variant="secondary" className="gap-1.5"
                  disabled={!selectedChannel || applyMarkupToAll.isPending}
                  onClick={() => applyMarkupToAll.mutate()}>
                  <Save size={14} /> تطبيق نسبة الزيادة على الأصناف الظاهرة
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">المجموعة</TableHead>
                    <TableHead className="text-right">الفرع</TableHead>
                    <TableHead className="text-center">السعر الأساسي</TableHead>
                    <TableHead className="text-center">سعر القناة</TableHead>
                    <TableHead className="text-center">الفرق</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const base = Number(item.price ?? 0);
                    const current = effectivePrice(item);
                    const isCustom = priceMap.has(item.id);
                    const draft = drafts[item.id];
                    const diff = current - base;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-center text-xs font-mono">{item.code || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{item.name}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{item.categories?.name || item.category || "—"}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{item.branches?.name || "—"}</TableCell>
                        <TableCell className="text-center">{base.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            className="h-8 w-28 mx-auto text-center"
                            inputMode="decimal"
                            value={draft ?? String(current)}
                            onChange={(e) => setDrafts((p) => ({ ...p, [item.id]: e.target.value }))}
                            onBlur={() => {
                              const v = drafts[item.id];
                              if (v === undefined) return;
                              const num = parseFloat(v);
                              setDrafts((p) => { const n = { ...p }; delete n[item.id]; return n; });
                              if (!isNaN(num) && num !== current) savePrice.mutate({ itemId: item.id, price: num });
                            }}
                          />
                        </TableCell>
                        <TableCell className={`text-center text-xs font-semibold ${diff > 0 ? "text-emerald-500" : diff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isCustom ? (
                            <Button variant="ghost" size="icon" title="رجوع للسعر التلقائي" onClick={() => resetPrice.mutate(item.id)}>
                              <RotateCcw size={15} />
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">تلقائي</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PosChannelsPage;
