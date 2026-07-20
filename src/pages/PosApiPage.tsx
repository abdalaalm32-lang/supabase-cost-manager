import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Key, Trash2, Plus, Code2, Book, CheckCircle2, AlertCircle } from "lucide-react";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-api`;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `mgsc_live_${b64}`;
}

export function PosApiPage() {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const { data: keys = [], refetch } = useQuery({
    queryKey: ["pos-api-keys", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_api_keys").select("*, branches(name)").eq("company_id", companyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-for-api", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("company_id", companyId!).order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const createKey = async () => {
    if (!name.trim()) return toast.error("اسم المفتاح مطلوب");
    const raw = generateApiKey();
    const hash = await sha256Hex(raw);
    const prefix = raw.slice(0, 16);
    const { error } = await supabase.from("pos_api_keys").insert({
      company_id: companyId,
      name: name.trim(),
      key_prefix: prefix,
      key_hash: hash,
      default_branch_id: branchId || null,
      created_by: auth.user?.id,
    });
    if (error) return toast.error(error.message);
    setNewlyCreatedKey(raw);
    setName("");
    setBranchId("");
    refetch();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("pos_api_keys").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  const deleteKey = async (id: string) => {
    if (!confirm("تأكيد حذف المفتاح؟ لن يعمل أي نظام مرتبط بيه بعد الحذف.")) return;
    const { error } = await supabase.from("pos_api_keys").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    refetch();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Code2 className="h-8 w-8 text-primary" /> ربط API لنقاط البيع</h1>
          <p className="text-muted-foreground mt-1">اربط أي نظام نقطة بيع خارجي بالنظام عبر REST API آمن</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setNewlyCreatedKey(null); }}>
          <Plus className="ml-2 h-4 w-4" /> إنشاء مفتاح API
        </Button>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys"><Key className="ml-2 h-4 w-4" /> مفاتيح API</TabsTrigger>
          <TabsTrigger value="docs"><Book className="ml-2 h-4 w-4" /> دليل الربط</TabsTrigger>
          <TabsTrigger value="steps"><CheckCircle2 className="ml-2 h-4 w-4" /> خطوات الربط</TabsTrigger>
        </TabsList>

        {/* KEYS TAB */}
        <TabsContent value="keys" className="space-y-4">
          {keys.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>لا توجد مفاتيح API. أنشئ مفتاح جديد للبدء.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {keys.map((k: any) => (
                <Card key={k.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{k.name}</h3>
                        {k.active ? <Badge className="bg-green-600">نشط</Badge> : <Badge variant="secondary">معطل</Badge>}
                      </div>
                      <code className="text-xs text-muted-foreground font-mono">{k.key_prefix}••••••••••••</code>
                      <div className="text-xs text-muted-foreground mt-1">
                        {k.branches?.name && <span>الفرع الافتراضي: {k.branches.name} · </span>}
                        آخر استخدام: {k.last_used_at ? new Date(k.last_used_at).toLocaleString("ar-EG") : "لم يُستخدم بعد"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={k.active} onCheckedChange={(v) => toggleActive(k.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>تنبيه أمني:</strong> المفتاح الكامل يظهر مرة واحدة فقط عند الإنشاء. احفظه في مكان آمن. لو ضاع، احذف المفتاح وأنشئ واحد جديد.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOCS TAB */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>معلومات الاتصال الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Base URL</Label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">{API_BASE}</code>
                  <Button size="icon" variant="outline" onClick={() => copy(API_BASE)}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Authentication Header</Label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 p-2 bg-muted rounded text-sm font-mono">X-API-Key: mgsc_live_...</code>
                </div>
                <p className="text-xs text-muted-foreground mt-1">أضف مفتاح API في header اسمه X-API-Key مع كل طلب</p>
              </div>
            </CardContent>
          </Card>

          <EndpointCard
            method="POST"
            path="/sales"
            title="تسجيل عملية بيع"
            description="يسجل فاتورة مبيعات ويخصم الخامات من المخزون تلقائياً حسب الوصفات"
            body={`{
  "branch_id": "uuid-optional-if-default-set",
  "invoice_number": "POS-12345",   // optional, auto-generated if omitted
  "sale_date": "2026-07-20T14:30:00Z",
  "payment_method": "cash",
  "order_type": "dine_in",
  "subtotal": 100,
  "tax_amount": 14,
  "discount_amount": 0,
  "total_amount": 114,
  "external_reference": "foodics-ref-abc",
  "items": [
    { "code": "ITM_001", "quantity": 2, "unit_price": 50 },
    { "name": "شيكن رانش", "quantity": 1 }
  ]
}`}
            response={`{ "success": true, "sale_id": "uuid", "invoice_number": "INV-00001" }`}
          />

          <EndpointCard
            method="POST"
            path="/items"
            title="مزامنة الأصناف (Upsert)"
            description="ينشئ الأصناف الجديدة ويحدّث الموجود منها بناءً على الكود"
            body={`{
  "items": [
    { "code": "ITM_001", "name": "شيكن رانش", "price": 85 },
    { "code": "ITM_002", "name": "بيرجر", "price": 60 }
  ]
}`}
            response={`{ "success": true, "results": [{ "code": "ITM_001", "ok": true, "action": "created" }] }`}
          />

          <EndpointCard
            method="GET"
            path="/stock?branch_id=..."
            title="قراءة أرصدة المخزون"
            description="يرجع الأرصدة الحالية لكل الخامات (يمكن تصفية بحسب الفرع)"
            response={`{ "success": true, "count": 42, "items": [{ "code": "STK_001", "name": "دقيق", "unit": "كجم", "current_stock": 25.5 }] }`}
          />

          <EndpointCard
            method="GET"
            path="/ping"
            title="فحص الاتصال"
            description="يتحقق من عمل الخدمة (لا يحتاج API Key)"
            response={`{ "ok": true, "service": "pos-api", "time": "..." }`}
          />
        </TabsContent>

        {/* STEPS TAB */}
        <TabsContent value="steps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>خطوات ربط نظام نقطة البيع الخاص بك</CardTitle>
              <CardDescription>اتبع الخطوات دي بالترتيب لربط أي نظام POS خارجي</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Step num={1} title="أنشئ مفتاح API">
                من تبويب "مفاتيح API" اضغط "إنشاء مفتاح API"، اختر الاسم والفرع الافتراضي، واحفظ المفتاح الظاهر في مكان آمن (هيظهر مرة واحدة فقط).
              </Step>
              <Step num={2} title="مزامنة الأصناف أولاً">
                قبل تسجيل أي مبيعات، أرسل قائمة الأصناف عبر <code className="bg-muted px-1 rounded">POST /items</code> عشان يتم مطابقة الأكواد بين نظامك ونظامنا. لازم يكون كل صنف عنده وصفة (Recipe) في النظام حتى يتم خصم الخامات تلقائياً.
              </Step>
              <Step num={3} title="اضبط الويب هوك على نظامك">
                من إعدادات نظام الـ POS الخاص بك (Foodics / Odoo / Oracle Simphony / ...) أضف Webhook أو Integration جديد يستدعي رابط الـ Sales عند كل عملية بيع.
              </Step>
              <Step num={4} title="اختبر بعملية بيع تجريبية">
                أرسل طلب POST تجريبي لـ <code className="bg-muted px-1 rounded">/sales</code> باستخدام أداة زي Postman أو curl، وتأكد أن الفاتورة ظهرت في صفحة "فواتير نقطة البيع" والخامات خُصمت من المخزون.
              </Step>
              <Step num={5} title="فعّل الربط في الإنتاج">
                لما تتأكد من صحة البيانات، فعّل الـ webhook على نظامك للبيئة الحقيقية. راقب صفحة "مفاتيح API" لمتابعة آخر استخدام.
              </Step>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>مثال curl لتسجيل بيع</CardTitle></CardHeader>
            <CardContent>
              <pre className="p-3 bg-muted rounded text-xs overflow-x-auto font-mono">{`curl -X POST '${API_BASE}/sales' \\
  -H 'X-API-Key: mgsc_live_YOUR_KEY_HERE' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "total_amount": 114,
    "subtotal": 100,
    "tax_amount": 14,
    "items": [{ "code": "ITM_001", "quantity": 2, "unit_price": 50 }]
  }'`}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setNewlyCreatedKey(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{newlyCreatedKey ? "تم إنشاء المفتاح بنجاح" : "إنشاء مفتاح API جديد"}</DialogTitle>
            <DialogDescription>
              {newlyCreatedKey ? "انسخ المفتاح الآن واحفظه في مكان آمن — لن يظهر مرة أخرى" : "أدخل بيانات المفتاح الجديد"}
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedKey ? (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded font-mono text-sm break-all">{newlyCreatedKey}</div>
              <Button className="w-full" onClick={() => copy(newlyCreatedKey)}>
                <Copy className="ml-2 h-4 w-4" /> نسخ المفتاح
              </Button>
              <div className="text-xs text-amber-600 flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>احفظ المفتاح دلوقتي — بعد قفل النافذة مش هتقدر تشوفه تاني.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>اسم المفتاح</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: Foodics — الفرع الرئيسي" />
              </div>
              <div>
                <Label>الفرع الافتراضي (اختياري)</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر فرع أو اترك فارغ" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">لو حددت فرع، مش لازم النظام الخارجي يرسل branch_id مع كل بيع</p>
              </div>
            </div>
          )}

          <DialogFooter>
            {newlyCreatedKey ? (
              <Button onClick={() => { setCreateOpen(false); setNewlyCreatedKey(null); }}>تم الحفظ</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
                <Button onClick={createKey}>إنشاء المفتاح</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EndpointCard({ method, path, title, description, body, response }: { method: string; path: string; title: string; description: string; body?: string; response: string }) {
  const color = method === "GET" ? "bg-blue-600" : method === "POST" ? "bg-green-600" : "bg-orange-600";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge className={color}>{method}</Badge>
          <code className="font-mono text-sm">{path}</code>
        </div>
        <CardTitle className="text-lg mt-2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {body && (
          <div>
            <Label className="text-xs">Request Body</Label>
            <pre className="p-3 bg-muted rounded text-xs overflow-x-auto font-mono mt-1">{body}</pre>
          </div>
        )}
        <div>
          <Label className="text-xs">Response</Label>
          <pre className="p-3 bg-muted rounded text-xs overflow-x-auto font-mono mt-1">{response}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">{num}</div>
      <div className="flex-1">
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default PosApiPage;
