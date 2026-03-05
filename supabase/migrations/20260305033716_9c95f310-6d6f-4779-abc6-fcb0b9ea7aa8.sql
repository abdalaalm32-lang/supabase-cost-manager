
CREATE OR REPLACE FUNCTION public.get_actual_global_stock(p_stock_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_stock numeric := 0;
  purchases_in numeric := 0;
  production_in numeric := 0;
  production_out numeric := 0;
  waste_out numeric := 0;
  stocktake_adj numeric := 0;
  pos_out numeric := 0;
BEGIN
  -- Purchases IN (completed only)
  SELECT COALESCE(SUM(pi.quantity), 0) INTO purchases_in
  FROM purchase_items pi
  JOIN purchase_orders po ON po.id = pi.purchase_order_id
  WHERE pi.stock_item_id = p_stock_item_id
    AND po.status = 'مكتمل';

  -- Production produced IN (completed only)
  SELECT COALESCE(SUM(pr.produced_qty), 0) INTO production_in
  FROM production_records pr
  WHERE pr.product_id = p_stock_item_id
    AND pr.status = 'مكتمل';

  -- Production ingredients OUT (completed only)
  SELECT COALESCE(SUM(ping.required_qty), 0) INTO production_out
  FROM production_ingredients ping
  JOIN production_records pr ON pr.id = ping.production_record_id
  WHERE ping.stock_item_id = p_stock_item_id
    AND pr.status = 'مكتمل';

  -- Waste OUT (completed only)
  SELECT COALESCE(SUM(wi.quantity), 0) INTO waste_out
  FROM waste_items wi
  JOIN waste_records wr ON wr.id = wi.waste_record_id
  WHERE wi.stock_item_id = p_stock_item_id
    AND wr.status = 'مكتمل';

  -- Stocktake adjustments (counted - book for completed stocktakes, excluding instant)
  SELECT COALESCE(SUM(si.counted_qty - si.book_qty), 0) INTO stocktake_adj
  FROM stocktake_items si
  JOIN stocktakes st ON st.id = si.stocktake_id
  WHERE si.stock_item_id = p_stock_item_id
    AND st.status = 'مكتمل'
    AND st.type != 'فحص مخزون فوري';

  -- POS Sales OUT via recipes (convert using conversion_factor)
  SELECT COALESCE(SUM(
    (ri.qty / COALESCE(NULLIF(sitm.conversion_factor, 0), 1)) * psi.quantity
  ), 0) INTO pos_out
  FROM pos_sale_items psi
  JOIN pos_sales ps ON ps.id = psi.sale_id
  JOIN recipes r ON r.menu_item_id = psi.pos_item_id
  JOIN recipe_ingredients ri ON ri.recipe_id = r.id
  JOIN stock_items sitm ON sitm.id = ri.stock_item_id
  WHERE ri.stock_item_id = p_stock_item_id
    AND ps.status = 'مكتمل';

  -- Transfers net to 0 globally, so we skip them

  total_stock := purchases_in + production_in - production_out - waste_out + stocktake_adj - pos_out;
  
  RETURN GREATEST(total_stock, 0);
END;
$$;
