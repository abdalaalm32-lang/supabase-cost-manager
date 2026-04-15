---
name: Call Center Module
description: Dedicated call center screen for delivery orders with customer search, order tracking stages, and permission system
type: feature
---
- Separate page at `/call-center` with `call_center` permission key
- Two tabs: "أوردر جديد" (new order) and "تتبع الأوردرات" (order tracking)
- Customer lookup by phone number from `customers` table (auto-fill name/address)
- All orders are "دليفري" type with delivery_status tracking
- Delivery stages: جديد → قيد التحضير → خرج للتوصيل → تم التسليم
- Customer data: name, phone, address stored on both `customers` table and `pos_sales` columns
- Permission exists as both a standalone permission AND can be assigned via job roles
- Nav item in sidebar with Phone icon
