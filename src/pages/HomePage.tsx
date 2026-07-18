import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Factory, BarChart3, Store, Zap,
  Check, X, ChevronLeft, PlayCircle, Calendar, ArrowLeft,
  Boxes, LineChart, Utensils, Headphones,
  Facebook, Instagram, MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo3m from "@/assets/logo-3m.png";
import shotDashboard from "@/assets/home-shots/dashboard.png";
import shotCost from "@/assets/home-shots/cost-analysis.png";
import shotVariance from "@/assets/home-shots/variance-analysis.png";
import shotBalances from "@/assets/home-shots/inventory-balances.png";
import shotPnl from "@/assets/home-shots/pnl.png";
import shotMenu from "@/assets/home-shots/menu-engineering.png";
import shotPos from "@/assets/home-shots/pos-analytics.png";
import shotMaterials from "@/assets/home-shots/inventory-materials.png";
import introVideoAsset from "@/assets/intro-video.mp4.asset.json";

const BRAND_BLUE = "hsl(220, 70%, 20%)";
const BRAND_GREEN = "hsl(160, 65%, 40%)";
const WHATSAPP = "https://wa.me/201061208033";
const FACEBOOK = "https://www.facebook.com/share/1Ca76ypJkm/";
const INSTAGRAM = "https://www.instagram.com/3m.cost.management.system?igsh=NzcyanppNWZicnM3";
const INTRO_VIDEO = introVideoAsset.url;

const SCREENSHOTS: { src: string; label: string }[] = [
  { src: shotDashboard, label: "لوحة التحكم" },
  { src: shotCost, label: "تحليل التكاليف" },
  { src: shotVariance, label: "تحليل الانحرافات" },
  { src: shotBalances, label: "أرصدة المخزون" },
  { src: shotPnl, label: "قائمة الأرباح والخسائر" },
  { src: shotMenu, label: "هندسة القائمة" },
  { src: shotPos, label: "تحليلات المبيعات" },
  { src: shotMaterials, label: "خامات المخزون" },
];

const NavBar: React.FC = () => (
  <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-3">
        <img src={logo3m} alt="3M CMS" className="h-10 w-10 object-contain" />
        <span className="font-black text-lg text-slate-900">3M CMS</span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-700">
        <a href="#features" className="hover:text-emerald-600 transition-colors">المميزات</a>
        <a href="#screenshots" className="hover:text-emerald-600 transition-colors">النظام</a>
        <a href="#pricing" className="hover:text-emerald-600 transition-colors">الأسعار</a>
        <a href="#faq" className="hover:text-emerald-600 transition-colors">تواصل معنا</a>
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/login" className="px-4 py-2 text-sm font-bold text-slate-800 rounded-xl hover:bg-slate-100 transition">تسجيل الدخول</Link>
      </div>
    </div>
  </header>
);

