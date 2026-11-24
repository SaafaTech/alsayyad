ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS hosting jsonb;

CREATE SEQUENCE IF NOT EXISTS public.evidence_case_seq;
GRANT USAGE ON SEQUENCE public.evidence_case_seq TO service_role;

CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no text NOT NULL UNIQUE DEFAULT ('SAY-' || to_char(now() AT TIME ZONE 'Asia/Dubai','YYYY') || '-' || lpad(nextval('public.evidence_case_seq')::text,4,'0')),
  link_id uuid NOT NULL UNIQUE REFERENCES public.links(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  screenshot_path text,
  screenshot_sha256 text,
  captured_at timestamptz,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  urgent boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','confirmed_suspicious','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  case_status text NOT NULL DEFAULT 'detected' CHECK (case_status IN ('detected','referred','in_progress','closed')),
  investigator_notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.evidence TO authenticated;
GRANT UPDATE (review_status, reviewed_by, reviewed_at, case_status, investigator_notes) ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON public.evidence FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY evidence_review ON public.evidence FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.custody_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.evidence(id),
  action text NOT NULL CHECK (action IN ('collected','viewed','exported_pdf','downloaded_original','reviewed','status_changed','notes_updated')),
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now(),
  detail text
);
CREATE INDEX custody_log_evidence_idx ON public.custody_log(evidence_id, at);
GRANT SELECT, INSERT ON public.custody_log TO authenticated;
GRANT ALL ON public.custody_log TO service_role;
ALTER TABLE public.custody_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY custody_read ON public.custody_log FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY custody_insert ON public.custody_log FOR INSERT TO authenticated WITH CHECK (actor = auth.uid() AND action <> 'collected');