ALTER TABLE public.auto_hunt_settings ADD COLUMN zyte_daily_cap integer NOT NULL DEFAULT 30 CHECK (zyte_daily_cap BETWEEN 0 AND 500);
ALTER TABLE public.links ADD COLUMN fallback_queued_at timestamptz, ADD COLUMN fallback_attempts integer NOT NULL DEFAULT 0, ADD COLUMN zyte_started_at timestamptz;
ALTER TABLE public.analyses ADD COLUMN scanner text CHECK (scanner IN ('cloudflare','zyte_ae')), ADD COLUMN captured_at timestamptz, ADD COLUMN screenshot_path text, ADD COLUMN screenshot_sha256 text;
ALTER TABLE public.custody_log DROP CONSTRAINT custody_log_action_check;
ALTER TABLE public.custody_log ADD CONSTRAINT custody_log_action_check CHECK (action IN ('collected','captured','viewed','exported_pdf','downloaded_original','reviewed','status_changed','notes_updated'));
DROP POLICY IF EXISTS custody_insert ON public.custody_log;
CREATE POLICY custody_insert ON public.custody_log FOR INSERT TO authenticated WITH CHECK (actor = auth.uid() AND action NOT IN ('collected','captured') AND public.has_role(auth.uid(),'investigator'));

CREATE TABLE public.zyte_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid NOT NULL REFERENCES public.links(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX zyte_attempts_created_idx ON public.zyte_attempts(created_at);
GRANT ALL ON public.zyte_attempts TO service_role;
ALTER TABLE public.zyte_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.zyte_day_start() RETURNS timestamptz LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai' $$;

CREATE OR REPLACE FUNCTION public.claim_zyte(_link_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cap integer; used integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator')) THEN RETURN 'denied'; END IF;
  SELECT zyte_daily_cap INTO cap FROM public.auto_hunt_settings WHERE id=true FOR UPDATE;
  cap := coalesce(cap, 30);
  SELECT count(*) INTO used FROM public.zyte_attempts WHERE created_at >= public.zyte_day_start();
  IF used >= cap THEN RETURN 'cap'; END IF;
  UPDATE public.links SET zyte_started_at=now(), fallback_attempts=fallback_attempts+1, fallback_queued_at=coalesce(fallback_queued_at, now())
   WHERE id=_link_id AND status='scanning' AND (zyte_started_at IS NULL OR zyte_started_at < now()-interval '90 seconds') AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id);
  IF NOT FOUND THEN RETURN 'busy'; END IF;
  INSERT INTO public.zyte_attempts(link_id) VALUES(_link_id);
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.zyte_today() RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator')) THEN RETURN 0; END IF;
  RETURN (SELECT count(*)::integer FROM public.zyte_attempts WHERE created_at >= public.zyte_day_start());
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_zyte(uuid), public.zyte_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_zyte(uuid), public.zyte_today() TO authenticated, service_role;