const Hero: React.FC<{ onWatch: () => void }> = ({ onWatch }) => (
  <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
    <div className="absolute inset-0 pointer-events-none opacity-40">
      <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-emerald-200 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-blue-200 blur-3xl" />
    </div>
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
      <div className="text-right">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 mb-6">
          <Zap size={14} /> نظام إدارة تكاليف المطاعم والكافيهات
        </span>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight text-slate-900 mb-6">
          تحكم كامل في <span style={{ color: BRAND_GREEN }}>تكاليف مطعمك</span> وزيادة ربحيتك من مكان واحد
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-xl">
          3M CMS نظام متخصص لإدارة التكاليف والمخزون والإنتاج وتحليل الربحية للمطاعم والكافيهات متعددة الفروع،
          لمساعدتك على اتخاذ قرارات أسرع وأكثر دقة.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/trial-signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-white shadow-xl shadow-emerald-500/25 hover:opacity-90 transition" style={{ background: BRAND_GREEN }}>
            <ArrowLeft size={18} /> ابدأ التجربة المجانية
          </Link>
          <a href={`${WHATSAPP}?text=${encodeURIComponent("مرحباً، أرغب في حجز عرض توضيحي (Demo) لنظام 3M CMS. من فضلكم رشحوا لي ميعاد مناسب.")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-white shadow-xl hover:opacity-90 transition" style={{ background: BRAND_BLUE }}>
            <Calendar size={18} /> حجز عرض توضيحي
          </a>
          <button onClick={onWatch} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-300 transition">
            <PlayCircle size={18} /> شاهد الفيديو التعريفي
          </button>
        </div>
      </div>
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
        <img src={shotDashboard} alt="لوحة تحكم النظام" className="relative w-full h-auto rounded-3xl shadow-2xl border border-slate-200" />
      </div>
    </div>
  </section>
);

const Stats: React.FC = () => {
  const stats = [
    { value: "+10", label: "مطاعم تستخدم النظام" },
    { value: "∞", label: "إدارة غير محدودة للفروع والمخازن" },
    { value: "لحظية", label: "تقارير في الوقت الفعلي" },
    { value: "%15+", label: "تقليل الهدر وفاقد الإنتاج" },
  ];
  return (
    <section className="py-14 bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl md:text-4xl font-black mb-2" style={{ color: BRAND_BLUE }}>{s.value}</div>
            <div className="text-sm text-slate-600 font-medium">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const Problems: React.FC = () => {
  const problems = [
    "ارتفاع تكلفة الطعام بدون معرفة السبب",
    "اختلاف الجرد عن الرصيد الفعلي",
    "صعوبة متابعة استهلاك الفروع",
    "عدم معرفة ربحية كل صنف",
    "فاقد الإنتاج والهدر غير المبرر",
    "صعوبة مراقبة أسعار الشراء",
  ];
  const solutions = [
    "تحليل تكلفة دقيق لكل صنف",
    "مراقبة مباشرة للمخزون",
    "تقارير انحراف وفاقد لحظية",
    "تحليل ربحية الفروع والأصناف",
    "متابعة الإنتاج والتسويات",
    "تقارير مالية وتشغيلية احترافية",
  ];
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">هل تواجه هذه المشاكل في مطعمك؟</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">مشاكل شائعة تواجه كل مطعم — لكن ليست بعد الآن.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-8 border-2 border-red-100">
            <h3 className="text-xl font-black mb-6 text-red-600 flex items-center gap-2"><X size={22} /> بدون النظام</h3>
            <ul className="space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-3 text-slate-700">
                  <span className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><X size={14} /></span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl p-8 border-2 text-white" style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}, hsl(220,60%,30%))`, borderColor: "transparent" }}>
            <h3 className="text-xl font-black mb-6 flex items-center gap-2" style={{ color: "hsl(160,80%,70%)" }}><Check size={22} /> مع 3M CMS</h3>
            <ul className="space-y-4">
              {solutions.map((s) => (
                <li key={s} className="flex items-start gap-3 text-slate-100">
                  <span className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center"><Check size={14} /></span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

const Features: React.FC = () => {
  const features = [
    { icon: Boxes, title: "إدارة المخزون", desc: "متابعة الأرصدة والجرد والتحويلات وحركات المخازن." },
    { icon: Factory, title: "إدارة الإنتاج", desc: "متابعة الإنتاج والفاقد ونسب الهالك." },
    { icon: LineChart, title: "تحليل التكاليف", desc: "تحليل تكلفة المنتج وربحية الأصناف." },
    { icon: BarChart3, title: "التقارير الذكية", desc: "تقارير فورية تساعد الإدارة على اتخاذ القرار." },
    { icon: Store, title: "إدارة الفروع", desc: "متابعة أداء جميع الفروع من لوحة واحدة." },
    { icon: Utensils, title: "تكامل نقاط البيع", desc: "الربط مع أنظمة الـ POS المختلفة." },
  ];
  return (
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">مميزات النظام</h2>
          <p className="text-slate-600">كل ما تحتاجه لإدارة مطعمك في مكان واحد</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group bg-white p-8 rounded-3xl border border-slate-200 hover:border-emerald-300 hover:shadow-xl hover:-translate-y-1 transition-all">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_GREEN})` }}>
                <f.icon size={26} />
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Screenshots: React.FC = () => (
  <section id="screenshots" className="py-20 bg-slate-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">صور من داخل النظام</h2>
        <p className="text-slate-600">شاشات حقيقية من داخل 3M CMS أثناء العمل</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SCREENSHOTS.map((s) => (
          <div key={s.label} className="group relative aspect-[16/10] rounded-2xl overflow-hidden border border-slate-200 shadow-md hover:shadow-2xl transition bg-slate-900">
            <img src={s.src} alt={s.label} loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-900/90 to-transparent">
              <div className="text-white font-black">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorks: React.FC = () => {
  const steps = [
    "تسجيل بيانات المطعم",
    "إضافة الفروع والمخازن",
    "إدخال الوصفات والمنتجات",
    "ربط المبيعات والمشتريات",
    "متابعة التقارير والربحية",
  ];
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">كيف يعمل النظام؟</h2>
          <p className="text-slate-600">خمس خطوات بسيطة وتصبح جاهزًا</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <div key={step} className="relative bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:border-emerald-300 transition">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg mb-4" style={{ background: BRAND_GREEN }}>{i + 1}</div>
              <div className="text-slate-800 font-bold">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Pricing: React.FC = () => {
  const plans = [
    { name: "Starter", price: "2,000", period: "جنيه / شهر", featured: false, features: ["فرع مجاني", "مخزن مجاني", "2 مستخدم", "جميع تقارير التكاليف", "دعم فني"] },
    { name: "Professional", price: "3,500", period: "جنيه / شهر", featured: true, features: ["حتى 5 فروع", "حتى 10 مستخدمين", "تقارير متقدمة", "Dashboard احترافية", "دعم فني بأولوية"] },
    { name: "Enterprise", price: "تواصل معنا", period: "خطة مخصصة", featured: false, features: ["فروع غير محدودة", "مستخدمون غير محدودين", "تخصيصات خاصة", "API Integration", "مدير حساب مخصص"] },
  ];
  return (
    <section id="pricing" className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">الباقات والأسعار</h2>
          <p className="text-slate-600">اختر الباقة المناسبة لحجم مطعمك</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div key={p.name} className={`relative rounded-3xl p-8 border-2 transition ${p.featured ? "shadow-2xl scale-[1.02] text-white" : "bg-white border-slate-200 hover:border-emerald-300"}`} style={p.featured ? { background: `linear-gradient(135deg, ${BRAND_BLUE}, hsl(220,60%,28%))`, borderColor: BRAND_GREEN } : {}}>
              {p.featured && (<span className="absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-black text-white shadow" style={{ background: BRAND_GREEN }}>الأكثر شيوعًا</span>)}
              <h3 className={`text-2xl font-black mb-2 ${p.featured ? "text-white" : "text-slate-900"}`}>{p.name}</h3>
              <div className="mb-6">
                <span className={`text-4xl font-black ${p.featured ? "text-white" : "text-slate-900"}`}>{p.price}</span>
                <span className={`text-sm mr-2 ${p.featured ? "text-slate-200" : "text-slate-500"}`}>{p.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2 ${p.featured ? "text-slate-100" : "text-slate-700"}`}>
                    <Check size={18} className={p.featured ? "text-emerald-300 flex-shrink-0 mt-0.5" : "text-emerald-600 flex-shrink-0 mt-0.5"} />
                    <span className="text-sm">{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/login" className={`block text-center px-6 py-3 rounded-xl font-bold transition ${p.featured ? "bg-white text-slate-900 hover:bg-slate-100" : "text-white hover:opacity-90"}`} style={!p.featured ? { background: BRAND_GREEN } : {}}>
                ابدأ الآن
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Comparison: React.FC = () => {
  const rows = [
    ["متابعة المخزون", "يدوي", "لحظي"],
    ["تكلفة المنتجات", "تقديرية", "دقيقة"],
    ["تقارير الفاقد", "غير متوفرة", "متوفرة"],
    ["ربحية الأصناف", "صعبة", "فورية"],
    ["إدارة الفروع", "معقدة", "مركزية"],
  ];
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">مقارنة بالنظام التقليدي</h2>
          <p className="text-slate-600">شوف الفرق بنفسك</p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
          <table className="w-full text-right">
            <thead>
              <tr className="text-white" style={{ background: BRAND_BLUE }}>
                <th className="p-4 font-black">العنصر</th>
                <th className="p-4 font-black">الإدارة التقليدية</th>
                <th className="p-4 font-black" style={{ background: BRAND_GREEN }}>3M CMS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r[0]} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="p-4 font-bold text-slate-900">{r[0]}</td>
                  <td className="p-4 text-slate-600">{r[1]}</td>
                  <td className="p-4 font-bold text-emerald-700">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const Testimonials: React.FC = () => {
  const t = [
    { quote: "استطعنا تقليل الهدر بنسبة 15% خلال أول شهر.", name: "مطعم عائلي — القاهرة" },
    { quote: "أصبحنا نعرف تكلفة وربحية كل صنف بدقة.", name: "سلسلة كافيهات — الإسكندرية" },
  ];
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">آراء عملائنا</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {t.map((x) => (
            <div key={x.name} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <p className="text-lg text-slate-800 leading-relaxed mb-4">"{x.quote}"</p>
              <div className="text-sm font-bold" style={{ color: BRAND_GREEN }}>— {x.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const CTA: React.FC = () => (
  <section className="py-24" style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}, hsl(220,60%,25%))` }}>
    <div className="max-w-4xl mx-auto text-center px-4">
      <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">جاهز لزيادة ربحية مطعمك؟</h2>
      <p className="text-slate-200 text-lg mb-8 max-w-2xl mx-auto">انضم إلى عشرات المطاعم اللي بتستخدم 3M CMS لإدارة تكاليفها وزيادة أرباحها</p>
      <Link to="/trial-signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-black text-white shadow-2xl hover:opacity-90 transition" style={{ background: BRAND_GREEN }}>
        ابدأ تجربتك المجانية الآن <ArrowLeft size={20} />
      </Link>
    </div>
  </section>
);

const Footer: React.FC = () => (
  <footer id="faq" className="bg-slate-900 text-slate-300 py-14">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-4 gap-8">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <img src={logo3m} alt="3M CMS" className="h-10 w-10 object-contain" />
          <span className="font-black text-white text-lg">3M CMS</span>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">نظام متكامل لإدارة تكاليف المطاعم والكافيهات متعددة الفروع.</p>
        <div className="flex items-center gap-3">
          <a href={FACEBOOK} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-10 h-10 rounded-full bg-slate-800 hover:bg-blue-600 flex items-center justify-center transition"><Facebook size={18} /></a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="w-10 h-10 rounded-full bg-slate-800 hover:bg-emerald-600 flex items-center justify-center transition"><MessageCircle size={18} /></a>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-full bg-slate-800 hover:bg-pink-600 flex items-center justify-center transition"><Instagram size={18} /></a>
        </div>
      </div>
      <div>
        <h4 className="text-white font-black mb-4">النظام</h4>
        <ul className="space-y-2 text-sm">
          <li><a href="#features" className="hover:text-emerald-400">عن النظام</a></li>
          <li><a href="#features" className="hover:text-emerald-400">المميزات</a></li>
          <li><a href="#pricing" className="hover:text-emerald-400">الأسعار</a></li>
        </ul>
      </div>
      <div>
        <h4 className="text-white font-black mb-4">تواصل معنا</h4>
        <ul className="space-y-2 text-sm">
          <li>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-emerald-400">
              <MessageCircle size={16} /> الدعم الفني (واتساب)
            </a>
          </li>
          <li>سياسة الخصوصية</li>
          <li>الشروط والأحكام</li>
        </ul>
      </div>
      <div>
        <h4 className="text-white font-black mb-4">جاهز للبدء؟</h4>
        <Link to="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition" style={{ background: BRAND_GREEN }}>
          تسجيل الدخول <ChevronLeft size={16} />
        </Link>
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
      © {new Date().getFullYear()} 3M CMS — Powered by Mohamed Abdel Aal. جميع الحقوق محفوظة.
    </div>
  </footer>
);

const VideoModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition" aria-label="إغلاق">
          <X size={18} />
        </button>
        <video src={INTRO_VIDEO} controls autoPlay className="w-full h-full object-contain bg-black">
          المتصفح لا يدعم تشغيل الفيديو.
        </video>
      </div>
    </div>
  );
};

export const HomePage: React.FC = () => {
  const [showVideo, setShowVideo] = useState(false);
  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900" style={{ colorScheme: "light" }}>
      <NavBar />
      <main>
        <Hero onWatch={() => setShowVideo(true)} />
        <Stats />
        <Problems />
        <Features />
        <Screenshots />
        <HowItWorks />
        <Pricing />
        <Comparison />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
      <VideoModal open={showVideo} onClose={() => setShowVideo(false)} />
    </div>
  );
};

export default HomePage;
