
-- Add invoice number, tax fields to pos_sales
ALTER TABLE public.pos_sales 
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS tax_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN invoice_number ~ '^INV-[0-9]+$' 
    THEN CAST(SUBSTRING(invoice_number FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM pos_sales WHERE company_id = p_company_id;
  RETURN 'INV-' || LPAD(next_num::text, 5, '0');
END;
$$;

-- Add UPDATE and DELETE policies to pos_sales
CREATE POLICY "Company update" ON public.pos_sales FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_sales FOR DELETE USING (company_id = get_user_company_id());

-- Add UPDATE and DELETE policies to pos_sale_items
CREATE POLICY "Access update" ON public.pos_sale_items FOR UPDATE
USING (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));

CREATE POLICY "Access delete" ON public.pos_sale_items FOR DELETE
USING (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));
