ALTER TABLE public.hunts DROP CONSTRAINT IF EXISTS hunts_source_check;
ALTER TABLE public.hunts ADD CONSTRAINT hunts_source_check CHECK (source IN ('google','maps','manual','expert_sample','ct'));
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS ct_first_seen timestamptz;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS whois jsonb;