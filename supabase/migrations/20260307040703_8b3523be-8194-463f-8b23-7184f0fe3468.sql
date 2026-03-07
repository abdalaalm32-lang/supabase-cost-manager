
ALTER TABLE public.purchase_orders ADD COLUMN department_id uuid REFERENCES public.departments(id) DEFAULT NULL;
