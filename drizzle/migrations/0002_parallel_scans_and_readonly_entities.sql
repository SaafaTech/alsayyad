ALTER TABLE public.scan_gate
  ADD COLUMN max_concurrent integer NOT NULL DEFAULT 5 CHECK (max_concurrent BETWEEN 1 AND 10),
  ADD COLUMN min_gap_ms integer NOT NULL DEFAULT 2000 CHECK (min_gap_ms BETWEEN 0 AND 10000);

CREATE OR REPLACE FUNCTION public.claim_scan(_link_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE gate public.scan_gate%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO public.scan_gate(id) VALUES(true) ON CONFLICT DO NOTHING;
  SELECT * INTO gate FROM public.scan_gate WHERE id=true FOR UPDATE;
  IF gate.last_started_at > now() - gate.min_gap_ms * interval '1 millisecond' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.links WHERE status='scanning' AND scan_started_at > now()-interval '150 seconds') >= gate.max_concurrent THEN RETURN false; END IF;
  UPDATE public.links SET status='scanning', scan_started_at=now(), scan_error=NULL
  WHERE id=_link_id AND status='pending' AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE link_id=_link_id);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.scan_gate SET last_started_at=now() WHERE id=true;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_scan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_scan(uuid) TO authenticated;

DROP POLICY authenticated_access ON public.entities;
CREATE POLICY authenticated_read ON public.entities FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE ON public.entities FROM authenticated;
GRANT SELECT ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;