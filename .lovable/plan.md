## نظام Trial + إدارة العملاء + تحديثات الفيديو والصفحة الرئيسية

### 1. قاعدة البيانات (Migration واحدة)

**تعديل جدول `companies`:**
- `subscription_status` (trial / active / expired / suspended)
- `trial_start_date`, `trial_end_date`
- `activity_score` (محسوب من النشاط)

**جدول جديد `trial_leads`:**
- بيانات التواصل: `restaurant_name`, `contact_name`, `phone`, `whatsapp`, `email`, `city`, `branches_count`, `current_system`
- ربط بالشركة: `company_id` (nullable — بيتربط لما الشركة تتنشئ)
- الحالة: `status` (new_lead / trial_active / contacted / demo_scheduled / converted / lost)
- التوقيتات: `trial_start_date`, `trial_end_date`, `created_at`, `last_contact_at`
- ملاحظات المبيعات: `admin_notes`

**جدول `company_activity_stats` (View أو Table محسوب):**
- `company_id`, `last_login_at`, `login_count`, `items_created`, `branches_created`, `reports_viewed`, `days_active`

**RLS:**
- `trial_leads`: قراءة/كتابة للـ admin فقط
- `company_activity_stats`: قراءة للـ admin فقط + قراءة الشركة لبياناتها

### 2. Edge Function: `create-trial-company`

- Public (لا يحتاج JWT)
- يستقبل بيانات نموذج التسجيل
- ينشئ:
  - Row في `trial_leads`
  - `companies` row (status=trial, trial_end = now + 14 days)
  - `auth.users` (owner)
  - `profiles` + `user_roles` (owner)
- يرجع بيانات الدخول

### 3. صفحة `/trial-signup`

نموذج كامل احترافي:
- اسم المطعم / الكافيه *
- اسم المسؤول *
- رقم الموبايل *
- واتساب
- البريد الإلكتروني *
- كلمة سر *
- المدينة
- عدد الفروع
- نظام حالي؟ (نعم/لا)
- زر: "ابدأ التجربة المجانية"
- بعد النجاح: يعرض بيانات الدخول + يوجهه للـ Login

### 4. قفل النظام عند انتهاء التجربة

- Hook `useSubscriptionGuard` يفحص `subscription_status` + `trial_end_date`
- لو `expired`: overlay كامل يمنع الدخول + رسالة "انتهت الفترة التجريبية — يرجى التواصل"
- زر واتساب مباشر: +201061208033

### 5. صفحة الأدمن: `/admin/leads` (إدارة العملاء)

**KPI Cards علوية:**
- إجمالي العملاء المحتملين
- تجارب نشطة
- تجارب منتهية
- تم التحويل لمشترك

**Tab 1: العملاء المحتملون (Leads)**
جدول بأعمدة:
- اسم المطعم | المسؤول | الهاتف/واتساب | المدينة | عدد الفروع | الحالة | تاريخ التسجيل | نهاية التجربة | إجراءات

إجراءات: تغيير الحالة، ملاحظة، اتصال واتساب مباشر، تحويل لاشتراك مدفوع

**Tab 2: Dashboard المبيعات (نشاط العملاء)**
جدول بأعمدة:
- العميل | الحالة | آخر دخول | عدد الفروع | الأصناف | التقارير المفتوحة | **نسبة النشاط** (شريط ملون) | أولوية التواصل

فلاتر: الكل / نشط عالي / نشط متوسط / منخفض / لم يدخل

**Tab 3: تحويل يدوي (Convert)**
تفعيل الاشتراك المدفوع لشركة معينة (تحديث `subscription_status = active`)

### 6. الصفحة الرئيسية HomePage

- حذف زر "ابدأ الآن" بجانب "تسجيل الدخول" في الـ Navbar
- زر "ابدأ الفترة التجريبية مجاناً" → يوجه لـ `/trial-signup` (بدل ما يفتح Dialog تسجيل)

### 7. الفيديو التعريفي

سأعيد إنتاج الفيديو في Remotion:
- استبدال الصور بالـ 10 صور الجديدة اللي رفعتها (Dashboard / POS / Inventory Materials / Inventory Balances / Cost Analysis / Variance Analysis / Variance Details / Indirect Expenses × 2 / Menu Analysis)
- حذف شاشة "mgsc.lovable.app" من النهاية
- زيادة المدة (~30-35 ثانية بدل ~20)
- ترقية موقع النصوص فوق الصور بحيث تكون في شريط علوي/سفلي واضح مع خلفية Overlay
- إضافة موسيقى تحفيزية (سأولد track قصير أو أستخدم أحد الروابط الجاهزة)

---

### ترتيب التنفيذ:
1. Migration (ينتظر موافقتك)
2. Edge function للتسجيل التلقائي
3. صفحة `/trial-signup`
4. صفحة `/admin/leads` بالتابين
5. Guard الاشتراك + Overlay القفل
6. تعديلات HomePage
7. إعادة إنتاج الفيديو ورفعه

هل تعتمد الخطة؟