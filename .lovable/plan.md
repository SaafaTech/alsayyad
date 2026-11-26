# Automatic server-side hunt (الصيد التلقائي)

Sayyad will hunt and scan on a schedule with no browser open. It reuses the existing engine, so scoring, the outbound allowlist and the manual hunt stay unchanged. Detection stays passive only.

## 1. Database (one migration)
- `auto_hunt_settings` (one row): enabled (default on), daily_cap (default 100, between 10 and 500), owner_user_id (seeded with the earliest investigator), updated_at. All investigators can read it. Only the owner can edit it. The service role has full access.
- `auto_runs`: kind (search / ct / worker), started/finished, new_links, scanned, red, yellow, errors, status. Investigators can read it. Only the service role writes to it.
- `hunts.trigger`: 'manual' or 'auto', default 'manual'. Existing rows become 'manual'.
- `auto_links_today()`: counts links from auto hunts created today (Asia/Dubai day). It enforces the daily cap.

## 2. Shared cores (refactor, no behaviour change)
- The bodies of searchGoogle/searchMaps, ctWatch, scanLink, pollScan and createEvidence move into cores that take `(db, userId)`. The current UI server functions call these cores, so the manual flow works exactly as today.
- A cap + dedupe gate for auto runs: skip any URL whose normalized form already has an analysis; on normal domains also skip a domain that already has one. On free/shared platforms and URL shorteners, dedupe by full normalized URL only. Stop inserting once today's count reaches the cap. Expert_sample hunts are excluded everywhere, as today.

## 3. Cron routes (protected by authenticateCronRequest, service privileges, created_by = owner)
- `/api/public/cron/auto-search`: Google + Maps searches for every active phrase. Hunts are marked 'auto'.
- `/api/public/cron/auto-ct`: CT watch for each entity brand keyword that matches `^[a-z0-9]{4,40}$`.
- `/api/public/cron/auto-worker`:
  - Polls the auto links that are scanning, then starts scans for up to 3 pending auto links.
  - Respects claim_scan, the 10-second gap and 429 handling.
  - Stops after about 50 seconds.
  - Yellow/red results get an evidence file automatically: frozen snapshot, screenshot, SHA-256, custody_log entry with the owner as actor and the note 'auto'.
  - Campaigns are rebuilt after any finished scans.
  - If the queue is empty, it exits immediately.
- Every route exits when the switch is off and writes one auto_runs row.
- These routes use `/api/public/...` instead of `/api/cron/...`. That prefix lets the scheduler reach them, and the secret check still blocks everyone else.

## 4. Schedules (Lovable Cloud managed, written in UTC)
- auto-search: daily at 03:00 Dubai (`0 23 * * *` UTC).
- auto-ct: every 6 hours (4 runs/day).
- auto-worker: every 5 minutes, which is **288 runs per day**. Each run with an empty queue exits right away, but every run still uses a little database compute. Cost note: the worker scans at most 3 links per run, so a 100-link night takes about 3 hours to clear.

## 5. UI
- Dashboard card «صيد الليلة» (last 24h):
  - New links, scanned, red, yellow, new campaigns and last run time.
  - A link to the red/yellow list filtered to auto hunts.
- Hunt page panel «الصيد التلقائي», owner only:
  - On/off switch and daily cap (10–500).
  - Today's count compared with the cap.
  - The last 10 runs with their status.
- An «تلقائي» badge wherever hunts are listed. All new strings get English translations.

## 6. Tests and docs
- Vitest tests for:
  - The daily cap stops inserts.
  - An already-analysed URL/domain is skipped.
  - A disabled switch exits without doing anything.
  - Expert_sample hunts are excluded.
- One AGENTS.md architecture line, plus an "Automatic hunt" section in README.md and README.ar.md covering schedule, cap, cost, passive-only and privacy.

## Technical notes
- The cap/dedupe/enabled decisions are pure helpers in a new `src/lib/sayyad/auto.ts`, which keeps them testable. The routes load `supabaseAdmin` inside the handler.
- Auto evidence uses the same snapshot builder as createEvidence. The yellow/red check runs on the stored analysis.
