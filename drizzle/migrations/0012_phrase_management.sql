ALTER TABLE public.search_phrases ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES auth.users(id);
ALTER TABLE public.search_phrases ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS search_phrases_phrase_uniq ON public.search_phrases (lower(trim(phrase)));
GRANT SELECT, INSERT, UPDATE ON public.search_phrases TO authenticated;
GRANT ALL ON public.search_phrases TO service_role;
CREATE POLICY phrases_insert ON public.search_phrases FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'investigator') AND created_by = auth.uid());
CREATE POLICY phrases_update ON public.search_phrases FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'investigator')) WITH CHECK (public.has_role(auth.uid(),'investigator'));
CREATE OR REPLACE FUNCTION public.search_phrases_only_active() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phrase IS DISTINCT FROM OLD.phrase OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'only active can be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER search_phrases_only_active BEFORE UPDATE ON public.search_phrases FOR EACH ROW EXECUTE FUNCTION public.search_phrases_only_active();