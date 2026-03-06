
ALTER TABLE public.companies
ADD COLUMN subscription_type text NOT NULL DEFAULT 'unlimited',
ADD COLUMN subscription_minutes integer NULL,
ADD COLUMN subscription_start timestamptz NULL,
ADD COLUMN subscription_end timestamptz NULL;
