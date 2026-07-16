import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import logo3m from "@/assets/logo-3m.png";

const BRAND_BLUE = "hsl(220, 70%, 20%)";
const BRAND_GREEN = "hsl(160, 65%, 40%)";
const WHATSAPP = "https://wa.me/201061208033";

export const TrialSignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<null | { email: string; trialEnd: string }>(null);
  const [form, setForm] = useState({
    restaurant_name: "",
    contact_name: "",
    phone: "",
    whatsapp: "",
    email: "",
    password: "",
    city: "",
    branches_count: 1,
    current_system: "no",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!form.restaurant_name || !form.contact_name || !form.phone || !form.email || !form.password) {
      toast.error("من فضلك أكمل الحقول الأساسية");
      return;
    }
    if (form.password.length < 6) {
      toast.error("كلمة السر لا تقل عن 6 أحرف");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-trial-company", {
        body: form,
      });
      if (error) {
        const msg = (error as any)?.message || "فشل إنشاء الحساب";
        toast.error(msg);
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        if ((data as any).fields) setErrors((data as any).fields);
        return;
      }
      setSuccess({ email: form.email, trialEnd: (data as any).trial_end_date });
      toast.success("تم إنشاء التجربة المجانية بنجاح");
    } catch (err: any) {
      toast.error(err?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-slate-200">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">تم تفعيل تجربتك المجانية!</h1>
          <p className="text-slate-600 mb-6">لديك 14 يوم للاستخدام الكامل للنظام</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-right">
            <div className="text-xs text-slate-500 mb-1">البريد الإلكتروني للدخول:</div>
            <div className="font-bold text-slate-900 mb-3">{success.email}</div>
            <div className="text-xs text-slate-500 mb-1">تنتهي التجربة في:</div>
            <div className="font-bold text-emerald-700">{new Date(success.trialEnd).toLocaleDateString("ar-EG")}</div>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-3 rounded-xl font-black text-white shadow-lg"
            style={{ background: BRAND_GREEN }}
          >
            سجل الدخول الآن
          </button>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800"
          >
            <MessageCircle size={16} /> تحتاج مساعدة؟ تواصل عبر واتساب
          </a>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo3m} alt="3M CMS" className="h-10 w-10" />
            <span className="font-black text-lg text-slate-900">3M CMS</span>
          </Link>
          <Link to="/login" className="text-sm font-bold text-slate-700 hover:text-emerald-700">
            لديك حساب؟ سجل الدخول
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 grid lg:grid-cols-2 gap-10">
        {/* Left side: benefits */}
        <div className="lg:pr-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 mb-4">
            تجربة مجانية 14 يوم — بدون بطاقة ائتمان
          </span>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 leading-tight mb-4">
            ابدأ تجربتك المجانية الآن
          </h1>
          <p className="text-slate-600 leading-relaxed mb-8">
            سجل بياناتك واحصل على وصول كامل لجميع مميزات نظام 3M CMS لمدة 14 يوم بدون أي التزامات.
          </p>
          <ul className="space-y-3 text-slate-700">
            {[
              "وصول كامل لجميع الوحدات (المخزون، الإنتاج، التكاليف، التقارير)",
              "حتى فرعين ومخزن ومستخدمين 5 أثناء التجربة",
              "دعم فني كامل عبر واتساب",
              "بدون بطاقة ائتمان أو رسوم مسبقة",
              "تفعيل فوري خلال ثوان",
            ].map((s) => (
              <li key={s} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">هل تحتاج مساعدة؟</p>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-2">
              <MessageCircle size={16} /> +20 106 120 8033 (واتساب)
            </a>
          </div>
        </div>

        {/* Right side: form */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 lg:p-8">
          <h2 className="text-xl font-black text-slate-900 mb-6">بيانات التسجيل</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="اسم المطعم / الكافيه *" value={form.restaurant_name} onChange={(v) => set("restaurant_name", v)} error={errors.restaurant_name} />
              <Field label="اسم المسؤول *" value={form.contact_name} onChange={(v) => set("contact_name", v)} error={errors.contact_name} />
              <Field label="رقم الموبايل *" value={form.phone} onChange={(v) => set("phone", v)} error={errors.phone} placeholder="01xxxxxxxxx" />
              <Field label="واتساب (لو مختلف)" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} placeholder="01xxxxxxxxx" />
              <Field label="البريد الإلكتروني *" value={form.email} onChange={(v) => set("email", v)} error={errors.email} type="email" placeholder="you@example.com" />
              <Field label="كلمة السر *" value={form.password} onChange={(v) => set("password", v)} error={errors.password} type="password" placeholder="6 أحرف على الأقل" />
              <Field label="المدينة" value={form.city} onChange={(v) => set("city", v)} placeholder="القاهرة / طنطا / ..." />
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">عدد الفروع</label>
                <input
                  type="number"
                  min={1}
                  value={form.branches_count}
                  onChange={(e) => set("branches_count", Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">هل تستخدم نظام إدارة حالياً؟</label>
              <select
                value={form.current_system}
                onChange={(e) => set("current_system", e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition bg-white"
              >
                <option value="no">لا، أول نظام</option>
                <option value="excel">Excel / يدوي</option>
                <option value="pos_only">نظام POS فقط</option>
                <option value="erp">نظام ERP آخر</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-white text-lg shadow-xl shadow-emerald-500/25 hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: BRAND_GREEN }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowLeft size={18} />}
              {loading ? "جاري إنشاء التجربة..." : "ابدأ التجربة المجانية"}
            </button>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              بالضغط على الزر، أنت توافق على تلقي تواصل من فريق المبيعات عبر الواتساب أو الهاتف بخصوص تجربتك.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, error, type = "text", placeholder }) => (
  <div>
    <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-4 py-2.5 rounded-xl border bg-white text-slate-900 placeholder:text-slate-400 ${error ? "border-red-400" : "border-slate-300"} focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition`}
    />
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

export default TrialSignupPage;
