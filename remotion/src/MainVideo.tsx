import React from "react";
import { AbsoluteFill, Sequence, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Series } from "remotion";
import { loadFont } from "@remotion/google-fonts/Cairo";

const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"], subsets: ["arabic", "latin"] });

const BLUE = "hsl(220, 70%, 20%)";
const GREEN = "hsl(160, 65%, 40%)";

const shots = [
  { src: "shots/dashboard.png", label: "لوحة التحكم" },
  { src: "shots/cost-analysis.png", label: "تحليل التكاليف" },
  { src: "shots/variance-analysis.png", label: "تحليل الانحرافات" },
  { src: "shots/inventory-balances.png", label: "أرصدة المخزون" },
  { src: "shots/pnl.png", label: "قائمة الأرباح والخسائر" },
  { src: "shots/menu-engineering.png", label: "هندسة القائمة" },
  { src: "shots/pos-analytics.png", label: "تحليلات المبيعات" },
  { src: "shots/inventory-materials.png", label: "خامات المخزون" },
];

// Durations
const INTRO = 90;
const SHOT_DUR = 60;
const OUTRO = 90;
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
  const titleY = interpolate(spring({ frame: frame - 10, fps, config: { damping: 15 } }), [0, 1], [40, 0]);
  const titleO = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });
  const subO = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily }}>
      <img src={staticFile("logo.png")} width={220} height={220}
        style={{ transform: `scale(${logoScale})`, filter: "drop-shadow(0 10px 40px rgba(0,0,0,0.5))" }} />
      <div style={{
        color: "white", fontSize: 120, fontWeight: 900, marginTop: 30,
        opacity: titleO, transform: `translateY(${titleY}px)`, letterSpacing: 6,
      }}>3M CMS</div>
      <div style={{ color: "hsl(160,80%,70%)", fontSize: 34, fontWeight: 700, marginTop: 10, opacity: subO }} dir="rtl">
        نظام إدارة تكاليف المطاعم والكافيهات
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ src: string; label: string; index: number }> = ({ src, label, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const outFade = interpolate(frame, [SHOT_DUR - 12, SHOT_DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(inS, [0, 1], [0.94, 1]);
  const y = interpolate(inS, [0, 1], [30, 0]);
  const kenBurns = interpolate(frame, [0, SHOT_DUR], [1, 1.06]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily, opacity: outFade }}>
      <div style={{ position: "absolute", top: 60, right: 80, textAlign: "right", opacity: interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" }) }} dir="rtl">
        <div style={{ color: "hsl(160,80%,70%)", fontSize: 22, fontWeight: 700 }}>0{index + 1} / 0{shots.length}</div>
        <div style={{ color: "white", fontSize: 56, fontWeight: 900, marginTop: 6 }}>{label}</div>
      </div>
      <div style={{
        width: 1500, height: 850, borderRadius: 24, overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
        transform: `translateY(${y + 60}px) scale(${scale})`,
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
        <div style={{ color: "white", fontSize: 90, fontWeight: 900 }}>ابدأ الآن مع 3M CMS</div>
        <div style={{ color: "hsl(160,80%,70%)", fontSize: 36, fontWeight: 700, marginTop: 20 }}>تحكم كامل في تكاليفك · قرارات أدق · ربحية أعلى</div>
        <div style={{
          marginTop: 50, display: "inline-block", padding: "22px 60px", borderRadius: 22,
          background: GREEN, color: "white", fontSize: 38, fontWeight: 900,
          boxShadow: "0 20px 50px hsla(160,65%,40%,0.4)",
        }}>mgsc.lovable.app</div>
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
            <Shot src={s.src} label={s.label} index={i} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={OUTRO}><Outro /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
