ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS indicators jsonb;
ALTER TABLE public.analysis_history ADD COLUMN IF NOT EXISTS indicators jsonb;