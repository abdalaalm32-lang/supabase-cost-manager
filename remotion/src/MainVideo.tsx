import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Series } from "remotion";
import { loadFont } from "@remotion/google-fonts/Cairo";

const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"], subsets: ["arabic", "latin"] });

const BLUE = "hsl(220, 70%, 20%)";
const GREEN = "hsl(160, 65%, 40%)";

const shots = [
  { src: "shots/dashboard.png", title: "لوحة التحكم الذكية", sub: "نظرة شاملة على أداء مطعمك لحظياً" },
  { src: "shots/pos.png", title: "نقطة البيع (POS)", sub: "سرعة وسهولة في تسجيل الطلبات" },
  { src: "shots/inventory-materials.png", title: "خامات المخزون", sub: "إدارة كاملة لكل الخامات والمكونات" },
  { src: "shots/inventory-balances.png", title: "أرصدة المخزون", sub: "متابعة دقيقة للكميات والتكاليف" },
  { src: "shots/cost-analysis.png", title: "تحليل التكاليف", sub: "قرارات مبنية على أرقام حقيقية" },
  { src: "shots/cost-analysis-2.png", title: "تفاصيل التكلفة", sub: "تحليل عميق لكل صنف وقسم" },
  { src: "shots/variance-analysis.png", title: "تحليل الانحرافات", sub: "اكتشاف الفاقد قبل ما يأثر على الربح" },
  { src: "shots/variance-details.png", title: "تفاصيل الانحرافات", sub: "نسب دقيقة لكل خامة على حدة" },
  { src: "shots/indirect-expenses.png", title: "المصروفات غير المباشرة", sub: "توزيع ذكي للمصاريف على الأصناف" },
  { src: "shots/pnl.png", title: "قائمة الأرباح والخسائر", sub: "ربحيتك الحقيقية بوضوح" },
  { src: "shots/menu-analysis.png", title: "تحليل قائمة الطعام", sub: "اعرف مين النجم ومين اللي بيخسرك" },
];

// Durations
const INTRO = 120;
const SHOT_DUR = 90;
const OUTRO = 120;
export const TOTAL = INTRO + shots.length * SHOT_DUR + OUTRO;

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = interpolate(frame, [0, TOTAL], [0, 60]);
  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${BLUE} 0%, hsl(220,60%,25%) 50%, ${BLUE} 100%)`,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle at ${20 + shift}% 30%, hsla(160,65%,40%,0.25), transparent 40%), radial-gradient(circle at ${80 - shift}% 70%, hsla(220,80%,50%,0.3), transparent 45%)`,
      }} />
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const titleO = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [15, 40], [40, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const subO = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  const tagO = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily }} dir="rtl">
      <img src={staticFile("logo.png")} width={240} height={240}
        alt="3M CMS"
        style={{ transform: `scale(${logoScale})`, filter: "drop-shadow(0 10px 40px rgba(0,0,0,0.5))" }} />
      <div style={{
        color: "white", fontSize: 140, fontWeight: 900, marginTop: 30,
        opacity: titleO, transform: `translateY(${titleY}px)`, letterSpacing: 8,
      }}>3M CMS</div>
      <div style={{ color: "hsl(160,80%,70%)", fontSize: 42, fontWeight: 700, marginTop: 15, opacity: subO }}>
        نظام إدارة تكاليف المطاعم والكافيهات
      </div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 28, fontWeight: 400, marginTop: 30, opacity: tagO, textAlign: "center", maxWidth: 1000 }}>
        تحكم كامل · قرارات أذكى · ربحية أعلى
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ src: string; title: string; sub: string; index: number }> = ({ src, title, sub, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const outFade = interpolate(frame, [SHOT_DUR - 15, SHOT_DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(inS, [0, 1], [0.94, 1]);
  const y = interpolate(inS, [0, 1], [40, 0]);
  const kenBurns = interpolate(frame, [0, SHOT_DUR], [1, 1.05]);
  const textO = interpolate(frame, [8, 25], [0, 1], { extrapolateRight: "clamp" });
  const textX = interpolate(frame, [8, 25], [-40, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily, opacity: outFade }} dir="rtl">
      {/* Top overlay bar with title */}
      <div style={{
        position: "absolute", top: 0, right: 0, left: 0, padding: "40px 80px 60px",
        background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        opacity: textO, transform: `translateX(${textX}px)`,
      }}>
        <div style={{ textAlign: "right", flex: 1 }}>
          <div style={{ color: "hsl(160,85%,75%)", fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>
            {String(index + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
          </div>
          <div style={{ color: "white", fontSize: 62, fontWeight: 900, lineHeight: 1.1, textShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
            {title}
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 26, fontWeight: 500, marginTop: 12, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
            {sub}
          </div>
        </div>
        <div style={{
          padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 22, fontWeight: 900,
          backdropFilter: "blur(0px)",
        }}>3M CMS</div>
      </div>

      {/* Screenshot */}
      <div style={{
        width: 1500, height: 850, borderRadius: 24, overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
        transform: `translateY(${y + 90}px) scale(${scale})`,
      }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", transform: `scale(${kenBurns})`, transformOrigin: "center" }} />
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily }} dir="rtl">
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" }), textAlign: "center" }}>
        <img src={staticFile("logo.png")} width={140} height={140} alt="3M CMS" style={{ marginBottom: 30, filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.5))" }} />
        <div style={{ color: "white", fontSize: 100, fontWeight: 900, letterSpacing: 4 }}>ابدأ الآن مع 3M CMS</div>
        <div style={{ color: "hsl(160,80%,70%)", fontSize: 40, fontWeight: 700, marginTop: 24 }}>تحكم كامل في تكاليفك · قرارات أدق · ربحية أعلى</div>
        <div style={{
          marginTop: 60, display: "inline-block", padding: "24px 70px", borderRadius: 24,
          background: GREEN, color: "white", fontSize: 40, fontWeight: 900,
          boxShadow: "0 20px 50px hsla(160,65%,40%,0.4)",
        }}>ابدأ تجربتك المجانية 14 يوم</div>
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Bg />
      <Series>
        <Series.Sequence durationInFrames={INTRO}><Intro /></Series.Sequence>
        {shots.map((s, i) => (
          <Series.Sequence key={s.src} durationInFrames={SHOT_DUR}>
            <Shot src={s.src} title={s.title} sub={s.sub} index={i} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={OUTRO}><Outro /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
