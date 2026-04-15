---
name: Call Center Module
description: Dedicated call center screen for delivery orders with customer search, order tracking stages, delivered orders with stats/rating, customer registry with complaints/suggestions, and permission system
type: feature
---
- Separate page at `/call-center` with `call_center` permission key
- Four tabs: "أوردر جديد" (new order), "تتبع الأوردرات" (order tracking), "تم التسليم" (delivered orders), "سجل العملاء" (customer registry)
- Customer lookup by phone number from `customers` table (auto-fill name/address)
- All orders are "دليفري" type with delivery_status tracking
- Delivery stages: جديد → قيد التحضير → خرج للتوصيل → تم التسليم
- Delivered orders tab: stats cards (count, total sales, avg rating, top customer) + orders table with rating
- Customer rating: 1-5 stars stored in `pos_sales.customer_rating`
- Customer registry: all customers with order counts, total purchases, and direct call button
- Complaints/suggestions: `customer_feedback` table with type (شكوى/مقترح), status (جديد/قيد المراجعة/تم الحل), reply
- Permission exists as both a standalone permission AND can be assigned via job roles
- Nav item in sidebar with Phone icon
