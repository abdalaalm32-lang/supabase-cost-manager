
## الفكرة العامة

نعمل صفحة موحدة اسمها **"التكامل مع أنظمة نقاط البيع"** فيها 3 تبويبات كبيرة، وتحل محل الصفحة الحالية `/integrations/pos-api`:

1. **API Integration** — الصفحة الحالية بحالها (مفاتيح + دليل الربط + خطوات).
2. **Database Sync** — إعدادات ربط قواعد بيانات الأنظمة القديمة (SQL Server / MySQL / PostgreSQL / Oracle) عن طريق **3M Sync Agent**.
3. **Synchronization Logs** — سجل موحد لكل عمليات المزامنة (سواء API أو DB Sync) مع نجاح/فشل/عدد السجلات.

## المعمارية المقترحة

```text
   Phoenix / أي POS قديم
           │  SQL
           ▼
   3M Sync Agent  (برنامج Windows/Linux صغير يتثبت عند العميل)
           │  HTTPS + API Key
           ▼
   pos-api Edge Function  (نفس الـ endpoints الحالية)
           │
           ▼
   pos_sales / stock_items / pos_items
           │
           ▼
   sync_logs   (جدول جديد لتسجيل كل عملية)
```

**الأهم:** السيستم السحابي **لا يتصل مباشرة** بقاعدة بيانات العميل. الـ Sync Agent هو اللي بيعمل الاتصال المحلي وبيبعت للـ API الحالي — ده أأمن وأسهل صيانة.

## التنفيذ (Frontend + Backend)

### 1. قاعدة البيانات
- جدول `pos_sync_configs`: إعدادات كل عميل (نوع الـ DB, server, database name, username, port, sync_interval, selected_tables). **الباسورد يتخزن مشفّر ولا يظهر في الـ frontend بعد الحفظ**.
- جدول `pos_sync_logs`: `id, company_id, source ('api'|'db_sync'), event, records_count, error_count, error_message, created_at`.
- تعديل `pos-api/index.ts`: كل عملية بيع/مزامنة أصناف تكتب سطر في `pos_sync_logs`.

### 2. صفحة `PosIntegrationPage.tsx` (بديلة لـ `PosApiPage.tsx`)
تبويبات:
- **API Integration**: نقل محتوى الصفحة الحالية كما هو.
- **Database Sync**:
  - Card 1: اختيار نوع DB (radio: SQL Server / MySQL / PostgreSQL / Oracle).
  - Card 2: بيانات الاتصال (Server / DB Name / Username / Password / Port).
  - Card 3: زر **Test Connection** (بيبعت لـ edge function `test-db-connection` بيرجع نجح/فشل — للـ MVP هيكون stub بيتحقق من صيغة البيانات فقط، الاتصال الفعلي هيكون من الـ Agent نفسه).
  - Card 4: إعدادات المزامنة (Sync Every: 10s/30s/1m/5m + checkboxes للجداول: Invoices, Sales Details, Items, Customers, Branches).
  - Card 5: حالة آخر مزامنة (Last Sync, Records Imported, Errors) — بتقرأ من `pos_sync_logs`.
  - Card 6: **تحميل 3M Sync Agent** + دليل التثبيت (سنعرض placeholder للتحميل + تعليمات نصية للـ MVP).
- **Synchronization Logs**: جدول موحد بكل السجلات، فلتر بالمصدر (API / DB Sync)، بالتاريخ، بالحالة.

### 3. تحديث المسار
- استبدال `/integrations/pos-api` بـ `/integrations/pos` في `App.tsx` والـ Sidebar.
- الاسم الجديد: "التكامل مع نقاط البيع".

## نطاق الـ MVP دلوقتي vs مستقبلاً

**دلوقتي (MVP):**
- الجدولين + الصفحة الكاملة بـ 3 تبويبات.
- حفظ إعدادات الـ DB Sync + عرض السجلات من `pos_sync_logs`.
- تسجيل كل استدعاء للـ `pos-api` في `pos_sync_logs` تلقائيًا (يخلي التبويب الثالث شغّال فورًا).
- Test Connection = تحقق شكلي فقط (صيغة IP، Port valid).
- شاشة تعليمات + placeholder لتحميل الـ Agent.

**لاحقًا (خارج نطاق دلوقتي):**
- بناء برنامج **3M Sync Agent** الفعلي (Electron/Go/.NET) — ده مشروع منفصل خارج Lovable.
- Test Connection حقيقي (يحتاج الـ Agent مثبت عند العميل).

## سؤال قبل ما أبدأ التنفيذ

هل تمام كده أم عايز نضيف/نغير حاجة قبل ما نبدأ؟ خصوصًا:
1. **تبويبات منفصلة** (3 تابس) ولا صفحة واحدة طويلة؟ (الاقتراح: تابس عشان أنظف).
2. جدول `pos_sync_configs` يكون **واحد لكل شركة** ولا **متعدد** (يعني ممكن العميل يربط أكتر من DB لأكتر من فرع)؟
