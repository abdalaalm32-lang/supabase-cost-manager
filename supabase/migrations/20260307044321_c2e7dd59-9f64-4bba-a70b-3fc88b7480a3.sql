
ALTER TABLE public.transfers 
  ADD COLUMN source_department_id uuid REFERENCES public.departments(id) DEFAULT NULL,
  ADD COLUMN destination_department_id uuid REFERENCES public.departments(id) DEFAULT NULL;
