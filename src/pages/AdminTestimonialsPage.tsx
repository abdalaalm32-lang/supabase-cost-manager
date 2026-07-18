import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MessageSquareQuote, Plus, Pencil, Trash2, Upload, Image as ImageIcon } from "lucide-react";

type Testimonial = {
  id: string;
  restaurant_name: string;
  quote: string;
  logo_url: string | null;
  order_index: number;
  active: boolean;
};

const emptyForm = {
  id: "",
  restaurant_name: "",
  quote: "",
  logo_url: "" as string | null,
  order_index: 0,
  active: true,
};

export const AdminTestimonialsPage: React.FC = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["home-testimonials-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("home_testimonials")
        .select("*")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Testimonial[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const body: any = {
        restaurant_name: payload.restaurant_name.trim(),
        quote: payload.quote.trim(),
        logo_url: payload.logo_url || null,
        order_index: Number(payload.order_index) || 0,
        active: payload.active,
      };
      if (payload.id) {
        const { error } = await supabase.from("home_testimonials").update(body).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("home_testimonials").insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["home-testimonials-admin"] });
      qc.invalidateQueries({ queryKey: ["home-testimonials"] });
      setOpen(false);
      setForm({ ...emptyForm });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("home_testimonials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["home-testimonials-admin"] });
      qc.invalidateQueries({ queryKey: ["home-testimonials"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("testimonial-logos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      // Public bucket policy allows anon SELECT → getPublicUrl works.
      const { data } = supabase.storage.from("testimonial-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: data.publicUrl }));
      toast.success("تم رفع الشعار");
    } catch (e: any) {
      toast.error(e.message || "فشل الرفع");
    } finally {
      setUploading(false);
    }
  };

  const openNew = () => {
    setForm({ ...emptyForm, order_index: (rows[rows.length - 1]?.order_index ?? 0) + 1 });
    setOpen(true);
  };

  const openEdit = (row: Testimonial) => {
    setForm({
      id: row.id,
      restaurant_name: row.restaurant_name,
      quote: row.quote,
      logo_url: row.logo_url || "",
      order_index: row.order_index,
      active: row.active,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MessageSquareQuote size={28} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold">آراء عملائنا</h1>
            <p className="text-xs text-muted-foreground">تُعرض في الصفحة الرئيسية للنظام</p>
          </div>
        </div>
        <Button onClick={openNew} size="sm"><Plus size={14} /> إضافة رأي جديد</Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">الترتيب</TableHead>
              <TableHead className="text-center">الشعار</TableHead>
              <TableHead className="text-center">اسم المطعم / الكافيه</TableHead>
              <TableHead className="text-center">الرأي</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد آراء بعد. أضف أول رأي.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-center font-mono">{r.order_index}</TableCell>
                <TableCell className="text-center">
                  {r.logo_url ? (
                    <img src={r.logo_url} alt={r.restaurant_name} className="h-12 w-12 object-contain rounded mx-auto bg-white p-1 border" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center mx-auto text-muted-foreground"><ImageIcon size={16} /></div>
                  )}
                </TableCell>
                <TableCell className="text-center font-medium">{r.restaurant_name}</TableCell>
                <TableCell className="text-center max-w-md text-sm text-muted-foreground truncate" title={r.quote}>{r.quote}</TableCell>
                <TableCell className="text-center">
                  {r.active ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-500">مفعّل</span> : <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-500/15 text-slate-500">مخفي</span>}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل الرأي" : "إضافة رأي جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم المطعم / الكافيه *</label>
              <Input value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} placeholder="مثال: مطعم القاهرة" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">نص الرأي *</label>
              <Textarea value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} placeholder="اكتب رأي العميل هنا..." rows={4} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">شعار المطعم</label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" className="h-16 w-16 object-contain rounded bg-white p-1 border" />
                ) : (
                  <div className="h-16 w-16 rounded bg-muted flex items-center justify-center text-muted-foreground"><ImageIcon size={20} /></div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload size={14} /> {uploading ? "جاري الرفع..." : (form.logo_url ? "تغيير الشعار" : "رفع شعار")}
                </Button>
                {form.logo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>إزالة</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">أو الصق رابط الصورة مباشرة:</p>
              <Input className="mt-1" value={form.logo_url || ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">ترتيب العرض</label>
                <Input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })} />
              </div>
              <div className="flex flex-col justify-end">
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  <span className="text-sm">{form.active ? "مفعّل" : "مخفي"}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => upsert.mutate(form)} disabled={upsert.isPending || !form.restaurant_name.trim() || !form.quote.trim()}>
              {upsert.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذا الرأي؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteId && del.mutate(deleteId)} disabled={del.isPending}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTestimonialsPage;
