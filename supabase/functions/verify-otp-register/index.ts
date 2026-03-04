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
    const { admin_email, otp, company_name, company_code, owner_name, email, password } = await req.json();

    // If only admin_email and otp provided, just verify the OTP
    const verifyOnly = !company_name && !owner_name && !email && !password;

    if (!admin_email || !otp) {
      return new Response(
        JSON.stringify({ error: "بريد الأدمن وكود التحقق مطلوبين" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!verifyOnly && (!company_name || !owner_name || !email || !password)) {
      return new Response(
        JSON.stringify({ error: "جميع الحقول مطلوبة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify OTP
    const { data: otpRows, error: otpFetchErr } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("admin_email", admin_email)
      .eq("code", otp)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (otpFetchErr || !otpRows || otpRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "كود التحقق غير صحيح" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otpRecord = otpRows[0];

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      await supabaseAdmin.from("otp_codes").delete().eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({ error: "كود التحقق منتهي الصلاحية، أعد الطلب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If verify only, return success without marking as used
    if (verifyOnly) {
      return new Response(
        JSON.stringify({ success: true, verified: true, message: "كود التحقق صحيح" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used
    await supabaseAdmin.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);

    // Create company
    const code = company_code || `GSC-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: company_name, code })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء الشركة", details: companyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: owner_name,
        company_id: company.id,
        role: "مستخدم",
      },
    });

    if (userError) {
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء المستخدم", details: userError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean up expired OTPs
    await supabaseAdmin
      .from("otp_codes")
      .delete()
      .lt("expires_at", new Date().toISOString());

    return new Response(
      JSON.stringify({ success: true, message: "تم إنشاء الشركة والحساب بنجاح" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
