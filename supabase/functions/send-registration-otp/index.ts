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
    const { admin_email } = await req.json();

    if (!admin_email) {
      return new Response(
        JSON.stringify({ error: "يجب إدخال بريد الأدمن" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the admin user by email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const adminUser = users?.users?.find((u) => u.email === admin_email);

    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: "لا يمكنك إضافة شركة - البريد غير مسجل" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this user has admin role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUser.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "لا يمكنك إضافة شركة - هذا المستخدم ليس أدمن" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Delete any previous unused OTPs for this admin
    await supabaseAdmin
      .from("otp_codes")
      .delete()
      .eq("admin_email", admin_email)
      .eq("used", false);

    // Store OTP
    const { error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .insert({ admin_email, code: otp, expires_at: expiresAt });

    if (otpError) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء كود التحقق", details: otpError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP email via Resend
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
        to: [admin_email],
        subject: "كود التحقق لإنشاء شركة جديدة - 3M GSC",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">3M GSC - كود التحقق</h2>
            <p>مرحباً، تم طلب إنشاء شركة جديدة على النظام.</p>
            <p>كود التحقق الخاص بك:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6366f1;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">هذا الكود صالح لمدة 5 دقائق فقط.</p>
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

    await emailRes.text();

    return new Response(
      JSON.stringify({ success: true, message: "تم إرسال كود التحقق إلى بريد الأدمن" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
