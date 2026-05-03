import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "يجب إدخال البريد الإلكتروني" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const genericResponse = new Response(
      JSON.stringify({ success: true, message: "إذا كان البريد مسجلاً، سيصلك رمز التحقق قريباً" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // Rate limit: reject if an unused, recent OTP was sent within the last 60 seconds
    const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("otp_codes")
      .select("id")
      .eq("admin_email", email)
      .gte("created_at", sixtySecAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      return genericResponse;
    }

    // Check if email exists — but never reveal that to the caller
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find((u) => u.email === email);

    if (!user) {
      return genericResponse;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Delete previous unused OTPs for this email
    await supabaseAdmin
      .from("otp_codes")
      .delete()
      .eq("admin_email", email)
      .eq("used", false);

    // Store OTP
    const { error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .insert({ admin_email: email, code: otp, expires_at: expiresAt });

    if (otpError) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء كود التحقق", details: otpError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "خدمة الإيميل غير مُعدّة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "3M GSC <onboarding@resend.dev>",
        to: [email],
        subject: "كود استعادة كلمة المرور - 3M GSC",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">3M GSC - استعادة كلمة المرور</h2>
            <p>مرحباً، تم طلب استعادة كلمة المرور لحسابك.</p>
            <p>كود التحقق الخاص بك:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6366f1;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">هذا الكود صالح لمدة 5 دقائق فقط.</p>
            <p style="color: #6b7280; font-size: 14px;">إذا لم تطلب استعادة كلمة المرور، تجاهل هذا الإيميل.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      return new Response(
        JSON.stringify({ error: "فشل إرسال الإيميل", details: emailErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
