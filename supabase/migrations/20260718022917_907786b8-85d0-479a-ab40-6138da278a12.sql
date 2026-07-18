
CREATE TABLE public.home_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name TEXT NOT NULL,
  quote TEXT NOT NULL,
  logo_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.home_testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_testimonials TO authenticated;
GRANT ALL ON public.home_testimonials TO service_role;

ALTER TABLE public.home_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active testimonials"
  ON public.home_testimonials FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert testimonials"
  ON public.home_testimonials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update testimonials"
  ON public.home_testimonials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete testimonials"
  ON public.home_testimonials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_home_testimonials_updated_at
  BEFORE UPDATE ON public.home_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS for testimonial-logos bucket
CREATE POLICY "Public can view testimonial logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'testimonial-logos');

CREATE POLICY "Admins can upload testimonial logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'testimonial-logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update testimonial logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'testimonial-logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete testimonial logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'testimonial-logos' AND public.has_role(auth.uid(), 'admin'));
