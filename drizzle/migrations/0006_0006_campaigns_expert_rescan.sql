ALTER TABLE public.hunts DROP CONSTRAINT IF EXISTS hunts_source_check;
ALTER TABLE public.hunts ADD CONSTRAINT hunts_source_check CHECK (source IN ('google','maps','manual','expert_sample'));

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.entities(id),
  name_ar text NOT NULL,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  link_count integer NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TABLE public.campaign_links (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.links(id),
  reasons_ar text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, link_id)
);
GRANT SELECT ON public.campaign_links TO authenticated;
GRANT ALL ON public.campaign_links TO service_role;
ALTER TABLE public.campaign_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_links_read ON public.campaign_links FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- Replace all campaigns atomically (one function call = one transaction).
CREATE OR REPLACE FUNCTION public.replace_campaigns(_campaigns jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c jsonb; cid uuid; l jsonb; n integer := 0;
BEGIN
  DELETE FROM public.campaign_links WHERE campaign_id IS NOT NULL;
  DELETE FROM public.campaigns WHERE id IS NOT NULL;
  FOR c IN SELECT * FROM jsonb_array_elements(_campaigns) LOOP
    INSERT INTO public.campaigns(entity_id,name_ar,first_seen_at,last_seen_at,link_count,signals)
    VALUES (NULLIF(c->>'entity_id','')::uuid, c->>'name_ar', (c->>'first_seen_at')::timestamptz, (c->>'last_seen_at')::timestamptz, (c->>'link_count')::int, COALESCE(c->'signals','{}'::jsonb))
    RETURNING id INTO cid;
    FOR l IN SELECT * FROM jsonb_array_elements(c->'links') LOOP
      INSERT INTO public.campaign_links(campaign_id,link_id,reasons_ar)
      VALUES (cid, (l->>'link_id')::uuid, ARRAY(SELECT jsonb_array_elements_text(l->'reasons_ar')));
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.replace_campaigns(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_campaigns(jsonb) TO service_role;

CREATE TABLE public.expert_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  batch text NOT NULL DEFAULT '',
  url_raw text NOT NULL,
  url text NOT NULL,
  domain text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT 'other',
  impersonated_entity text,
  note text,
  excluded_reason text,
  link_id uuid REFERENCES public.links(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expert_links TO authenticated;
GRANT ALL ON public.expert_links TO service_role;
ALTER TABLE public.expert_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY expert_select ON public.expert_links FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY expert_insert ON public.expert_links FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY expert_update ON public.expert_links FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY expert_delete ON public.expert_links FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE TABLE public.analysis_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.links(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  analysis jsonb NOT NULL
);
CREATE INDEX analysis_history_link_idx ON public.analysis_history(link_id, archived_at);
GRANT SELECT ON public.analysis_history TO authenticated;
GRANT ALL ON public.analysis_history TO service_role;
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_history_read ON public.analysis_history FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- Re-scan: archive the current analysis, then return the link and its direct children to the normal queue.
CREATE OR REPLACE FUNCTION public.rescan_link(_link_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.rescan_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rescan_link(uuid) TO authenticated;

INSERT INTO public.search_phrases(phrase, entity_id, active)
SELECT 'شغالات بالشهر أبوظبي', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.search_phrases WHERE phrase='شغالات بالشهر أبوظبي');