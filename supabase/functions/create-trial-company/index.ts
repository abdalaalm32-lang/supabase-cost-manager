import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRIAL_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      restaurant_name,
      contact_name,
      phone,
      whatsapp,
      email,
      password,
      city,
      branches_count,
      current_system,
      otp_code,
    } = body ?? {};

    // Basic validation
    const errors: Record<string, string> = {};
    if (!restaurant_name || String(restaurant_name).trim().length < 2) errors.restaurant_name = "اسم المطعم مطلوب";
    if (!contact_name || String(contact_name).trim().length < 2) errors.contact_name = "اسم المسؤول مطلوب";
    if (!phone || String(phone).trim().length < 6) errors.phone = "رقم الهاتف مطلوب";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "البريد الإلكتروني غير صحيح";
    if (!password || String(password).length < 6) errors.password = "كلمة السر لا تقل عن 6 أحرف";
    if (!otp_code || !/^\d{6}$/.test(String(otp_code))) errors.otp_code = "كود التحقق مطلوب (6 أرقام)";

    if (Object.keys(errors).length > 0) {
      return new Response(JSON.stringify({ error: "بيانات غير صحيحة", fields: errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify OTP
    const { data: otpRow } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("admin_email", email)
      .eq("code", String(otp_code))
      .eq("used", false)
      .maybeSingle();

    if (!otpRow) {
      return new Response(JSON.stringify({ error: "كود التحقق غير صحيح", fields: { otp_code: "كود غير صحيح" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(otpRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "انتهت صلاحية الكود. أعد الإرسال.", fields: { otp_code: "منتهي" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabaseAdmin.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

    // Prevent duplicate trial per email
    const { data: existingLead } = await supabaseAdmin
      .from("trial_leads")
      .select("id, company_id")
      .eq("email", email)
      .maybeSingle();

    if (existingLead) {
      return new Response(
        JSON.stringify({ error: "هذا البريد الإلكتروني تم استخدامه من قبل في تجربة مجانية. تواصل معنا لتفعيل اشتراك مدفوع." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if auth user already exists
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuth = authUsers?.users?.find((u) => u.email === email);
    if (existingAuth) {
      return new Response(
        JSON.stringify({ error: "المستخدم موجود بالفعل بهذا البريد. سجل دخولك مباشرة." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate unique company code
    const codePrefix = "TRIAL";
    const rand = Math.floor(1000 + Math.random() * 9000);
    const companyCode = `${codePrefix}-${rand}`;

    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    // 1) Create company (trial status)
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: restaurant_name,
        code: companyCode,
        active: true,
        subscription_status: "trial",
        subscription_type: "unlimited",
        trial_start_date: trialStart.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        max_branches: Math.max(2, Number(branches_count) || 2),
        max_warehouses: 1,
        max_users: 5,
      })
      .select()
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء الشركة", details: companyError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Create the owner auth user
    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: contact_name,
        company_id: company.id,
        role: "مالك",
        permissions: ["dashboard"],
        status: "نشط",
        subscription_type: "unlimited",
      },
    });

    if (userError || !created?.user) {
      // Rollback company
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء الحساب", details: userError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Update user_roles to owner and set company owner_id
    await supabaseAdmin
      .from("user_roles")
      .update({ role: "owner" })
      .eq("user_id", created.user.id);

    await supabaseAdmin
      .from("companies")
      .update({ owner_id: created.user.id })
      .eq("id", company.id);

    // 4) Create trial_lead record
    await supabaseAdmin.from("trial_leads").insert({
      company_id: company.id,
      restaurant_name,
      contact_name,
      phone,
      whatsapp: whatsapp || phone,
      email,
      city: city || null,
      branches_count: Number(branches_count) || 1,
      current_system: current_system || null,
      status: "trial_active",
      trial_start_date: trialStart.toISOString(),
      trial_end_date: trialEnd.toISOString(),
    });

    // 5) Initialize activity row
    await supabaseAdmin.from("company_activity").insert({
      company_id: company.id,
      login_count: 0,
    });

    return new Response(
      JSON.stringify({
        message: "تم إنشاء التجربة المجانية بنجاح",
        company_id: company.id,
        email,
        trial_end_date: trialEnd.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-trial-company error:", err);
    return new Response(
      JSON.stringify({ error: "حدث خطأ غير متوقع", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
