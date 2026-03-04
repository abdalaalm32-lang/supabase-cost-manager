import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";

type ResetStep = "email" | "otp" | "newPassword";

export const LoginPage: React.FC<{ onCreateCompany: () => void }> = ({ onCreateCompany }) => {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
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
      // Reset all state and go back to login
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
    <div className="min-h-screen w-full flex items-center justify-center gradient-bg relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[300px] h-[300px] rounded-full bg-secondary/5 blur-3xl" />

      <div className="glass-card p-10 w-full max-w-[440px] text-center relative z-10 animate-fade-in-up">
        <div className="mb-2">
          <h1 className="text-4xl font-black mb-1 leading-none tracking-tight text-gradient">
            3M GSC
          </h1>
          <div className="text-sm text-muted-foreground font-semibold mb-6 border-b border-border/30 pb-4 mx-auto">
            تحليل وترتيب كل مصروفاتك في مكان واحد
          </div>
        </div>

        {!showForgot ? (
          <>
            <h2 className="text-2xl mb-6 text-primary font-bold">تسجيل الدخول</h2>
            <form onSubmit={handleLogin} className="space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground block px-1">البريد الإلكتروني</label>
                <input
                  required type="email" placeholder="email@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 glass-input text-sm" dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground block px-1">كلمة المرور</label>
                <input
                  required type="password" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 glass-input text-sm" dir="ltr"
                />
              </div>
              {error && (
                <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                  {error}
                </p>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "تسجيل الدخول"}
              </button>
            </form>

            <div className="mt-4 text-sm text-muted-foreground">
              <span
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => setShowForgot(true)}
              >
                هل نسيت كلمة المرور؟
              </span>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              <span
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={onCreateCompany}
              >
                إنشاء شركة جديدة
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <button onClick={resetForgotState} className="text-muted-foreground hover:text-primary transition-colors">
                <ArrowRight size={20} />
              </button>
              <h2 className="text-xl text-primary font-bold">استعادة كلمة المرور</h2>
              <div className="w-5" />
            </div>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {(["email", "otp", "newPassword"] as ResetStep[]).map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    resetStep === step ? "bg-primary text-primary-foreground" :
                    (["email", "otp", "newPassword"].indexOf(resetStep) > i) ? "bg-primary/20 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {["email", "otp", "newPassword"].indexOf(resetStep) > i ? <CheckCircle2 size={16} /> : i + 1}
                  </div>
                  {i < 2 && <div className={`w-8 h-0.5 ${["email", "otp", "newPassword"].indexOf(resetStep) > i ? "bg-primary/40" : "bg-muted"}`} />}
                </div>
              ))}
            </div>

            {resetStep === "email" && (
              <form onSubmit={handleSendResetOtp} className="space-y-4 text-right">
                <p className="text-sm text-muted-foreground text-center mb-2">أدخل البريد الإلكتروني المسجل في النظام</p>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground block px-1">البريد الإلكتروني</label>
                  <input
                    required type="email" placeholder="email@example.com"
                    value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full p-3 glass-input text-sm" dir="ltr"
                  />
                </div>
                {resetError && (
                  <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                    {resetError}
                  </p>
                )}
                <button
                  type="submit" disabled={resetLoading}
                  className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
                >
                  {resetLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "إرسال كود التحقق"}
                </button>
              </form>
            )}

            {resetStep === "otp" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">تم إرسال كود مكون من 6 أرقام إلى<br /><span className="text-foreground font-semibold" dir="ltr">{resetEmail}</span></p>
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
                <p className="text-xs text-muted-foreground text-center">الكود صالح لمدة 5 دقائق</p>
                {resetError && (
                  <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                    {resetError}
                  </p>
                )}
                <button
                  onClick={handleVerifyOtp} disabled={resetLoading || resetOtp.length !== 6}
                  className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
                >
                  {resetLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "تحقق من الكود"}
                </button>
              </div>
            )}

            {resetStep === "newPassword" && (
              <form onSubmit={handleResetPassword} className="space-y-4 text-right">
                <p className="text-sm text-muted-foreground text-center mb-2">أدخل كلمة المرور الجديدة</p>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground block px-1">كلمة المرور الجديدة</label>
                  <input
                    required type="password" placeholder="••••••••" minLength={6}
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-3 glass-input text-sm" dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground block px-1">تأكيد كلمة المرور</label>
                  <input
                    required type="password" placeholder="••••••••" minLength={6}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 glass-input text-sm" dir="ltr"
                  />
                </div>
                {resetError && (
                  <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                    {resetError}
                  </p>
                )}
                <button
                  type="submit" disabled={resetLoading}
                  className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
                >
                  {resetLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "تغيير كلمة المرور"}
                </button>
              </form>
            )}
          </>
        )}

        <div className="mt-8 text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest">
          POWERED BY MOHAMED ABDELAAL
        </div>
      </div>
    </div>
  );
};
