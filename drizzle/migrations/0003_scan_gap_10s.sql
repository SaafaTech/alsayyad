ALTER TABLE public.scan_gate ALTER COLUMN min_gap_ms SET DEFAULT 10000;
UPDATE public.scan_gate SET min_gap_ms=10000 WHERE id=true;