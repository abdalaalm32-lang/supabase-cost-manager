# تطوير صفحة تسعير المخزن المركزي

## 1) تحديد الأصناف المتاحة للتوريد الداخلي
ليس كل صنف مربوط بالمخزن يُحوَّل للفروع. هنضيف **Toggle "متاح للتوريد"** على مستوى كل صنف داخل جدول التسعير. الأصناف الغير مفعلة تظهر بشكل باهت ولا تُحسب في معاينة أسعار الفروع، ولا يقترحها السيستم تلقائياً في أذونات التحويل.

- حقل جديد: `stock_item_supply_pricing.is_available_for_transfer` (boolean, default true)
- فلتر سريع في الهيدر: **الكل / متاح للتوريد فقط / غير متاح**

---

## 2) المصاريف غير المباشرة للمخزن (Overhead)
قسم جديد في أعلى الصفحة: **"المصاريف غير المباشرة للمخزن"** — جدول بنود ديناميكية يقدر العميل يضيف/يحذف بنود (إيجار، مرتبات، فواتير، صيانة، أمن، …).

- جدول جديد: `warehouse_overhead_expenses`
  - `warehouse_id`, `expense_name`, `monthly_amount`, `is_active`
- KPI: **إجمالي المصاريف الشهرية** + **عدد البنود النشطة**
- Dialog "إضافة/تعديل بند" بسيط (اسم + مبلغ شهري + نشط)

### طريقة التوزيع على الأصناف (Allocation Basis)
Select واحد في أعلى القسم — يطبّق على كل المصاريف:
- 💰 **حسب القيمة (Recommended)** — نسبة قيمة الصنف (الكمية × WAC) من إجمالي قيمة المخزن
- ⚖️ **حسب الوزن** — يستخدم `unit_weight` × الكمية
- 📦 **حسب الحجم** — يستخدم `unit_volume` × الكمية
- 🔢 **حسب الكمية** — كل صنف ياخد نصيب متساوي حسب الكمية
- ✋ **يدوي** — العميل يحدد نسبة لكل صنف

النتيجة: لكل صنف **"نصيب من المصاريف غير المباشرة لكل وحدة"** (per-unit overhead share).

---

## 3) خانة "تكلفة التصنيع" تتعبأ تلقائياً
حالياً `manufacturing_cost` يدوية. نخليها تعرض نصيب الصنف من المصاريف غير المباشرة كقيمة افتراضية، مع إمكانية override يدوي.

- زر صغير 🔄 جنب الحقل: "أعد الحساب من المصاريف غير المباشرة"
- Tooltip يوضح: `(إجمالي المصاريف الشهرية × نسبة الصنف) ÷ كمية المخزن`

---

## 4) توزيع تكلفة النقل والتحميل (Allocate Charges By)
نفس الفكرة بس على مستوى **عملية التحويل** (مش شهري):

في `branch_supply_policies` نضيف:
- `allocation_method` (`value` / `weight` / `volume` / `quantity` / `manual`)

عند بناء التحويل في `TransferDetailPage`:
- بدل قسمة `transportation_cost / qty` على كل صنف بالتساوي
- يحسب نسبة كل صنف حسب الطريقة المختارة
- ويوزع `transportation_cost + loading_cost` بشكل متناسب
- يظهر breakdown شفاف تحت كل بند

---

## 5) تحديثات قاعدة البيانات (Migration)

```sql
-- 1) Overhead expenses per warehouse
CREATE TABLE warehouse_overhead_expenses (
  id, company_id, warehouse_id,
  expense_name, monthly_amount,
  is_active, created_at, updated_at
);

-- 2) Overhead allocation settings (per warehouse)
ALTER TABLE warehouses ADD COLUMN
  overhead_allocation_method text DEFAULT 'value';

-- 3) Toggle availability per stock item
ALTER TABLE stock_item_supply_pricing ADD COLUMN
  is_available_for_transfer boolean DEFAULT true,
  manual_overhead_share numeric DEFAULT 0,
  unit_weight numeric DEFAULT 0,
  unit_volume numeric DEFAULT 0;

-- 4) Per-policy transport allocation
ALTER TABLE branch_supply_policies ADD COLUMN
  allocation_method text DEFAULT 'value';
```

كل جدول جديد ياخد GRANT + RLS.

---

## 6) تحديثات الواجهة

### `SupplyPricingPage.tsx`
- قسم جديد فوق: **بطاقة المصاريف غير المباشرة** (CRUD + select طريقة التوزيع)
- عمود جديد في الجدول: **متاح للتوريد** (Switch)
- عمود جديد: **نصيب من المصاريف** (محسوب)
- زر إعادة حساب تكلفة التصنيع من المصاريف
- فلتر "متاح للتوريد"

### `TransferDetailPage.tsx`
- استخدام `allocation_method` لتوزيع النقل/التحميل
- إخفاء/تعطيل الأصناف غير المتاحة للتوريد عند المصدر = مخزن مركزي
- تحديث breakdown ليعكس التوزيع المتناسب

### `useSupplyPricing.ts`
- دالة جديدة `computeOverheadShare(item, allocationMethod, totals)`
- دالة `allocateTransportCharges(items, policy)` تُرجع نصيب كل بند
- تعديل `computeSupplyPrice` يقبل `overheadPerUnit` و `transportPerUnit` محسوبين من برّه

---

## ✅ المخرجات
- كل صنف يقدر يتفعّل/يتعطّل من التوريد الداخلي بشكل صريح.
- المخزن له بنود مصاريف غير مباشرة قابلة للإدارة.
- 5 طرق توزيع للمصاريف + للنقل والتحميل، مع توصية بـ "حسب القيمة".
- تكلفة التصنيع تتحدّث تلقائياً من نصيب الصنف من الـ Overhead.
- تسعير التوريد النهائي يطلع دقيق وشفاف.

أبدأ التنفيذ؟
