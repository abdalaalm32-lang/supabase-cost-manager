// Smart emoji + gradient placeholder for POS items based on item name / category.
// No external images — deterministic emoji lookup with a themed color gradient.

type EmojiEntry = { patterns: RegExp; emoji: string; gradient: string };

// Order matters — most specific first.
const EMOJI_MAP: EmojiEntry[] = [
  // Pizza
  { patterns: /بيتزا|pizza|مارجريتا|margherita|بيبروني|pepperoni|باربكيو|bbq/i, emoji: "🍕", gradient: "from-orange-500/20 to-red-500/20" },
  // Burgers & sandwiches
  { patterns: /برجر|برغر|burger/i, emoji: "🍔", gradient: "from-amber-500/20 to-orange-600/20" },
  { patterns: /هوت\s*دوج|hot\s*dog/i, emoji: "🌭", gradient: "from-red-500/20 to-yellow-500/20" },
  { patterns: /شاورما|shawarma/i, emoji: "🌯", gradient: "from-amber-600/20 to-yellow-600/20" },
  { patterns: /تاكو|taco/i, emoji: "🌮", gradient: "from-yellow-500/20 to-orange-500/20" },
  { patterns: /ساندوتش|sandwich|سندوتش/i, emoji: "🥪", gradient: "from-yellow-500/20 to-amber-500/20" },
  // Sides & starters
  { patterns: /بطاطس|فرايز|fries|potato/i, emoji: "🍟", gradient: "from-yellow-500/20 to-red-500/20" },
  { patterns: /ناجتس|nuggets/i, emoji: "🍗", gradient: "from-amber-500/20 to-yellow-600/20" },
  { patterns: /سلطة|salad/i, emoji: "🥗", gradient: "from-green-500/20 to-emerald-500/20" },
  { patterns: /شوربة|soup/i, emoji: "🍲", gradient: "from-orange-500/20 to-amber-600/20" },
  { patterns: /مقبلات|appetizer|starter/i, emoji: "🥟", gradient: "from-amber-500/20 to-orange-500/20" },
  // Proteins & mains
  { patterns: /دجاج|chicken|فراخ/i, emoji: "🍗", gradient: "from-amber-500/20 to-orange-500/20" },
  { patterns: /لحم|beef|steak|كباب|kebab/i, emoji: "🥩", gradient: "from-red-600/20 to-rose-600/20" },
  { patterns: /سمك|fish|جمبري|shrimp|سي\s*فود|seafood/i, emoji: "🐟", gradient: "from-sky-500/20 to-cyan-500/20" },
  { patterns: /باستا|مكرونة|pasta|spaghetti/i, emoji: "🍝", gradient: "from-yellow-500/20 to-red-500/20" },
  { patterns: /رز|أرز|rice/i, emoji: "🍚", gradient: "from-slate-400/20 to-amber-400/20" },
  { patterns: /كريب|crepe/i, emoji: "🥞", gradient: "from-amber-500/20 to-orange-400/20" },
  { patterns: /وافل|waffle/i, emoji: "🧇", gradient: "from-amber-500/20 to-yellow-500/20" },
  { patterns: /فطير|فطيرة|pastry/i, emoji: "🥐", gradient: "from-amber-400/20 to-yellow-500/20" },
  { patterns: /خبز|bread|توست|toast/i, emoji: "🍞", gradient: "from-amber-400/20 to-yellow-600/20" },
  { patterns: /بيض|egg/i, emoji: "🍳", gradient: "from-yellow-400/20 to-orange-400/20" },
  { patterns: /جبن|cheese/i, emoji: "🧀", gradient: "from-yellow-500/20 to-amber-500/20" },
  // Desserts
  { patterns: /كيك|cake|جاتوه|جاتوة/i, emoji: "🍰", gradient: "from-pink-500/20 to-rose-500/20" },
  { patterns: /ايس\s*كريم|ice\s*cream|آيس/i, emoji: "🍦", gradient: "from-pink-400/20 to-blue-400/20" },
  { patterns: /دونات|donut/i, emoji: "🍩", gradient: "from-pink-500/20 to-purple-500/20" },
  { patterns: /شوكولاتة|chocolate|شيكولاتة/i, emoji: "🍫", gradient: "from-amber-700/20 to-orange-800/20" },
  { patterns: /كوكيز|cookie|بسكويت/i, emoji: "🍪", gradient: "from-amber-500/20 to-yellow-600/20" },
  { patterns: /حلا|حلوى|dessert|كنافة|بقلاوة|بسبوسة/i, emoji: "🍮", gradient: "from-amber-400/20 to-orange-500/20" },
  { patterns: /فاكهة|fruit|فراولة|strawberry|مانجو|mango|تفاح|apple/i, emoji: "🍓", gradient: "from-rose-500/20 to-red-500/20" },
  // Beverages — sodas
  { patterns: /كوكاكولا|كوكا|coca|cola|بيبسي|pepsi|سبرايت|sprite|فانتا|fanta|سفن|7\s*up|صودا|soda/i, emoji: "🥤", gradient: "from-red-500/20 to-orange-500/20" },
  // Water
  { patterns: /مياه|ماء|water/i, emoji: "💧", gradient: "from-sky-400/20 to-blue-500/20" },
  // Juice
  { patterns: /عصير|juice|ليموناضة|lemonade/i, emoji: "🧃", gradient: "from-orange-400/20 to-yellow-400/20" },
  // Coffee & hot drinks
  { patterns: /قهوة|coffee|كابتشينو|cappuccino|لاتيه|latte|اسبريسو|espresso|نسكافيه|nescafe|موكا|mocha/i, emoji: "☕", gradient: "from-amber-800/20 to-yellow-900/20" },
  { patterns: /شاي|tea|ينسون|كركديه|قرفة/i, emoji: "🍵", gradient: "from-emerald-500/20 to-green-600/20" },
  { patterns: /هوت\s*شوكليت|hot\s*chocolate|ساحن|سخن/i, emoji: "☕", gradient: "from-amber-700/20 to-orange-800/20" },
  // Cold drinks
  { patterns: /ميلك\s*شيك|milkshake|شيك|smoothie|سموزي|فرابيه|frappe/i, emoji: "🥤", gradient: "from-pink-400/20 to-purple-500/20" },
  { patterns: /موهيتو|mojito|ليمون\s*بالنعناع|lemon\s*mint/i, emoji: "🍹", gradient: "from-emerald-400/20 to-lime-500/20" },
  { patterns: /كوكتيل|cocktail|مشروب|drink|beverage/i, emoji: "🍹", gradient: "from-purple-500/20 to-pink-500/20" },
];

const DEFAULT: EmojiEntry = { patterns: /.*/, emoji: "🍽️", gradient: "from-slate-500/20 to-slate-600/20" };

export function getPosItemVisual(itemName?: string | null, categoryName?: string | null): { emoji: string; gradient: string } {
  const text = `${itemName || ""} ${categoryName || ""}`.trim();
  for (const entry of EMOJI_MAP) {
    if (entry.patterns.test(text)) return { emoji: entry.emoji, gradient: entry.gradient };
  }
  return { emoji: DEFAULT.emoji, gradient: DEFAULT.gradient };
}
