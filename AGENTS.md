<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Sayyad architecture
- Auto hunt runs from /api/public/cron/* routes sharing the same search/scan/evidence cores as the UI server functions; daily cap + dedupe (full URL only on free/shared platforms and shorteners) control cost; evidence is auto-created only for yellow/red; long sweeps continue in chunks via an engine_cache cursor because cron calls must return quickly.
- Keep pure domain/scoring rules in src/lib/sayyad/rules.ts and investigation transport in engine.server.ts; this makes passive-only behavior and scoring testable.
- Start Cloudflare scans with a database claim, then poll from a sequential browser queue; this prevents long server waits and concurrent scan starts.
- Store only derived investigation evidence, not raw DOM or screenshots; screenshots are retrieved through an authenticated Cloudflare-only proxy.
- Keep signed-in screens under the pathless authenticated layout and check authentication on every server function; route access is not the RPC security boundary.
- Authenticate the cached IANA RDAP bootstrap with a server-only HMAC before allowing registry origins; database edits must never broaden the outbound allowlist, and provider redirects are never followed.
- Evidence files are created only by a server function using service privileges after the caller's session proves the link is yellow/red; they freeze a snapshot and the original Cloudflare screenshot bytes (private bucket, SHA-256), and custody_log is insert-only so later rescans or edits never change a file.
- Campaigns are rebuilt by deterministic pure rules (src/lib/sayyad/campaigns.ts) and written only by a service-role transaction function; analyses keeps one latest row per link and re-scans archive the old row into analysis_history, so all existing link_id lookups stay valid.
- Expert validation rows are owner-only and links from expert_sample hunts are filtered out of every aggregate via withoutExpert; expert URLs never enter code, migrations or tests.
- Name similarity comes from the domain (path only on free platforms); generic place words never identify an entity, and path/title mentions need AI confirmation of the same entity; this avoids geo and blog false positives.
- Removed campaign members keep membership via their latest red analysis_history row; per-member removed/old_score and join edges live in campaigns.signals so no schema change is needed.
- Brand lives in src/components/sayyad/brand.tsx (inline SVG emblem, Wordmark, once-per-session Splash); the wordmark font Reem Kufi is loaded from Google Fonts under the SIL Open Font License 1.1, so no font files are bundled.
- Investigator reviews are one row per (link, reviewer), readable by all investigators and writable only by their author; review accuracy excludes expert_sample links like every other aggregate.
- URL-only lexical signals (lexicalSignals in rules.ts) run for every link and merge into scoreFinding by signal key, so an unscannable link with no evidence still gets a verdict without double counting; shortener domains are never judged themselves, only Cloudflare's final URL.
- Early detection, WHOIS parsing, takedown texts and case exports are pure rules in src/lib/sayyad/early.ts; CT watch only calls crt.sh through providerFetch, WHOIS reuses the same RDAP response as domain age, and takedown texts are templates (never AI) so they stay reproducible and free of personal data.
- UI language lives in src/lib/i18n.ts (module-level language + useLang, no dependency) with Arabic source text as dictionary keys in i18n-dict.ts; unknown text falls back to Arabic, and AppShell re-keys its layout on language change so the engine queue never restarts.
- Shared investigation data is gated by public.has_role(auth.uid(),'investigator') (user_roles table), not just sign-in, because sign-up is open; engine_cache/scan_gate are service-role only and evidence content is locked by the evidence_immutable trigger.
