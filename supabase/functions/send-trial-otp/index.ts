import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return new Response(JSON.stringify({ error: "بريد إلكتروني غير صحيح" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Reject if email already has a trial or an active account
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    if (users?.users?.find((u) => u.email === email)) {
      return new Response(JSON.stringify({ error: "هذا البريد مسجل بالفعل. سجل دخولك مباشرة." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseAdmin.from("otp_codes").delete().eq("admin_email", email).eq("used", false);
    const { error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .insert({ admin_email: email, code: otp, expires_at: expiresAt });

    if (otpError) {
      return new Response(JSON.stringify({ error: "فشل إنشاء كود التحقق", details: otpError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "خدمة الإيميل غير مُعدّة" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "3M CMS <onboarding@resend.dev>",
        to: [email],
        subject: "كود تفعيل التجربة المجانية - 3M CMS",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: hsl(160, 65%, 40%);">3M CMS - كود التحقق</h2>
            <p>مرحباً، شكراً لاختيارك تفعيل التجربة المجانية.</p>
            <p>كود التحقق الخاص بك:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: hsl(160, 65%, 40%);">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">هذا الكود صالح لمدة 10 دقائق فقط.</p>
            <p style="color: #6b7280; font-size: 12px;">إذا لم تطلب التسجيل، تجاهل هذه الرسالة.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      return new Response(JSON.stringify({ error: "فشل إرسال الإيميل", details: err }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "تم إرسال كود التحقق" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
