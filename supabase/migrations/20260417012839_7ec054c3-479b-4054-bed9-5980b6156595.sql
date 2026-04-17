-- Add shift_id to pos_sales for accurate shift linking
ALTER TABLE public.pos_sales 
ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.pos_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_shift_id ON public.pos_sales(shift_id);

-- Add shift_id to pos_returns for accurate shift linking
ALTER TABLE public.pos_returns
ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'كاش';

CREATE INDEX IF NOT EXISTS idx_pos_returns_shift_id ON public.pos_returns(shift_id);

-- Add closing/reconciliation fields to pos_shifts
ALTER TABLE public.pos_shifts
ADD COLUMN IF NOT EXISTS actual_cash numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS expected_cash numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS variance numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_sales numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_cash_sales numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_visa_sales numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_returns_cash numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_returns_visa numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_expenses numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS invoice_count integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS closing_notes text DEFAULT NULL;