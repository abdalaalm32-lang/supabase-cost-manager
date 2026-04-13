import React, { useState } from "react";
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuspended(false);
    setLoading(true);
    try {
      await login(email, password);
      // Check profile status after login
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status")
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
                {suspended && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center space-y-2">
                    <p className="text-destructive text-sm font-bold">تم إيقاف حسابك من قبل الإدارة.</p>
                    <p className="text-destructive/80 text-xs">لا يمكنك الوصول إلى النظام حالياً.</p>
                    <p className="text-muted-foreground text-xs">تواصل مع مدير النظام لإعادة تفعيل حسابك.</p>
                  </div>
                )}
                {error && !suspended && (
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
          </div>
        </div>
      </div>
    </div>
  );
};
