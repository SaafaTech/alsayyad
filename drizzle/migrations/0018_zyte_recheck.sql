ALTER TABLE public.links ADD COLUMN IF NOT EXISTS zyte_recheck_at timestamptz;
CREATE INDEX IF NOT EXISTS links_zyte_recheck_idx ON public.links(zyte_recheck_at) WHERE zyte_recheck_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_zyte(_link_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cap integer; used integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'investigator')) THEN RETURN 'denied'; END IF;
  SELECT zyte_daily_cap INTO cap FROM public.auto_hunt_settings WHERE id=true FOR UPDATE;
  cap := coalesce(cap, 30);
  SELECT count(*) INTO used FROM public.zyte_attempts WHERE created_at >= public.zyte_day_start();
  IF used >= cap THEN RETURN 'cap'; END IF;
  UPDATE public.links l SET zyte_started_at=now(), fallback_attempts=fallback_attempts+1, fallback_queued_at=coalesce(fallback_queued_at, now())
   WHERE l.id=_link_id AND l.status='scanning' AND (l.zyte_started_at IS NULL OR l.zyte_started_at < now()-interval '90 seconds')
     AND (NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id)
          OR (l.zyte_recheck_at IS NOT NULL AND l.fallback_queued_at = l.zyte_recheck_at));
  IF NOT FOUND THEN RETURN 'busy'; END IF;
  INSERT INTO public.zyte_attempts(link_id) VALUES(_link_id);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_zyte(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_zyte(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.zyte_recheck_requeue(_ids uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer; t timestamptz := now();
BEGIN
  UPDATE public.links SET status='scanning', fallback_queued_at=t, zyte_recheck_at=t, fallback_attempts=0, zyte_started_at=NULL, processing_started_at=NULL
   WHERE id = ANY(_ids) AND status='done' AND zyte_recheck_at IS NULL AND scan_error IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.zyte_recheck_archive(_link_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.analysis_history(link_id, analysis) SELECT a.link_id, to_jsonb(a) FROM public.analyses a WHERE a.link_id=_link_id;
  DELETE FROM public.analyses WHERE link_id=_link_id;
END $$;

CREATE OR REPLACE FUNCTION public.zyte_recheck_unarchive(_link_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.analysis_history%ROWTYPE;
BEGIN
  IF EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id) THEN RETURN; END IF;
  SELECT * INTO h FROM public.analysis_history WHERE link_id=_link_id ORDER BY archived_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.analyses SELECT * FROM jsonb_populate_record(NULL::public.analyses, h.analysis);
  DELETE FROM public.analysis_history WHERE id=h.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.zyte_recheck_requeue(uuid[]), public.zyte_recheck_archive(uuid), public.zyte_recheck_unarchive(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zyte_recheck_requeue(uuid[]), public.zyte_recheck_archive(uuid), public.zyte_recheck_unarchive(uuid) TO service_role;