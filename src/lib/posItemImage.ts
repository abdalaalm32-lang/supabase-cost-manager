// Maps a POS item name (Arabic/English) to a realistic food image URL.
// Uses a curated keyword dictionary → LoremFlickr (deterministic via lock hash),
// with a stable per-item seed so the same item always shows the same image.

const KEYWORD_MAP: Array<{ patterns: RegExp; keyword: string }> = [
  // Pizza
  { patterns: /مارجريتا|margherita/i, keyword: "margherita,pizza" },
  { patterns: /باربكيو|barbecue|bbq/i, keyword: "bbq,pizza" },
  { patterns: /بيبروني|pepperoni/i, keyword: "pepperoni,pizza" },
  { patterns: /(مشكل|ميكس|mix).*(جبن|cheese)/i, keyword: "cheese,pizza" },
  { patterns: /(مشكل|ميكس|mix).*(لحوم|meat)/i, keyword: "meat,pizza" },
  { patterns: /سي\s*فود|seafood|بحري/i, keyword: "seafood,pizza" },
  { patterns: /فور\s*سيزون|four\s*season/i, keyword: "four,seasons,pizza" },
  { patterns: /دجاج\s*رانش|chicken\s*ranch/i, keyword: "chicken,ranch,pizza" },
  { patterns: /(خضار|vegetable|veggie).*(بيتزا|pizza)|بيتزا.*(خضار|veggie)/i, keyword: "vegetable,pizza" },
  { patterns: /باولو|شيز|four\s*cheese/i, keyword: "cheese,pizza" },
  { patterns: /بيتزا|pizza/i, keyword: "pizza" },
  // Burgers & sandwiches
  { patterns: /برجر|برغر|burger/i, keyword: "burger" },
  { patterns: /ساندوتش|sandwich/i, keyword: "sandwich" },
  { patterns: /شاورما|shawarma/i, keyword: "shawarma" },
  { patterns: /هوت\s*دوج|hot\s*dog/i, keyword: "hotdog" },
  // Sides & starters
  { patterns: /بطاطس|فرايز|fries|potato/i, keyword: "fries" },
  { patterns: /سلطة|salad/i, keyword: "salad" },
  { patterns: /شوربة|soup/i, keyword: "soup" },
  { patterns: /مقبلات|appetizer|starter/i, keyword: "appetizer" },
  { patterns: /ناجتس|nuggets/i, keyword: "nuggets" },
  { patterns: /دجاج|chicken/i, keyword: "chicken" },
  { patterns: /لحم|beef|steak/i, keyword: "steak" },
  { patterns: /سمك|fish/i, keyword: "fish" },
  { patterns: /باستا|مكرونة|pasta|spaghetti/i, keyword: "pasta" },
  { patterns: /رز|أرز|rice/i, keyword: "rice" },
  { patterns: /كريب|crepe/i, keyword: "crepe" },
  { patterns: /وافل|waffle/i, keyword: "waffle" },
  { patterns: /فطير|فطيرة/i, keyword: "pastry" },
  // Desserts
  { patterns: /كيك|cake|جاتوه/i, keyword: "cake" },
  { patterns: /ايس\s*كريم|ice\s*cream/i, keyword: "icecream" },
  { patterns: /دونات|donut/i, keyword: "donut" },
  { patterns: /شوكولاتة|chocolate/i, keyword: "chocolate,dessert" },
  { patterns: /حلا|حلوى|dessert/i, keyword: "dessert" },
  // Beverages
  { patterns: /كوكاكولا|كوكا|coca|cola/i, keyword: "cola,can" },
  { patterns: /سبرايت|sprite/i, keyword: "sprite,can" },
  { patterns: /فانتا|fanta/i, keyword: "fanta,can" },
  { patterns: /بيبسي|pepsi/i, keyword: "pepsi,can" },
  { patterns: /سفن|7\s*up/i, keyword: "7up,can" },
  { patterns: /مياه|ماء|water/i, keyword: "water,bottle" },
  { patterns: /عصير\s*برتقال|orange\s*juice/i, keyword: "orange,juice" },
  { patterns: /عصير\s*ليمون|lemonade/i, keyword: "lemonade" },
  { patterns: /عصير\s*مانجو|mango\s*juice/i, keyword: "mango,juice" },
  { patterns: /عصير\s*فراولة|strawberry\s*juice/i, keyword: "strawberry,juice" },
  { patterns: /ليمون\s*بالنعناع|lemon\s*mint|موهيتو|mojito/i, keyword: "mojito,mint" },
  { patterns: /عصير|juice/i, keyword: "juice,glass" },
  { patterns: /قهوة|coffee|كابتشينو|cappuccino|لاتيه|latte|اسبريسو|espresso/i, keyword: "coffee" },
  { patterns: /شاي|tea/i, keyword: "tea,cup" },
  { patterns: /نسكافيه|nescafe/i, keyword: "nescafe" },
  { patterns: /هوت\s*شوكليت|hot\s*chocolate/i, keyword: "hot,chocolate" },
  { patterns: /ميلك\s*شيك|milkshake|شيك/i, keyword: "milkshake" },
  { patterns: /سموزي|smoothie/i, keyword: "smoothie" },
  { patterns: /مشروب|drink|beverage/i, keyword: "drink,glass" },
];

// Cheap deterministic hash for stable image lock
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Returns a realistic image URL for a POS item, deterministic per item.
 * Uses LoremFlickr (which redirects to real Flickr photos matching the keyword).
 */
export function getPosItemImage(itemName?: string | null, categoryName?: string | null): string {
  const text = `${itemName || ""} ${categoryName || ""}`.trim();
  let keyword = "food,meal";
  for (const entry of KEYWORD_MAP) {
    if (entry.patterns.test(text)) {
      keyword = entry.keyword;
      break;
    }
  }
  const lock = hashCode(text || keyword) % 100000;
  return `https://loremflickr.com/240/240/${encodeURIComponent(keyword)}?lock=${lock}`;
}

// Fallback icon URL if image fails to load — a neutral food icon
export const POS_ITEM_IMAGE_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M12 24h40l-4 28H16z'/><path d='M20 24V16a12 12 0 0 1 24 0v8'/></svg>`
  );
