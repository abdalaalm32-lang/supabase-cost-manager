## الهدف
1. إضافة **Warehouse P&L** و **Consolidated P&L** بجانب Branch P&L الحالي في صفحة P&L.
2. إضافة صلاحية جديدة `delete_pos_item` تخفي زر الحذف/سلة المهملات في شاشة POS، مع تحقق في الـ Backend وسجل Audit للحذف.

---

## القسم الأول: P&L للمخزن

### 1.1 تعديل قاعدة البيانات
- التحقق من جدول `transfer_pricing_breakdown` الحالي والتأكد إنه بيحفظ Snapshot كامل عند إنشاء التحويل. لو ناقص أعمدة (زي `cost_price_at_transfer`, `markup_percent`, `supply_price_at_transfer`, `total_cost`, `total_supply`, `profit_amount`, `warehouse_id`, `transfer_date`) — يتم إضافتها بـ migration.
- التأكد إن الأسعار محفوظة وقت التحويل (Snapshot) ومش بتتغير بعد كده.

### 1.2 مصادر البيانات لتقرير المخزن
| البند | المصدر |
|---|---|
| Internal Sales | `SUM(transfer_pricing_breakdown.total_supply)` للتحويلات المكتملة من مخزن معين خلال الفترة |
| Internal Sales by Branch | نفس المصدر مجمّع حسب `destination_branch_id` |
| Purchases | `purchase_orders` المرتبطة بالمخزن (status = مكتمل) |
| Opening/Closing Inventory | آخر stocktake قبل/داخل الفترة (نفس منطق الـ Periodic COGS الحالي) |
| Production Cost | `production_records.total_cost` |
| Operating Expenses | `warehouse_overhead_expenses` + إمكانية إضافة يدوية |
| Waste | `waste_records.total_cost` للمخزن |

### 1.3 هيكل صفحة P&L بعد التعديل
تبويبات (Tabs) داخل نفس الصفحة:
```
P&L
├── Branch P&L      (الصفحة الحالية)
├── Warehouse P&L   (جديد)
└── Consolidated    (جديد)
```

### 1.4 محتوى Warehouse P&L
```
P&L - Central Warehouse [اسم المخزن]
الفترة: من - إلى

Internal Sales
  Branch A ................. 150,000
  Branch B ................. 120,000
  Branch C ................. 180,000
  Total Internal Sales ..... 450,000

Cost of Goods Sold
  Opening Inventory ......... 50,000
  Purchases ................ 300,000
  Production Cost ........... 20,000
  Closing Inventory ........ (60,000)
  Total COGS ............... 310,000

Gross Profit ............... 140,000  (31.1%)

Operating Expenses
  [من warehouse_overhead_expenses + يدوي]
  Total .................... 80,000

Net Profit ................. 60,000   (13.3%)
```
+ KPIs cards علوية:
- إجمالي المبيعات الداخلية
- هامش الربح الداخلي %
- تكلفة الإنتاج
- تكلفة الفاقد
- قيمة المخزون أول/آخر المدة
- صافي ربح المخزن

### 1.5 محتوى Consolidated P&L
```
Consolidated P&L (الشركة كاملة)

Real Sales (POS) ......................... X
(-) Internal Sales ................ (تُلغى)
(-) Internal Purchases at branches  (تُلغى)

COGS (original raw materials only) ....... Y
Gross Profit ............................. X-Y
Operating Expenses (كل الفروع + المخزن) . Z
Net Profit ............................... X-Y-Z
```
مع pill يوضح قيمة الـ Elimination.

### 1.6 الملفات المتأثرة
- `src/pages/PnlPage.tsx` — تحويلها لـ Tabs.
- `src/components/pnl/BranchPnlTab.tsx` (استخراج المحتوى الحالي).
- `src/components/pnl/WarehousePnlTab.tsx` (جديد).
- `src/components/pnl/ConsolidatedPnlTab.tsx` (جديد).
- `src/hooks/useWarehousePnlData.ts` (جديد).
- `src/hooks/useConsolidatedPnlData.ts` (جديد).
- Migration لو `transfer_pricing_breakdown` محتاج أعمدة إضافية.

---

## القسم الثاني: صلاحية حذف صنف من الفاتورة

### 2.1 إضافة Permission جديدة
- إضافة `pos_delete_item` لقائمة الصلاحيات في صفحة المستخدمين (`SettingsUsersPage.tsx`).
- الصلاحية بتتخزن في `profiles.permissions[]` (النظام الحالي).

### 2.2 Frontend
- في `PosScreenPage.tsx`: قراءة الـ permissions من `useAuth()`، وإخفاء زر سلة المهملات لو المستخدم مالوش الصلاحية دي.
- **Admin/Owner دايماً مسموح لهم** حتى بدون الصلاحية.

### 2.3 Audit Log (اختياري - جدول جديد بسيط)
جدول `pos_item_delete_log`:
- `user_id`, `sale_id (nullable لو draft)`, `pos_item_id`, `item_name`, `quantity`, `reason (nullable)`, `created_at`
- كل عملية حذف تُسجل هنا.

### 2.4 الملفات المتأثرة
- `src/pages/SettingsUsersPage.tsx` — إضافة الصلاحية الجديدة للقائمة.
- `src/pages/PosScreenPage.tsx` — التحقق قبل عرض زر الحذف + تسجيل الـ log.
- Migration لجدول `pos_item_delete_log` (لو المستخدم موافق).

---

## ملاحظات تقنية
- كل التقارير الجديدة تدعم فلتر التاريخ + فلتر المخزن.
- Print/Export PDF لكل تبويبة.
- الأسعار في `transfer_pricing_breakdown` **Snapshot ثابت** — مفيش إعادة حساب.
- التحويلات المُلغاة (`ملغي`) تُستبعد من التقرير.

---

## ترتيب التنفيذ
1. Migration للـ `transfer_pricing_breakdown` (لو محتاج) + جدول Audit.
2. Hooks جديدة (Warehouse + Consolidated).
3. تحويل PnlPage لـ Tabs.
4. صفحات المخزن والمجمّع.
5. صلاحية POS + إخفاء الزر + Audit log.
