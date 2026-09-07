import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MenuChannel {
  id: string;
  name: string;
  code: string | null;
  markup_percent: number;
  is_default: boolean;
  active: boolean;
}

const STORAGE_KEY = "menu_channel";

/**
 * Shared sales-channel pricing for menu costing pages.
 * Returns the channel list, the selected channel (persisted across pages)
 * and a helper that resolves the effective selling price of a POS item:
 *   custom channel price  >  base price + channel markup%  >  base price
 */
export const useMenuChannelPricing = (companyId?: string | null) => {
  const [channels, setChannels] = useState<MenuChannel[]>([]);
  const [channelId, setChannelIdRaw] = useState<string>(() => sessionStorage.getItem(STORAGE_KEY) || "base");
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());

  const setChannelId = useCallback((v: string) => {
    setChannelIdRaw(v);
    sessionStorage.setItem(STORAGE_KEY, v);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pos_channels")
        .select("id, name, code, markup_percent, is_default, active")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("sort_order")
        .order("created_at");
      if (!cancelled && data) setChannels(data as unknown as MenuChannel[]);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !channelId || channelId === "base") {
      setPriceMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pos_item_channel_prices")
        .select("pos_item_id, price, active")
        .eq("channel_id", channelId);
      if (cancelled) return;
      const m = new Map<string, number>();
      (data as any[] | null)?.forEach((r) => {
        if (r.active !== false && r.price != null) m.set(r.pos_item_id, Number(r.price));
      });
      setPriceMap(m);
    })();
    return () => { cancelled = true; };
  }, [companyId, channelId]);

  const activeChannel = useMemo(
    () => (channelId === "base" ? null : channels.find((c) => c.id === channelId) || null),
    [channels, channelId]
  );

  const markup = Number(activeChannel?.markup_percent ?? 0);

  const resolvePrice = useCallback(
    (itemId: string, basePrice: number) => {
      if (!activeChannel) return basePrice;
      const custom = priceMap.get(itemId);
      if (custom != null) return custom;
      return Number((basePrice * (1 + markup / 100)).toFixed(2));
    },
    [activeChannel, priceMap, markup]
  );

  /** Returns a new array with `price` replaced by the channel price (base price kept as `base_price`). */
  const applyChannelPrices = useCallback(
    <T extends { id: string; price: number }>(items: T[]): (T & { base_price: number })[] =>
      items.map((i) => ({
        ...i,
        base_price: Number(i.price ?? 0),
        price: resolvePrice(i.id, Number(i.price ?? 0)),
      })),
    [resolvePrice]
  );

  const channelLabel = activeChannel ? activeChannel.name : "السعر الأساسي";
  const customCount = activeChannel ? priceMap.size : 0;

  return { channels, channelId, setChannelId, activeChannel, markup, resolvePrice, applyChannelPrices, channelLabel, customCount };
};
