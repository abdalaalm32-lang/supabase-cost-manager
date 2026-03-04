import React, { useState } from "react";
import { Loader2, ArrowRight, Mail, ShieldCheck, Building2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";

type Step = "admin-verify" | "otp" | "company-form" | "success";

export const CreateCompanyPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [step, setStep] = useState<Step>("admin-verify");
  const [adminEmail, setAdminEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-registration-otp", {
        body: { admin_email: adminEmail },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-otp-register", {
        body: { admin_email: adminEmail, otp },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setStep("company-form");
    } catch (err: any) {
      setError(err.message || "كود التحقق غير صحيح");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-otp-register", {
        body: {
          admin_email: adminEmail,
          otp,
          company_name: companyName,
          company_code: companyCode || undefined,
          owner_name: ownerName,
          email,
          password,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center gradient-bg">
        <div className="glass-card p-10 w-full max-w-[440px] text-center animate-fade-in-up">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-primary mb-4">تم إنشاء الشركة والحساب بنجاح!</h2>
          <p className="text-muted-foreground mb-6">
            يمكنك الآن تسجيل الدخول بحسابك الجديد.
          </p>
          <button
            onClick={onBack}
            className="gradient-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:-translate-y-0.5 transition-all"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center gradient-bg relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/5 blur-3xl" />

      <div className="glass-card p-10 w-full max-w-[440px] text-center relative z-10 animate-fade-in-up">
        <h1 className="text-3xl font-black mb-1 text-gradient">3M GSC</h1>
        <h2 className="text-xl mb-6 text-primary font-bold">إنشاء شركة جديدة</h2>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[
            { key: "admin-verify", icon: ShieldCheck, label: "تحقق الأدمن" },
            { key: "otp", icon: Mail, label: "كود التحقق" },
            { key: "company-form", icon: Building2, label: "بيانات الشركة" },
          ].map((s, i) => {
            const isActive = step === s.key;
            const isDone =
              (s.key === "admin-verify" && (step === "otp" || step === "company-form")) ||
              (s.key === "otp" && step === "company-form");
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <div className={`h-0.5 w-6 ${isDone || isActive ? "bg-primary" : "bg-muted"}`} />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <s.icon size={14} />
                  {s.label}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step 1: Admin Email */}
        {step === "admin-verify" && (
          <form onSubmit={handleSendOtp} className="space-y-4 text-right">
            <p className="text-sm text-muted-foreground text-center mb-2">
              أدخل بريد الأدمن المسؤول للتحقق وإرسال كود التأكيد
            </p>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">بريد الأدمن</label>
              <input
                required
                type="email"
                placeholder="admin@example.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full p-3 glass-input text-sm"
                dir="ltr"
              />
            </div>

            {error && (
              <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "إرسال كود التحقق"}
            </button>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center mb-2">
              تم إرسال كود مكون من 6 أرقام إلى <span className="text-primary font-medium" dir="ltr">{adminEmail}</span>
            </p>
            <p className="text-xs text-muted-foreground text-center">الكود صالح لمدة 5 دقائق فقط</p>

            <div className="flex justify-center" dir="ltr">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
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

            {error && (
              <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                {error}
              </p>
            )}

            <button
              onClick={handleVerifyOtp}
              disabled={otp.length !== 6}
              className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
            >
              تأكيد الكود
            </button>

            <button
              onClick={() => { setStep("admin-verify"); setOtp(""); setError(""); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              إعادة إرسال الكود
            </button>
          </div>
        )}

        {/* Step 3: Company + User form */}
        {step === "company-form" && (
          <form onSubmit={handleCreateCompany} className="space-y-4 text-right">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">اسم الشركة</label>
              <input
                required
                type="text"
                placeholder="مثال: شركة الأمل"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full p-3 glass-input text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">كود الشركة (اختياري)</label>
              <input
                type="text"
                placeholder="GSC-XXXX"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                className="w-full p-3 glass-input text-sm"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">اسم المالك</label>
              <input
                required
                type="text"
                placeholder="الاسم الكامل"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full p-3 glass-input text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">البريد الإلكتروني</label>
              <input
                required
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 glass-input text-sm"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground block px-1">كلمة المرور</label>
              <input
                required
                type="password"
                minLength={6}
                placeholder="6 أحرف على الأقل"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 glass-input text-sm"
                dir="ltr"
              />
            </div>

            {error && (
              <p className="text-destructive bg-destructive/10 p-2.5 rounded-lg text-sm border border-destructive/30 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full p-3.5 rounded-xl font-bold text-base gradient-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "إنشاء الشركة والحساب"}
            </button>
          </form>
        )}

        <button
          onClick={onBack}
          className="mt-4 flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowRight size={16} />
          العودة لتسجيل الدخول
        </button>
      </div>
    </div>
  );
};
