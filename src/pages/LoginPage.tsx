import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowRight, CheckCircle2, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import loginBg from "@/assets/login-bg.jpg";
import logo3m from "@/assets/logo-3m.png";

type ResetStep = "email" | "otp" | "newPassword";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  // Check URL param for company deactivation redirect
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
      // Check profile status after login
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
        // Check if company is active
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
      const { data, error } = await supabase.functions.invoke("send-password-reset-otp", {
        body: { email: resetEmail },
      });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      toast.success("تم إرسال كود التحقق إلى بريدك");
      setResetStep("otp");
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (resetOtp.length !== 6) return;
    setResetError("");
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-password-reset-otp", {
        body: { email: resetEmail, otp: resetOtp },
      });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      setResetStep("newPassword");
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (newPassword.length < 6) {
      setResetError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("كلمة المرور غير متطابقة");
      return;
    }
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-password-reset-otp", {
        body: { email: resetEmail, otp: resetOtp, new_password: newPassword },
      });
      if (error) throw new Error("فشل الاتصال بالسيرفر");
      if (data?.error) throw new Error(data.error);
      toast.success("تم تغيير كلمة المرور بنجاح");
      setShowForgot(false);
      setResetStep("email");
      setResetEmail("");
      setResetOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const resetForgotState = () => {
    setShowForgot(false);
    setResetStep("email");
    setResetEmail("");
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      {/* Background image */}
      <img
        src={loginBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Blue blur overlay */}
      <div className="absolute inset-0 bg-[hsl(220,60%,8%)]/75 backdrop-blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,40%)]/15 via-transparent to-[hsl(260,60%,30%)]/10" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="bg-card/60 backdrop-blur-2xl border border-border/30 rounded-3xl shadow-2xl shadow-black/40 p-8 sm:p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src={logo3m} alt="3M GSC Logo" className="w-36 h-36 mx-auto mb-3 object-contain drop-shadow-lg" />
            <p className="text-sm text-primary/80 mt-1 italic font-semibold tracking-wide" style={{ fontFamily: "'Georgia', serif", letterSpacing: '0.12em' }}>
              Cost Management System
            </p>
          </div>

          {!showForgot ? (
            <>
              <form onSubmit={handleLogin} className="space-y-5 text-right">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground block px-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={16} />
                    <input
                      required type="email" placeholder="email@example.com"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-3 pl-10 bg-muted/30 border border-border/40 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" dir="ltr"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground block px-1">كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={16} />
                    <input
                      required type="password" placeholder="••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full p-3 pl-10 bg-muted/30 border border-border/40 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" dir="ltr"
                    />
                  </div>
                </div>
                {companyDeactivated && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center space-y-2">
                    <p className="text-destructive text-sm font-bold">تم تعطيل الشركة</p>
                    <p className="text-destructive/80 text-xs">تم تعطيل شركتك من خلال الإدارة. لا يمكنك الوصول إلى النظام حالياً.</p>
                    <p className="text-muted-foreground text-xs">تواصل مع مدير النظام لإعادة تفعيل الشركة.</p>
                  </div>
                )}
                {suspended && !companyDeactivated && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center space-y-2">
                    <p className="text-destructive text-sm font-bold">تم إيقاف حسابك من قبل الإدارة.</p>
                    <p className="text-destructive/80 text-xs">لا يمكنك الوصول إلى النظام حالياً.</p>
                    <p className="text-muted-foreground text-xs">تواصل مع مدير النظام لإعادة تفعيل حسابك.</p>
                  </div>
                )}
                {error && !suspended && !companyDeactivated && (
                  <p className="text-destructive bg-destructive/10 p-2.5 rounded-xl text-sm border border-destructive/20 text-center">
                    {error}
                  </p>
                )}
                <button
                  type="submit" disabled={loading}
                  className="w-full p-3.5 rounded-xl font-bold text-sm gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تسجيل الدخول"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <span
                  className="text-xs text-muted-foreground/70 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setShowForgot(true)}
                >
                  هل نسيت كلمة المرور؟
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={resetForgotState} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowRight size={18} />
                </button>
                <h2 className="text-lg text-primary font-bold">استعادة كلمة المرور</h2>
                <div className="w-5" />
              </div>

              {/* Step indicators */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {(["email", "otp", "newPassword"] as ResetStep[]).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                      resetStep === step ? "bg-primary text-primary-foreground" :
                      (["email", "otp", "newPassword"].indexOf(resetStep) > i) ? "bg-primary/20 text-primary" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {["email", "otp", "newPassword"].indexOf(resetStep) > i ? <CheckCircle2 size={14} /> : i + 1}
                    </div>
                    {i < 2 && <div className={`w-6 h-0.5 ${["email", "otp", "newPassword"].indexOf(resetStep) > i ? "bg-primary/40" : "bg-muted"}`} />}
                  </div>
                ))}
              </div>

              {resetStep === "email" && (
                <form onSubmit={handleSendResetOtp} className="space-y-4 text-right">
                  <p className="text-xs text-muted-foreground text-center mb-2">أدخل البريد الإلكتروني المسجل في النظام</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block px-1">البريد الإلكتروني</label>
                    <input
                      required type="email" placeholder="email@example.com"
                      value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full p-3 bg-muted/30 border border-border/40 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" dir="ltr"
                    />
                  </div>
                  {resetError && (
                    <p className="text-destructive bg-destructive/10 p-2.5 rounded-xl text-sm border border-destructive/20 text-center">{resetError}</p>
                  )}
                  <button
                    type="submit" disabled={resetLoading}
                    className="w-full p-3.5 rounded-xl font-bold text-sm gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50"
                  >
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "إرسال كود التحقق"}
                  </button>
                </form>
              )}

              {resetStep === "otp" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground text-center">تم إرسال كود مكون من 6 أرقام إلى<br /><span className="text-foreground font-semibold" dir="ltr">{resetEmail}</span></p>
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">الكود صالح لمدة 5 دقائق</p>
                  {resetError && (
                    <p className="text-destructive bg-destructive/10 p-2.5 rounded-xl text-sm border border-destructive/20 text-center">{resetError}</p>
                  )}
                  <button
                    onClick={handleVerifyOtp} disabled={resetLoading || resetOtp.length !== 6}
                    className="w-full p-3.5 rounded-xl font-bold text-sm gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50"
                  >
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تحقق من الكود"}
                  </button>
                </div>
              )}

              {resetStep === "newPassword" && (
                <form onSubmit={handleResetPassword} className="space-y-4 text-right">
                  <p className="text-xs text-muted-foreground text-center mb-2">أدخل كلمة المرور الجديدة</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block px-1">كلمة المرور الجديدة</label>
                    <input
                      required type="password" placeholder="••••••••" minLength={6}
                      value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-3 bg-muted/30 border border-border/40 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block px-1">تأكيد كلمة المرور</label>
                    <input
                      required type="password" placeholder="••••••••" minLength={6}
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full p-3 bg-muted/30 border border-border/40 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" dir="ltr"
                    />
                  </div>
                  {resetError && (
                    <p className="text-destructive bg-destructive/10 p-2.5 rounded-xl text-sm border border-destructive/20 text-center">{resetError}</p>
                  )}
                  <button
                    type="submit" disabled={resetLoading}
                    className="w-full p-3.5 rounded-xl font-bold text-sm gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50"
                  >
                    {resetLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "تغيير كلمة المرور"}
                  </button>
                </form>
              )}
            </>
          )}

          <div className="mt-8 text-center">
            <span className="text-[11px] text-muted-foreground/50 font-semibold tracking-[0.15em]" style={{ fontFamily: "'Cairo', sans-serif", letterSpacing: '0.18em' }}>
              Powered by <span className="text-primary/60 font-bold">Mohamed Abdel Aal</span>
            </span>
            <div className="flex items-center justify-center gap-3 mt-4">
              <a
                href="https://www.facebook.com/share/1Ca76ypJkm/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1877F2] hover:scale-110 hover:shadow-lg hover:shadow-[#1877F2]/40 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a
                href="https://www.instagram.com/3m.cost.management.system?igsh=NzcyanppNWZicnM3"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 hover:shadow-lg hover:shadow-pink-500/40 transition-all"
                style={{ background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              <a
                href="http://wa.me/201061208033"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#25D366] hover:scale-110 hover:shadow-lg hover:shadow-[#25D366]/40 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
