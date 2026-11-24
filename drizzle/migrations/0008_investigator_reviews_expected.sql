CREATE TABLE public.investigator_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  analysis_level text,
  analysis_score integer,
  reviewer uuid NOT NULL DEFAULT auth.uid(),
  verdict text NOT NULL CHECK (verdict IN ('correct','wrong')),
  wrong_reason text CHECK (wrong_reason IN ('real_site','missed_fraud','wrong_entity','other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, reviewer)
);
GRANT SELECT, INSERT, UPDATE ON public.investigator_reviews TO authenticated;
GRANT ALL ON public.investigator_reviews TO service_role;
ALTER TABLE public.investigator_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviews_read ON public.investigator_reviews FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY reviews_insert ON public.investigator_reviews FOR INSERT TO authenticated WITH CHECK (reviewer = auth.uid());
CREATE POLICY reviews_update ON public.investigator_reviews FOR UPDATE TO authenticated USING (reviewer = auth.uid()) WITH CHECK (reviewer = auth.uid());
ALTER TABLE public.expert_links ADD COLUMN expected text CHECK (expected IN ('fraud','legit'));