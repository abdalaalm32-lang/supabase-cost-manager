---
name: Delivery Workflow System
description: نظام دليفري متكامل يشمل رسوم التوصيل، إدارة الطيارين، تسوية الحسابات، تنبيه الكاشير بالأوردرات الجديدة، وأرقام تليفون متعددة للعملاء
type: feature
---
- حقل `delivery_fee` في `pos_sales` لرسوم التوصيل
- حقل `driver_id` في `pos_sales` مرتبط بجدول `delivery_drivers`
- حقل `phone2` في `customers` لرقم تليفون إضافي
- جدول `delivery_drivers` (name, phone, active, company_id) مع RLS
- الكول سنتر يحدد الطيار ورسوم التوصيل عند إنشاء الأوردر
- شاشة البيع (POS) تعرض badge تنبيه بعدد أوردرات الدليفري النشطة مع صوت تنبيه عبر Realtime
- صفحة "تسوية الطيارين" في إدارة المبيعات (/sales/driver-settlement) لعرض حسابات كل طيار يومياً
