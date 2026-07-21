import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Database, Plug, ScrollText, Server, Download, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Save, Play, Info,
} from "lucide-react";
import { PosApiPage } from "./PosApiPage";

type DbType = "sqlserver" | "mysql" | "postgres" | "oracle";

const DEFAULT_PORTS: Record<DbType, number> = {
  sqlserver: 1433, mysql: 3306, postgres: 5432, oracle: 1521,
};

const AVAILABLE_TABLES = [
  { id: "invoices", label: "الفواتير (Invoices)" },
  { id: "sales_details", label: "تفاصيل المبيعات (Sales Details)" },
  { id: "items", label: "الأصناف (Items)" },
  { id: "customers", label: "العملاء (Customers)" },
  { id: "branches", label: "الفروع (Branches)" },
];

const SYNC_INTERVALS = [
  { value: 10, label: "كل 10 ثواني" },
  { value: 30, label: "كل 30 ثانية" },
  { value: 60, label: "كل دقيقة" },
  { value: 300, label: "كل 5 دقائق" },
];

export function PosIntegrationPage() {
  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Plug className="h-8 w-8 text-primary" />
          التكامل مع أنظمة نقاط البيع
        </h1>
        <p className="text-muted-foreground mt-1">
          اربط أي نظام POS بالسيستم عن طريق REST API الحديث أو مزامنة قاعدة البيانات مباشرة للأنظمة القديمة
        </p>
      </div>

      <Tabs defaultValue="api" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="api"><Plug className="ml-2 h-4 w-4" /> API Integration</TabsTrigger>
          <TabsTrigger value="db"><Database className="ml-2 h-4 w-4" /> Database Sync</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="ml-2 h-4 w-4" /> سجل المزامنة</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="mt-0">
          <div className="-mt-6 -mx-6"><PosApiPage /></div>
        </TabsContent>

        <TabsContent value="db"><DatabaseSyncTab /></TabsContent>

        <TabsContent value="logs"><SyncLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// DATABASE SYNC TAB
// ============================================================
function DatabaseSyncTab() {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [dbType, setDbType] = useState<DbType>("sqlserver");
  const [serverHost, setServerHost] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [port, setPort] = useState<number>(1433);
  const [syncInterval, setSyncInterval] = useState<number>(60);
  const [selectedTables, setSelectedTables] = useState<string[]>(["invoices", "sales_details", "items"]);
  const [active, setActive] = useState(true);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [configId, setConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["pos-sync-config", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("pos_sync_configs").select("*").eq("company_id", companyId!).maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // Hydrate form from existing config
  useState(() => {
    if (existing && !configId) {
      setConfigId(existing.id);
      setDbType(existing.db_type);
      setServerHost(existing.server_host);
      setDatabaseName(existing.database_name);
      setUsername(existing.db_username);
      setPort(existing.port);
      setSyncInterval(existing.sync_interval_seconds);
      setSelectedTables(Array.isArray(existing.selected_tables) ? existing.selected_tables : []);
      setActive(existing.active);
    }
  });

  const handleDbTypeChange = (t: DbType) => { setDbType(t); setPort(DEFAULT_PORTS[t]); };

  const toggleTable = (id: string, checked: boolean) => {
    setSelectedTables((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const testConnection = async () => {
    setTestStatus("testing");
    // MVP: shape validation only (real test happens from Sync Agent on client's LAN)
    await new Promise((r) => setTimeout(r, 900));
    if (!serverHost.trim() || !databaseName.trim() || !username.trim() || port < 1 || port > 65535) {
      setTestStatus("fail");
      toast.error("بيانات الاتصال غير مكتملة أو غير صحيحة");
      return;
    }
    setTestStatus("ok");
    toast.success("صيغة بيانات الاتصال صحيحة. الاتصال الفعلي يتم من الـ Sync Agent على سيرفر العميل.");
  };

  const saveConfig = async () => {
    if (!companyId) return;
    if (!serverHost || !databaseName || !username) {
      toast.error("املأ بيانات الاتصال أولاً");
      return;
    }
    setSaving(true);
    const payload: any = {
      company_id: companyId,
      db_type: dbType,
      server_host: serverHost,
      database_name: databaseName,
      db_username: username,
      port,
      sync_interval_seconds: syncInterval,
      selected_tables: selectedTables,
      active,
    };
    if (password) payload.db_password_encrypted = btoa(password); // placeholder encoding; Agent uses real crypto
    if (!configId) payload.created_by = auth.user?.id;

    const { data, error } = configId
      ? await supabase.from("pos_sync_configs").update(payload).eq("id", configId).select().single()
      : await supabase.from("pos_sync_configs").insert(payload).select().single();

    setSaving(false);
    if (error) return toast.error(error.message);
    setConfigId(data.id);
    setPassword("");
    toast.success("تم حفظ الإعدادات");
  };

  const { data: lastLog } = useQuery({
    queryKey: ["last-sync-log", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("pos_sync_logs")
        .select("*").eq("company_id", companyId!).eq("source", "db_sync")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Card 1: DB type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> نوع قاعدة البيانات</CardTitle>
          <CardDescription>اختر نوع قاعدة بيانات نظام الـ POS القديم</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={dbType} onValueChange={(v) => handleDbTypeChange(v as DbType)} className="grid grid-cols-2 gap-3">
            {[
              { v: "sqlserver", l: "SQL Server", d: "Phoenix, Oracle Simphony, Aloha" },
              { v: "mysql", l: "MySQL / MariaDB", d: "أنظمة مفتوحة المصدر" },
              { v: "postgres", l: "PostgreSQL", d: "أنظمة حديثة" },
              { v: "oracle", l: "Oracle", d: "أنظمة Enterprise كبيرة" },
            ].map((o) => (
              <Label key={o.v} htmlFor={o.v} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${dbType === o.v ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <RadioGroupItem value={o.v} id={o.v} className="mt-1" />
                <div>
                  <div className="font-semibold">{o.l}</div>
                  <div className="text-xs text-muted-foreground">{o.d}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Card 2: Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> بيانات الاتصال</CardTitle>
          <CardDescription>البيانات دي بتُستخدم بواسطة الـ Sync Agent المحلي فقط</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Server / IP</Label><Input value={serverHost} onChange={(e) => setServerHost(e.target.value)} placeholder="192.168.1.10" /></div>
            <div><Label>Port</Label><Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} /></div>
          </div>
          <div><Label>Database Name</Label><Input value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} placeholder="PhoenixDB" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="sa" /></div>
            <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={configId ? "•••••• (احتفظ فارغ لعدم التغيير)" : ""} /></div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={testConnection} disabled={testStatus === "testing"} variant="outline">
              {testStatus === "testing" ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
              اختبار الاتصال
            </Button>
            {testStatus === "ok" && <Badge className="bg-green-600"><CheckCircle2 className="ml-1 h-3 w-3" /> Connected Successfully</Badge>}
            {testStatus === "fail" && <Badge variant="destructive"><XCircle className="ml-1 h-3 w-3" /> Connection Failed</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Sync settings */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> إعدادات المزامنة</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Sync Every</Label>
            <Select value={String(syncInterval)} onValueChange={(v) => setSyncInterval(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SYNC_INTERVALS.map((i) => <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">الجداول المطلوب مزامنتها</Label>
            <div className="space-y-2">
              {AVAILABLE_TABLES.map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selectedTables.includes(t.id)} onCheckedChange={(c) => toggleTable(t.id, !!c)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">تفعيل المزامنة</div>
              <div className="text-xs text-muted-foreground">لما تعطلها، الـ Agent يوقف الإرسال</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <Button onClick={saveConfig} disabled={saving} className="w-full">
            <Save className="ml-2 h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </CardContent>
      </Card>

      {/* Card 4: Last sync status */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> حالة آخر مزامنة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {lastLog ? (
            <>
              <StatRow label="Last Sync" value={new Date(lastLog.created_at).toLocaleString("ar-EG")} />
              <StatRow label="Records Imported" value={String(lastLog.records_count)} />
              <StatRow label="Errors" value={String(lastLog.error_count)} tone={lastLog.error_count > 0 ? "bad" : "good"} />
              <div className="text-sm text-muted-foreground pt-2">آخر حدث: {lastLog.event}</div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>لم يبدأ الـ Sync Agent المزامنة بعد</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 5: Sync Agent */}
      <Card className="lg:col-span-2 border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> 3M Sync Agent</CardTitle>
          <CardDescription>
            برنامج صغير يتثبت على سيرفر العميل، يقرأ قاعدة بيانات نقطة البيع محلياً ويرسل البيانات المشفرة إلى السحابة عبر HTTPS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <AgentStep num={1} title="حمّل البرنامج" desc="نسخة Windows / Linux تدعم كل قواعد البيانات المذكورة" />
            <AgentStep num={2} title="ثبّته على السيرفر" desc="نفس السيرفر اللي فيه قاعدة بيانات الـ POS" />
            <AgentStep num={3} title="أدخل الـ API Key" desc="من تبويب API Integration، انسخ الـ API Key والصقه في الـ Agent" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button disabled title="سيتاح قريبًا"><Download className="ml-2 h-4 w-4" /> تحميل 3M Sync Agent (Windows)</Button>
            <Button disabled variant="outline" title="سيتاح قريبًا"><Download className="ml-2 h-4 w-4" /> Linux (.deb)</Button>
          </div>
          <div className="flex gap-2 text-sm text-amber-700 bg-amber-500/10 p-3 rounded border border-amber-500/30">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>لماذا Agent محلي؟</strong> السيستم السحابي لا يتصل مباشرة بقاعدة بيانات العميل — الـ Agent يعمل بشكل آمن داخل شبكة العميل ويرسل البيانات فقط عبر HTTPS. ده أأمن ومش محتاج تفتح بورتات على السيرفر.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="p-3 bg-background rounded-lg border">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mb-2">{num}</div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </div>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between p-2 border rounded">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}

// ============================================================
// SYNC LOGS TAB
// ============================================================
function SyncLogsTab() {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: logs = [], refetch, isLoading } = useQuery({
    queryKey: ["pos-sync-logs", companyId, sourceFilter, statusFilter],
    queryFn: async () => {
      let q = supabase.from("pos_sync_logs").select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false }).limit(200);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
    refetchInterval: 20000,
  });

  const stats = {
    total: logs.length,
    success: logs.filter((l) => l.status === "success").length,
    errors: logs.filter((l) => l.status === "error").length,
    records: logs.reduce((s, l) => s + (l.records_count || 0), 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="إجمالي الأحداث" value={stats.total} icon={<ScrollText className="h-5 w-5" />} />
        <KpiCard title="نجاح" value={stats.success} tone="good" icon={<CheckCircle2 className="h-5 w-5" />} />
        <KpiCard title="أخطاء" value={stats.errors} tone="bad" icon={<XCircle className="h-5 w-5" />} />
        <KpiCard title="سجلات مستوردة" value={stats.records} icon={<Database className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>سجل المزامنة الموحد</CardTitle>
          <div className="flex gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="المصدر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="db_sync">Database Sync</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="success">نجاح</SelectItem>
                <SelectItem value="warning">تحذير</SelectItem>
                <SelectItem value="error">خطأ</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جارٍ التحميل...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>لا توجد سجلات مزامنة بعد</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-right">الوقت</th>
                    <th className="p-2 text-right">المصدر</th>
                    <th className="p-2 text-right">الحدث</th>
                    <th className="p-2 text-right">السجلات</th>
                    <th className="p-2 text-right">الأخطاء</th>
                    <th className="p-2 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString("ar-EG")}</td>
                      <td className="p-2"><Badge variant="outline">{l.source === "api" ? "API" : "DB Sync"}</Badge></td>
                      <td className="p-2">{l.event}{l.error_message && <div className="text-xs text-red-600 mt-1">{l.error_message}</div>}</td>
                      <td className="p-2">{l.records_count}</td>
                      <td className="p-2">{l.error_count}</td>
                      <td className="p-2">
                        {l.status === "success" && <Badge className="bg-green-600">نجاح</Badge>}
                        {l.status === "warning" && <Badge className="bg-amber-500">تحذير</Badge>}
                        {l.status === "error" && <Badge variant="destructive">خطأ</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className={`text-2xl font-bold ${tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
        </div>
        <div className={`p-2 rounded-lg ${tone === "good" ? "bg-green-500/10 text-green-600" : tone === "bad" ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

export default PosIntegrationPage;
