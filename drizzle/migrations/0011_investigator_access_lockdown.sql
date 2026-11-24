CREATE TYPE public.app_role AS ENUM ('investigator');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
INSERT INTO public.user_roles(user_id, role) SELECT id, 'investigator' FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- links
DROP POLICY IF EXISTS authenticated_access ON public.links;
REVOKE DELETE ON public.links FROM authenticated, anon;
CREATE POLICY links_read ON public.links FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY links_insert ON public.links FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'investigator'));
CREATE POLICY links_update ON public.links FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'investigator')) WITH CHECK (public.has_role(auth.uid(),'investigator'));

-- analyses
DROP POLICY IF EXISTS authenticated_access ON public.analyses;
REVOKE DELETE ON public.analyses FROM authenticated, anon;
CREATE POLICY analyses_read ON public.analyses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY analyses_insert ON public.analyses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'investigator'));
CREATE POLICY analyses_update ON public.analyses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'investigator')) WITH CHECK (public.has_role(auth.uid(),'investigator'));

-- hunts
DROP POLICY IF EXISTS authenticated_delete ON public.hunts;
DROP POLICY IF EXISTS authenticated_read ON public.hunts;
DROP POLICY IF EXISTS authenticated_update ON public.hunts;
DROP POLICY IF EXISTS authenticated_insert ON public.hunts;
REVOKE DELETE ON public.hunts FROM authenticated, anon;
CREATE POLICY hunts_read ON public.hunts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY hunts_insert ON public.hunts FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(),'investigator'));
CREATE POLICY hunts_update ON public.hunts FOR UPDATE TO authenticated USING (created_by = auth.uid() AND public.has_role(auth.uid(),'investigator')) WITH CHECK (created_by = auth.uid());

-- search_phrases: read-only for investigators
DROP POLICY IF EXISTS authenticated_access ON public.search_phrases;
REVOKE INSERT, UPDATE, DELETE ON public.search_phrases FROM authenticated, anon;
CREATE POLICY phrases_read ON public.search_phrases FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));

-- engine_cache / scan_gate: service role only
DROP POLICY IF EXISTS authenticated_access ON public.engine_cache;
DROP POLICY IF EXISTS authenticated_access ON public.scan_gate;
REVOKE ALL ON public.engine_cache FROM authenticated, anon;
REVOKE ALL ON public.scan_gate FROM authenticated, anon;
GRANT ALL ON public.engine_cache TO service_role;
GRANT ALL ON public.scan_gate TO service_role;

-- read-only shared tables
DROP POLICY IF EXISTS authenticated_read ON public.entities;
CREATE POLICY entities_read ON public.entities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
DROP POLICY IF EXISTS campaign_links_read ON public.campaign_links;
CREATE POLICY campaign_links_read ON public.campaign_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
DROP POLICY IF EXISTS analysis_history_read ON public.analysis_history;
CREATE POLICY analysis_history_read ON public.analysis_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));

-- reviews
DROP POLICY IF EXISTS reviews_read ON public.investigator_reviews;
DROP POLICY IF EXISTS reviews_insert ON public.investigator_reviews;
DROP POLICY IF EXISTS reviews_update ON public.investigator_reviews;
CREATE POLICY reviews_read ON public.investigator_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY reviews_insert ON public.investigator_reviews FOR INSERT TO authenticated WITH CHECK (reviewer = auth.uid() AND public.has_role(auth.uid(),'investigator'));
CREATE POLICY reviews_update ON public.investigator_reviews FOR UPDATE TO authenticated USING (reviewer = auth.uid() AND public.has_role(auth.uid(),'investigator')) WITH CHECK (reviewer = auth.uid());

-- custody log
DROP POLICY IF EXISTS custody_read ON public.custody_log;
DROP POLICY IF EXISTS custody_insert ON public.custody_log;
CREATE POLICY custody_read ON public.custody_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY custody_insert ON public.custody_log FOR INSERT TO authenticated WITH CHECK (actor = auth.uid() AND action <> 'collected' AND public.has_role(auth.uid(),'investigator'));

-- evidence
DROP POLICY IF EXISTS evidence_read ON public.evidence;
DROP POLICY IF EXISTS evidence_review ON public.evidence;
REVOKE UPDATE ON public.evidence FROM authenticated, anon;
GRANT UPDATE (review_status, reviewed_by, reviewed_at, case_status, investigator_notes, urgent) ON public.evidence TO authenticated;
CREATE POLICY evidence_read ON public.evidence FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY evidence_review ON public.evidence FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'investigator')) WITH CHECK (public.has_role(auth.uid(),'investigator'));
CREATE OR REPLACE FUNCTION public.evidence_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.screenshot_path IS DISTINCT FROM OLD.screenshot_path
     OR NEW.screenshot_sha256 IS DISTINCT FROM OLD.screenshot_sha256 OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
     OR NEW.link_id IS DISTINCT FROM OLD.link_id OR NEW.case_no IS DISTINCT FROM OLD.case_no
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'evidence content is immutable after collection';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_immutable BEFORE UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.evidence_immutable();

-- functions: require investigator role
CREATE OR REPLACE FUNCTION public.claim_scan(_link_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE gate public.scan_gate%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator') THEN RETURN false; END IF;
  INSERT INTO public.scan_gate(id) VALUES(true) ON CONFLICT DO NOTHING;
  SELECT * INTO gate FROM public.scan_gate WHERE id=true FOR UPDATE;
  IF gate.last_started_at > now() - gate.min_gap_ms * interval '1 millisecond' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.links WHERE status='scanning' AND scan_started_at > now()-interval '150 seconds') >= gate.max_concurrent THEN RETURN false; END IF;
  UPDATE public.links SET status='scanning', scan_started_at=now(), scan_error=NULL
  WHERE id=_link_id AND status='pending' AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.scan_gate SET last_started_at=now() WHERE id=true;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_analysis(_link_id uuid)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator') THEN RETURN false; END IF; UPDATE public.links SET processing_started_at=now() WHERE id=_link_id AND status='scanning' AND processing_started_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id); RETURN FOUND; END $function$;

CREATE OR REPLACE FUNCTION public.rescan_link(_link_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ids uuid[]; n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT array_agg(id) INTO ids FROM public.links
   WHERE (id=_link_id OR parent_link_id=_link_id) AND status NOT IN ('scanning','official');
  IF ids IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.analysis_history(link_id, analysis)
    SELECT a.link_id, to_jsonb(a) FROM public.analyses a WHERE a.link_id = ANY(ids);
  DELETE FROM public.analyses WHERE link_id = ANY(ids);
  UPDATE public.links SET status='pending', scan_uuid=NULL, scan_started_at=NULL, scan_error=NULL, processing_started_at=NULL, final_url=NULL
   WHERE id = ANY(ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

REVOKE EXECUTE ON FUNCTION public.replace_campaigns(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_campaigns(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_scan(uuid), public.rescan_link(uuid), public.claim_analysis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_scan(uuid), public.rescan_link(uuid), public.claim_analysis(uuid) TO authenticated;