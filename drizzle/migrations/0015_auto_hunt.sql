ALTER TABLE public.hunts ADD COLUMN "trigger" text NOT NULL DEFAULT 'manual' CHECK ("trigger" IN ('manual','auto'));

CREATE TABLE public.auto_hunt_settings(
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  daily_cap integer NOT NULL DEFAULT 100 CHECK (daily_cap BETWEEN 10 AND 500),
  owner_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.auto_hunt_settings TO authenticated;
GRANT ALL ON public.auto_hunt_settings TO service_role;
ALTER TABLE public.auto_hunt_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY auto_settings_read ON public.auto_hunt_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));
CREATE POLICY auto_settings_owner_update ON public.auto_hunt_settings FOR UPDATE TO authenticated USING (owner_user_id = auth.uid() AND public.has_role(auth.uid(),'investigator')) WITH CHECK (owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.auto_settings_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR (NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id AND auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'only enabled and daily_cap can be changed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER auto_settings_guard BEFORE UPDATE ON public.auto_hunt_settings FOR EACH ROW EXECUTE FUNCTION public.auto_settings_guard();

INSERT INTO public.auto_hunt_settings(id, owner_user_id)
SELECT true, (SELECT ur.user_id FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id WHERE ur.role = 'investigator' ORDER BY u.created_at LIMIT 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.auto_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('search','ct','worker')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  new_links integer NOT NULL DEFAULT 0,
  scanned integer NOT NULL DEFAULT 0,
  red integer NOT NULL DEFAULT 0,
  yellow integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running'
);
CREATE INDEX auto_runs_started_idx ON public.auto_runs(started_at DESC);
GRANT SELECT ON public.auto_runs TO authenticated;
GRANT ALL ON public.auto_runs TO service_role;
ALTER TABLE public.auto_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY auto_runs_read ON public.auto_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'investigator'));

CREATE OR REPLACE FUNCTION public.auto_links_today() RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.links l JOIN public.hunts h ON h.id = l.hunt_id
  WHERE h."trigger" = 'auto' AND (l.first_seen_at AT TIME ZONE 'Asia/Dubai')::date = (now() AT TIME ZONE 'Asia/Dubai')::date
$$;
GRANT EXECUTE ON FUNCTION public.auto_links_today() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_scan(_link_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE gate public.scan_gate%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator')) THEN RETURN false; END IF;
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
AS $function$ BEGIN IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator')) THEN RETURN false; END IF; UPDATE public.links SET processing_started_at=now() WHERE id=_link_id AND status='scanning' AND processing_started_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id); RETURN FOUND; END $function$;
