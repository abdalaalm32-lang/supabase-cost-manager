import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, ArrowRight, CheckCircle2, Lock, Mail,
  TrendingUp, ShieldCheck, BarChart3, Boxes, Sparkles, Target, PieChart, Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import logo3m from "@/assets/logo-3m.png";

type ResetStep = "email" | "otp" | "newPassword";

// ------- Feature slides shown on the right side (auto-rotate every 10s) -------
const SLIDES = [
  {
    icon: Sparkles,
    title: "3M CMS",
    subtitle: "Cost Management System",
    heading: "نظام متكامل لإدارة التكاليف ورقابة المستهلكات",
    body: "منصة ذكية تساعدك على التحكم الكامل في التكاليف ورقابة المستهلكات وتحليل الانحرافات بدقة عالية، مع تقارير تفاعلية ولوحات متابعة لحظية تدعم اتخاذ القرار وتحقق أعلى مستويات الربحية والكفاءة.",
    bullets: ["رقابة لحظية على التكاليف", "تحليل الانحرافات بدقة", "تقارير ومؤشرات تفصيلية", "دعم اتخاذ القرار بذكاء"],
  },
  {
    icon: BarChart3,
    title: "تحليل الانحرافات",
    subtitle: "Variance Analysis",
    heading: "اكتشف الفجوات قبل أن تتحول إلى خسائر",
    body: "قارن الاستهلاك الفعلي بالمعياري، وحدد أسباب الانحراف على مستوى كل خامة ومجموعة وقسم، مع تنبيهات ذكية على تجاوز الحدود المسموح بها.",
    bullets: ["مقارنة الفعلي بالمستهدف", "تصنيف تلقائي حسب الخطورة", "تنبيهات تجاوز النسب", "تصدير PDF احترافي"],
  },
  {
    icon: Boxes,
    title: "إدارة المخزون",
    subtitle: "Inventory Control",
    heading: "تحكم كامل في المخزون بين الفروع والمخازن",
    body: "متابعة أرصدة الخامات بدقة، جرد فوري، تحويلات بين المواقع، وحساب متوسط التكلفة المرجح تلقائياً لكل خامة على مستوى كل موقع.",
    bullets: ["أرصدة لحظية دقيقة", "جرد وتحويلات آمنة", "متوسط تكلفة مرجح", "مؤشرات حد الطلب"],
  },
  {
    icon: PieChart,
    title: "هندسة القوائم",
    subtitle: "Menu Engineering",
    heading: "طور قائمتك وضاعف هامش ربحك",
    body: "تحليل شامل للأصناف حسب الربحية والمبيعات لتحديد النجوم والألغاز والأحصنة والكلاب، مع توصيات لتحسين التسعير والقائمة.",
    bullets: ["تصنيف الأصناف تلقائياً", "حساب هامش الربح الحقيقي", "تحليل مصاريف غير مباشرة", "تقارير مقارنة بين الفترات"],
  },
  {
    icon: ShieldCheck,
    title: "أمان وموثوقية",
    subtitle: "Security & Reliability",
    heading: "بياناتك محمية بأعلى معايير الأمان",
    body: "عزل كامل بين الشركات، صلاحيات متعددة المستويات، نسخ احتياطي مستمر، ومصادقة آمنة تحمي بياناتك من أي وصول غير مصرح به.",
    bullets: ["عزل بيانات كل شركة", "صلاحيات دقيقة لكل مستخدم", "سجل عمليات كامل", "مصادقة ثنائية"],
  },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Force light theme on the login page only; restore previous on unmount
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [suspended, setSuspended] = useState(false);
  const [companyDeactivated, setCompanyDeactivated] = useState(false);

  // Carousel state
  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % SLIDES.length), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "company_deactivated") {
      setCompanyDeactivated(true);
      window.history.replaceState({}, "", "/login");
    }
    if (params.get("reason") === "user_suspended") {
      setSuspended(true);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuspended(false);
    setCompanyDeactivated(false);
    setLoading(true);
    try {
      await login(email, password);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status, company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.status === "موقف") {
          await supabase.auth.signOut();
          setSuspended(true);
          return;
        }
        const { data: company } = await supabase
          .from("companies")
          .select("active")
          .eq("id", profile?.company_id)
          .maybeSingle();
        if (company && !company.active) {
          await supabase.auth.signOut();
          setCompanyDeactivated(true);
          return;
        }
      }
    } catch (err: any) {
      setError(err.message || "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset-otp", { body: { email: resetEmail } });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      toast.success("تم إرسال كود التحقق إلى بريدك");
      setResetStep("otp");
    } catch (err: any) { setResetError(err.message); }
    finally { setResetLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (resetOtp.length !== 6) return;
    setResetError(""); setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-password-reset-otp", { body: { email: resetEmail, otp: resetOtp } });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      setResetStep("newPassword");
    } catch (err: any) { setResetError(err.message); }
    finally { setResetLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (newPassword.length < 6) { setResetError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { setResetError("كلمة المرور غير متطابقة"); return; }
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-password-reset-otp", { body: { email: resetEmail, otp: resetOtp, new_password: newPassword } });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      toast.success("تم تغيير كلمة المرور بنجاح");
      setShowForgot(false); setResetStep("email");
      setResetEmail(""); setResetOtp(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) { setResetError(err.message); }
    finally { setResetLoading(false); }
  };

  const resetForgotState = () => {
    setShowForgot(false); setResetStep("email");
    setResetEmail(""); setResetOtp(""); setNewPassword(""); setConfirmPassword("");
    setResetError("");
  };

  const currentSlide = SLIDES[slideIdx];
  const SlideIcon = currentSlide.icon;

  return (
    <div dir="rtl" className="min-h-screen w-full flex bg-white text-slate-900" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* ==================== LEFT: LOGIN FORM ==================== */}
      <div className="w-full lg:w-[46%] flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
        {/* soft decorative blobs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-gradient-to-br from-sky-100 to-transparent blur-3xl opacity-70" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100 to-transparent blur-3xl opacity-70" />

        <div className="relative w-full max-w-[440px]">
          {/* Logo */}
          <div className="text-center mb-6">
            <img src={logo3m} alt="3M CMS Logo" className="w-24 h-24 mx-auto mb-3 object-contain drop-shadow-md" />
            <h1
              className="text-2xl font-black tracking-tight bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-700 bg-clip-text text-transparent"
              style={{ fontFamily: "'Georgia', serif", letterSpacing: '0.03em' }}
            >
              Cost Management System
            </h1>
            <p className="text-xs text-slate-500 mt-2 font-medium">
              مرحباً بك في نظام إدارة التكاليف
            </p>
          </div>

          {/* Animated glowing frame wrapping the login card */}
          <div className="login-glow-frame">
            <div className="relative z-[2] bg-white rounded-[calc(1.25rem-2px)] p-6 sm:p-7">


          {!showForgot ? (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block px-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input required type="email" placeholder="email@example.com"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all outline-none"
                      dir="ltr" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block px-1">كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input required type="password" placeholder="••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all outline-none"
                      dir="ltr" />
                  </div>
                </div>

                {companyDeactivated && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-1">
                    <p className="text-red-700 text-sm font-bold">تم تعطيل الشركة</p>
                    <p className="text-red-600 text-xs">تواصل مع مدير النظام لإعادة تفعيل الشركة.</p>
                  </div>
                )}
                {suspended && !companyDeactivated && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-1">
                    <p className="text-red-700 text-sm font-bold">تم إيقاف حسابك من قبل الإدارة</p>
                    <p className="text-red-600 text-xs">تواصل مع مدير النظام لإعادة التفعيل.</p>
                  </div>
                )}
                {error && !suspended && !companyDeactivated && (
                  <p className="text-red-600 bg-red-50 p-2.5 rounded-xl text-sm border border-red-200 text-center">{error}</p>
                )}

                <button type="submit" disabled={loading}
                  className="w-full p-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-600 hover:via-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:translate-y-0">
                  {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تسجيل الدخول"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <button onClick={() => setShowForgot(true)}
                  className="text-xs text-slate-500 hover:text-sky-600 font-semibold transition-colors">
                  هل نسيت كلمة المرور؟
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={resetForgotState} className="text-slate-500 hover:text-sky-600 transition-colors">
                  <ArrowRight size={18} />
                </button>
                <h2 className="text-lg text-slate-800 font-bold">استعادة كلمة المرور</h2>
                <div className="w-5" />
              </div>

              <div className="flex items-center justify-center gap-2 mb-6">
                {(["email", "otp", "newPassword"] as ResetStep[]).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                      resetStep === step ? "bg-sky-500 text-white" :
                      (["email", "otp", "newPassword"].indexOf(resetStep) > i) ? "bg-sky-100 text-sky-600" :
                      "bg-slate-100 text-slate-400"
                    }`}>
                      {["email", "otp", "newPassword"].indexOf(resetStep) > i ? <CheckCircle2 size={14} /> : i + 1}
                    </div>
                    {i < 2 && <div className={`w-6 h-0.5 ${["email", "otp", "newPassword"].indexOf(resetStep) > i ? "bg-sky-300" : "bg-slate-200"}`} />}
                  </div>
                ))}
              </div>

              {resetStep === "email" && (
                <form onSubmit={handleSendResetOtp} className="space-y-4">
                  <p className="text-xs text-slate-500 text-center mb-2">أدخل البريد الإلكتروني المسجل في النظام</p>
                  <input required type="email" placeholder="email@example.com"
                    value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 focus:bg-white outline-none transition-all" dir="ltr" />
                  {resetError && <p className="text-red-600 bg-red-50 p-2.5 rounded-xl text-sm border border-red-200 text-center">{resetError}</p>}
                  <button type="submit" disabled={resetLoading}
                    className="w-full p-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "إرسال كود التحقق"}
                  </button>
                </form>
              )}

              {resetStep === "otp" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 text-center">تم إرسال كود مكون من 6 أرقام إلى<br /><span className="text-slate-800 font-semibold" dir="ltr">{resetEmail}</span></p>
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp}>
                      <InputOTPGroup>
                        {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">الكود صالح لمدة 5 دقائق</p>
                  {resetError && <p className="text-red-600 bg-red-50 p-2.5 rounded-xl text-sm border border-red-200 text-center">{resetError}</p>}
                  <button onClick={handleVerifyOtp} disabled={resetLoading || resetOtp.length !== 6}
                    className="w-full p-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تحقق من الكود"}
                  </button>
                </div>
              )}

              {resetStep === "newPassword" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <input required type="password" placeholder="كلمة المرور الجديدة" minLength={6}
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 focus:bg-white outline-none transition-all" dir="ltr" />
                  <input required type="password" placeholder="تأكيد كلمة المرور" minLength={6}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 focus:bg-white outline-none transition-all" dir="ltr" />
                  {resetError && <p className="text-red-600 bg-red-50 p-2.5 rounded-xl text-sm border border-red-200 text-center">{resetError}</p>}
                  <button type="submit" disabled={resetLoading}
                    className="w-full p-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تغيير كلمة المرور"}
                  </button>
                </form>
              )}
            </>
          )}
            </div>
          </div>



          {/* Footer signature */}
          <div className="mt-10 text-center">
            <p
              className="text-sm font-black tracking-wider bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-700 bg-clip-text text-transparent"
              style={{ fontFamily: "'Georgia', serif", letterSpacing: '0.12em' }}
            >
              Powered by Mohamed Abdel Aal
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <a href="https://www.facebook.com/share/1Ca76ypJkm/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1877F2] hover:scale-110 hover:shadow-lg hover:shadow-[#1877F2]/40 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/3m.cost.management.system?igsh=NzcyanppNWZicnM3" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 transition-all"
                style={{ background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              <a href="http://wa.me/201061208033" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#25D366] hover:scale-110 hover:shadow-lg hover:shadow-[#25D366]/40 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== RIGHT: HERO CAROUSEL ==================== */}
      <div className="hidden lg:flex w-[54%] relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, hsl(220,70%,10%) 0%, hsl(215,80%,18%) 40%, hsl(230,70%,22%) 100%)" }}>
        {/* animated background grid */}
        <div className="absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        {/* glowing orbs */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-sky-500/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-500/30 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-cyan-400/20 blur-3xl animate-pulse" style={{ animationDelay: "4s" }} />

        {/* content */}
        <div className="relative w-full flex flex-col justify-between p-12 xl:p-16 z-10">
          {/* top brand */}
          <div className="flex items-center gap-3">
            <img src={logo3m} alt="" className="w-14 h-14 object-contain drop-shadow-2xl" />
            <div>
              <div className="text-xl font-black tracking-tight">3M CMS</div>
              <div className="text-[11px] text-sky-200/80 tracking-widest" style={{ fontFamily: "'Georgia', serif" }}>COST MANAGEMENT SYSTEM</div>
            </div>
          </div>

          {/* slide content */}
          <div key={slideIdx} className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
              <SlideIcon size={16} className="text-sky-300" />
              <span className="text-xs font-bold tracking-wide">{currentSlide.subtitle}</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-black leading-tight text-white drop-shadow-lg">
              {currentSlide.heading}
            </h2>
            <p className="text-base xl:text-lg text-sky-100/90 leading-relaxed">
              {currentSlide.body}
            </p>
            <div className="grid grid-cols-2 gap-3 pt-4">
              {currentSlide.bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 hover:bg-white/10 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-500/30">
                    <CheckCircle2 size={14} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white/95">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* bottom: dots + stats */}
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: TrendingUp, label: "زيادة الكفاءة", value: "+35%" },
                { icon: Target, label: "دقة الرقابة", value: "99.9%" },
                { icon: Zap, label: "قرارات لحظية", value: "Realtime" },
              ].map((s, i) => (
                <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                  <s.icon size={20} className="text-sky-300 mb-2" />
                  <div className="text-xl font-black text-white">{s.value}</div>
                  <div className="text-[11px] text-sky-200/70 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* dots */}
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => setSlideIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === slideIdx ? "w-10 bg-gradient-to-r from-sky-400 to-indigo-400" : "w-4 bg-white/25 hover:bg-white/40"}`} />
              ))}
              <span className="ml-auto text-xs text-sky-200/60 font-mono">
                {String(slideIdx + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
