/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info, Download } from "lucide-react";

type PosType = "generic" | "foodics" | "odoo" | "simphony";

// Preset column mappings for known POS systems.
const PRESETS: Record<PosType, { label: string; mapping: Record<string, string[]> }> = {
  generic: {
    label: "ملف Excel/CSV مخصص",
    mapping: {
      code: ["code", "sku", "item_code", "كود", "كود الصنف", "product_code"],
      name: ["name", "item_name", "product", "اسم الصنف", "الصنف"],
      quantity: ["qty", "quantity", "الكمية", "كمية"],
      unit_price: ["price", "unit_price", "السعر", "سعر الوحدة"],
      date: ["date", "sale_date", "التاريخ", "invoice_date"],
    },
  },
  foodics: {
    label: "Foodics",
    mapping: {
      code: ["Product SKU", "sku", "product_sku"],
      name: ["Product Name", "product_name"],
      quantity: ["Quantity Sold", "quantity"],
      unit_price: ["Unit Price", "price"],
      date: ["Date", "business_date"],
    },
  },
  odoo: {
    label: "Odoo POS",
    mapping: {
      code: ["Internal Reference", "default_code"],
      name: ["Product", "name"],
      quantity: ["Quantity", "qty"],
      unit_price: ["Unit Price", "price_unit"],
      date: ["Order Date", "date_order"],
    },
  },
  simphony: {
    label: "Oracle Simphony",
    mapping: {
      code: ["Menu Item Number", "mi_num"],
      name: ["Menu Item Name", "mi_name"],
      quantity: ["Sold Quantity", "sales_count"],
      unit_price: ["Menu Item Price", "unit_price"],
      date: ["Business Date", "biz_date"],
    },
  },
};

const FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "code", label: "كود الصنف", required: true },
  { key: "name", label: "اسم الصنف" },
  { key: "quantity", label: "الكمية", required: true },
  { key: "unit_price", label: "سعر الوحدة" },
  { key: "date", label: "التاريخ" },
];

function autoDetect(header: string, candidates: string[]) {
  const h = header.trim().toLowerCase();
  return candidates.some((c) => h === c.toLowerCase() || h.includes(c.toLowerCase()));
}

function parseExcelDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function PosImportPage() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [posType, setPosType] = useState<PosType>("generic");
  const [branchId, setBranchId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>("");
  const [defaultDate, setDefaultDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data: branches } = useQuery({
    queryKey: ["branches-for-import", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: posItems } = useQuery({
    queryKey: ["pos-items-for-import", companyId, branchId],
    queryFn: async () => {
      let q = supabase.from("pos_items").select("id, code, name, price, branch_id").eq("company_id", companyId!);
      if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const itemsIndex = useMemo(() => {
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    (posItems || []).forEach((it: any) => {
      if (it.code) byCode.set(String(it.code).trim().toLowerCase(), it);
      if (it.name) byName.set(String(it.name).trim().toLowerCase(), it);
    });
    return { byCode, byName };
  }, [posItems]);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
        if (!json.length) { toast.error("الملف فارغ"); return; }
        const hdrs = Object.keys(json[0]);
        setHeaders(hdrs);
        setRows(json);

        // Auto-map based on preset
        const preset = PRESETS[posType].mapping;
        const newMap: Record<string, string> = {};
        FIELDS.forEach(({ key }) => {
          const cands = preset[key] || [];
          const found = hdrs.find((h) => autoDetect(h, cands));
          if (found) newMap[key] = found;
        });
        setMapping(newMap);
        toast.success(`تم قراءة ${json.length} سجل من الملف`);
      } catch (err: any) {
        toast.error("فشل قراءة الملف: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parsed = useMemo(() => {
    if (!rows.length || !mapping.code || !mapping.quantity) return [];
    return rows.map((r, idx) => {
      const code = String(r[mapping.code] ?? "").trim();
      const name = mapping.name ? String(r[mapping.name] ?? "").trim() : "";
      const qty = Number(r[mapping.quantity]) || 0;
      const price = mapping.unit_price ? Number(r[mapping.unit_price]) || 0 : 0;
      const dt = mapping.date ? parseExcelDate(r[mapping.date]) : null;
      const match =
        itemsIndex.byCode.get(code.toLowerCase()) ||
        (name ? itemsIndex.byName.get(name.toLowerCase()) : null);
      return {
        idx,
        code,
        name,
        qty,
        price,
        date: dt || new Date(defaultDate),
        matched: !!match,
        pos_item_id: match?.id || null,
        matched_name: match?.name || null,
        fallback_price: match?.price || 0,
      };
    });
  }, [rows, mapping, itemsIndex, defaultDate]);

  const matchedCount = parsed.filter((p) => p.matched && p.qty > 0).length;
  const unmatchedCount = parsed.filter((p) => !p.matched).length;
  const totalQty = parsed.reduce((s, p) => s + (p.matched ? p.qty : 0), 0);
  const totalValue = parsed.reduce((s, p) => s + (p.matched ? p.qty * (p.price || p.fallback_price) : 0), 0);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      if (!branchId) throw new Error("اختر الفرع أولاً");
      const valid = parsed.filter((p) => p.matched && p.qty > 0 && p.pos_item_id);
      if (!valid.length) throw new Error("لا توجد أصناف مطابقة للاستيراد");

      // Group by date (yyyy-mm-dd) into one invoice per day
      const groups = new Map<string, typeof valid>();
      valid.forEach((p) => {
        const key = p.date.toISOString().slice(0, 10);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      });

      let created = 0;
      for (const [dateKey, items] of groups) {
        const total = items.reduce((s, i) => s + i.qty * (i.price || i.fallback_price), 0);
        const { data: invoiceNum, error: numErr } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
        if (numErr) throw numErr;
        const { data: sale, error: saleErr } = await supabase.from("pos_sales").insert({
          company_id: companyId,
          branch_id: branchId,
          invoice_number: invoiceNum,
          date: new Date(dateKey + "T12:00:00").toISOString(),
          total_amount: total,
          status: "مكتمل",
          order_type: "تيك اواي",
          payment_method: "كاش",
          tax_enabled: false,
          tax_rate: 0,
          tax_amount: 0,
          discount_amount: 0,
          notes: `مستورد من ${PRESETS[posType].label} — ${fileName}`,
        } as any).select().single();
        if (saleErr) throw saleErr;

        const saleItems = items.map((i) => ({
          sale_id: sale.id,
          pos_item_id: i.pos_item_id!,
          quantity: i.qty,
          unit_price: i.price || i.fallback_price,
          total: i.qty * (i.price || i.fallback_price),
          notes: null,
        }));
        const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItems);
        if (itemsErr) throw itemsErr;
        created++;
      }
      return created;
    },
    onSuccess: (count) => {
      toast.success(`تم استيراد ${count} فاتورة بنجاح`);
      setRows([]); setHeaders([]); setMapping({}); setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
    },
    onError: (e: any) => toast.error(e.message || "فشل الاستيراد"),
  });

  const downloadTemplate = () => {
    const template = [
      { code: "ITM_001", name: "برجر كلاسيك", quantity: 5, unit_price: 85, date: "2026-07-19" },
      { code: "ITM_002", name: "بيبسي 330 مل", quantity: 12, unit_price: 15, date: "2026-07-19" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "POS Sales");
    XLSX.writeFile(wb, "pos-import-template.xlsx");
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
            استيراد مبيعات POS
          </h1>
          <p className="text-muted-foreground mt-1">استيراد فواتير المبيعات من ملف Excel أو CSV صادر من نظام نقطة البيع لديك</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} className="gap-2">
          <Download className="w-4 h-4" /> تحميل قالب فارغ
        </Button>
      </div>

      {/* Step 1: settings */}
      <Card>
        <CardHeader>
          <CardTitle>1. إعدادات الاستيراد</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>نوع نظام POS</Label>
            <Select value={posType} onValueChange={(v) => setPosType(v as PosType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الفرع <span className="text-destructive">*</span></Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                {(branches || []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>التاريخ الافتراضي (لو مش موجود في الملف)</Label>
            <Input type="date" value={defaultDate} onChange={(e) => setDefaultDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: upload */}
      <Card>
        <CardHeader>
          <CardTitle>2. رفع الملف</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="max-w-md"
            />
            {fileName && <Badge variant="secondary" className="gap-1"><Upload className="w-3 h-3" /> {fileName}</Badge>}
          </div>
          {!rows.length && (
            <Alert className="mt-4">
              <Info className="w-4 h-4" />
              <AlertDescription>
                يدعم النظام ملفات <b>.xlsx</b>, <b>.xls</b>, و <b>.csv</b>. سيتم قراءة أول ورقة (Sheet) من الملف.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 3: mapping */}
      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. مطابقة الأعمدة</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label>
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                <Select
                  value={mapping[f.key] || "__none__"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— لا يوجد —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 4: preview */}
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>4. معاينة النتائج</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card className="border-l-4 border-l-primary">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">إجمالي السجلات</div>
                  <div className="text-2xl font-bold">{parsed.length}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">مطابقة</div>
                  <div className="text-2xl font-bold text-green-600">{matchedCount}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">غير مطابقة</div>
                  <div className="text-2xl font-bold text-red-600">{unmatchedCount}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">إجمالي القيمة (المطابقة)</div>
                  <div className="text-2xl font-bold text-blue-600">{totalValue.toFixed(2)} <span className="text-sm">ج.م</span></div>
                  <div className="text-xs text-muted-foreground mt-1">كمية: {totalQty}</div>
                </CardContent>
              </Card>
            </div>

            {unmatchedCount > 0 && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>يوجد {unmatchedCount} صنف غير مطابق</AlertTitle>
                <AlertDescription>
                  الأصناف غير المطابقة لن يتم استيرادها ولن تؤثر على المخزون. تأكد من تطابق أكواد أو أسماء الأصناف مع بيانات نظامك.
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-96 overflow-auto border rounded">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">الاسم بالملف</TableHead>
                    <TableHead className="text-center">الاسم بالنظام</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-center">السعر</TableHead>
                    <TableHead className="text-center">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 200).map((p) => (
                    <TableRow key={p.idx} className={!p.matched ? "bg-destructive/5" : ""}>
                      <TableCell className="text-center">
                        {p.matched ? (
                          <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3" /></Badge>
                        ) : (
                          <Badge variant="destructive"><AlertCircle className="w-3 h-3" /></Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">{p.code || "—"}</TableCell>
                      <TableCell className="text-center">{p.name || "—"}</TableCell>
                      <TableCell className="text-center">{p.matched_name || <span className="text-destructive">لم يتم العثور</span>}</TableCell>
                      <TableCell className="text-center">{p.qty}</TableCell>
                      <TableCell className="text-center">{(p.price || p.fallback_price).toFixed(2)}</TableCell>
                      <TableCell className="text-center text-xs">{p.date.toISOString().slice(0, 10)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsed.length > 200 && (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  عرض 200 سجل من {parsed.length}. كل السجلات المطابقة سيتم استيرادها.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRows([]); setHeaders([]); setMapping({}); setFileName(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                إلغاء
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!branchId || matchedCount === 0 || importMutation.isPending}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                {importMutation.isPending ? "جاري الاستيراد..." : `استيراد ${matchedCount} صنف`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How-to */}
      <Card>
        <CardHeader>
          <CardTitle>ملاحظات مهمة</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pr-5 space-y-2 text-sm text-muted-foreground">
            <li>يتم تجميع كل الأصناف بنفس التاريخ في فاتورة واحدة داخل النظام (لتقليل عدد الفواتير في التقارير).</li>
            <li>الأصناف تُطابق أولاً بالكود، ثم بالاسم عند عدم وجود تطابق.</li>
            <li>الفواتير المستوردة تظهر في <b>سجل الفواتير</b> وتخصم المخزون تلقائياً بنفس منطق البيع اليدوي (عبر الوصفات).</li>
            <li>حالة الفواتير المستوردة تكون <b>مكتمل</b> ونوع الطلب <b>تيك اواي</b> بشكل افتراضي.</li>
            <li>لا يمكن استيراد نفس الملف مرتين — راجع سجل الفواتير قبل إعادة الرفع لتفادي التكرار.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
