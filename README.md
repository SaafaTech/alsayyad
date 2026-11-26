# Sayyad (الصيّاد) — Proactive hunter for fake UAE websites

> **الصيّاد** يبحث مثل الضحية في قوقل والخرائط وسجلات الشهادات، ويفحص الروابط المشبوهة عن بُعد بدون ما يفتحها، ويعطي درجة خطورة مع أسباب بالعربي، وملف أدلة جاهز للمحقق — قبل ما يوصل الرابط للضحية.
>
> Built in 24 hours at the **Cybercrime Shield Hackathon — SCAMSHIELD AI** (Abu Dhabi Police × 42 Abu Dhabi), 24–25 November 2026.
>
> **Live demo:** https://alsayyad.lovable.app — a judges' account is provided in the +Podium submission description
>
> [النسخة العربية](README.ar.md)

---

## For judges: a 3-minute tour

1. Sign in at https://alsayyad.lovable.app with the judges' account from the +Podium description.
2. **الصيّاد (Hunter)** → type `شحن سالك أونلاين` → watch Google results get scanned and sorted by risk.
3. Open a red result → **التحليل (Analysis)**: the score, every reason with its points, the screenshot, WHOIS and hosting.
4. **إنشاء ملف أدلة** → the immutable evidence file, chain of custody and a ready takedown request.
5. **تدقيق خاص (Private audit)** → paste any list of links (`,fraud` / `,legit` optional) → triage, linked networks (the Aramex network) and the accuracy card.
6. **لوحة التحكم (Dashboard)** → entities and platforms targeted, time to takedown, cost per link.

Please check single links or short lists: a full hunt runs from the browser and takes time (see Trade-offs).

## 1. The problem

- Abu Dhabi Police reported **15,642 cybercrime fraud cases in two years** and recovered AED 140 million for victims (Oct 2025).
- Abu Dhabi Police warned (June 2025) that scammers use **fake ads in search engine results** and **fake websites imitating government entities and well-known companies**.
- Awareness focuses on links sent by SMS, email and social media. **Search results and Maps are a gap**: a victim who searches "تعبئة رصيد سالك" can land on a fake page before anyone reports it.
- **Reports arrive too late.** Of the real fraud links a cybercrime specialist gave us, **63% (98 of 156 checked) were already dead or removed** when we scanned them. Evidence has to be captured while the site is live.
- Global scanners do not understand Arabic, UAE-specific impersonation. In our tests, Cloudflare's scanner classified confirmed fake Salik and RTA pages as **"No classification"**.

## 2. The solution

Sayyad hunts the way a victim searches, and documents what it finds the way an investigator would.

```
Search phrase (Google / Maps) · new certificates (crt.sh) · pasted link or CSV list
        │
        ▼
Official filter ── 26 UAE entities, *.gov.ae, 41 well-known UAE banks / retailers /
                   airlines / telcos, known news sites ──► green, not scanned
        │ not official
        ▼
Isolated scan (Cloudflare URL Scanner): the page is visited from Cloudflare's
infrastructure — Sayyad's server never contacts a suspicious site.
        │
        ▼
Analysis
  · URL itself: embedded brand, look-alike letters / punycode, IP host, "@" trick, shorteners
  · Domain age and WHOIS (RDAP, crt.sh)
  · AI reads the page text or, when text is missing, the screenshot: impersonation of a
    registered UAE entity or of any well-known global brand (Netflix, MetaMask, DocuSign…),
    visual logo/colour imitation, asks for card / OTP / password, UAE scam patterns
    (maids, fund recovery, insurance, jobs…)
  · Maps phone vs the entity's official phone
  · Free hosting platform, chain from bait page to trap page
  · Scammer indicators: phones, WhatsApp, IBAN (mod-97 checked), social accounts
        │
        ▼
Risk score 0–100 with reasons in Arabic (green < 30 · yellow 30–59 · red ≥ 60)
Anything that could not be checked is never green → "تحتاج مراجعة" (needs review)
        │
        ▼
Campaigns: red sites linked by shared phone, hosting, template, chain or name pattern
        │
        ▼
Evidence file (immutable): screenshot + SHA-256 + timestamps + source path + WHOIS +
indicators + chain of custody + takedown request + export CSV / JSON / PDF
        │
        ▼
Investigator confirms or rejects ("الحكم صحيح؟") and tracks the case status
```

**The system assists; the investigator decides.** Results are labelled "خطر مرتفع" / "مشبوه — يحتاج تحقق", with the note "حكم آلي للمساعدة — القرار النهائي للمحقق".

### Screens
| Screen | What it does |
|---|---|
| **الصيّاد (Hunter)** | 113 search phrases (Arabic + English, managed in-app), full hunt, results grouped by risk, Maps listings, new-domains tab |
| **التحليل (Analysis)** | Score, reasons, AI summary, WHOIS, hosting, redirect chain, scammer indicators, re-scan history |
| **ملفات الأدلة (Evidence)** | Immutable case files, urgency (site live?), case stages, takedown request, exports |
| **الحملات (Campaigns)** | Radial map: impersonated entity in the centre, linked sites around it (Sayyad's own findings only) |
| **لوحة التحكم (Dashboard)** | Risk distribution, entities and platforms targeted, time to takedown, cost per link |
| **تدقيق خاص (Private audit)** | Paste or upload up to 500 reported links: live / dead / needs review, linked networks inside the specialist's data, investigation leads, accuracy test (TP / FN / TN / FP) |

### Real results during the race
- **Salik on Linktree → Wix.** A Google hunt for "شحن سالك أونلاين" found a Linktree page impersonating Salik (**95, red**: 99% impersonation confidence, logo and colours imitated, asks for sensitive data). Sayyad followed it to the trap, a Wix site, and linked both as one chain. The Wix page was later taken down; its evidence file was already saved.
- **An Aramex network inside the specialist's data.** Among the specialist's scattered links, Sayyad linked 4 "parcel tracking" domains (`aramex.*-track-au.com`) as one network: same IP, same page template, one day old, each 80 (red).
- **A fake consumer-protection portal (reported by the team).** `hemaya-emirates.online`, 19 days old, impersonates the Ministry of Economy; Sayyad scored it red and documented it while live.
- **A domain one day old.** The specialist gave us `fazhawwq.com`, a confirmed fraud link registered on 23 November. Sayyad pulled its registration date and the registrar's abuse contact automatically. Because its page could not be scanned, a rule now raises any own domain ≤ 7 days old in the review queue.
- **Specialist dataset.** Of the specialist's fraud links: **63% dead before reaching us** (98 of 156 checked), 12% came from Google ads, 24% hosted on free platforms.
- **Fixed with real data:** `housecleaningabudhabi` was red because "abudhabi" matched TAMM — city names no longer count. A full hunt flagged official sites (`eandmoney.com`, `eand.com.eg`, `darb.qmobility.ae`) as red; they were added to the entities' official domains and re-scan green. Generic phishing pages (Netflix, Roblox, MetaMask…) were detected by the AI but not scored; they now score as brand impersonation.

> Integrity: every screen separates Sayyad's own hunting from the specialist's or the team's data, and states the source.

### Accuracy
Measured with the in-app accuracy test on 25 November 2026, 03:40 (UAE). The lists were fixed before scanning; allow-listed and registered official sites are green by design and are not in the test.

| Test set | Links | Detected / correct | Missed | False alarms | Could not be scanned |
|---|---|---|---|---|---|
| Legitimate UAE sites outside every allow-list (retail, health, leisure) | 15 | **15 correct (100%)** | — | **0** | 0 |
| Fraud links targeting the UAE (specialist + team) | 12 | **6 of 8 scanned (75%)** — 5 red, 1 yellow | 2 | — | 4 → "needs review", never green |
| Generic phishing pages from the specialist's sample (Netflix, Roblox, MetaMask, DocuSign…) | 36 | **29 of 35 scanned (83%)** — 3 red, 26 yellow | 6 | — | 1 → "needs review" |

> Red = fraud · green = legitimate · yellow = sent to human review (counted as detected for fraud). Before the generic-brand rule was added during the race, the same specialist pages scored 10 of 43 (23%); the AI had recognised the brands but the score ignored brands outside the UAE registry. Small samples: these numbers show direction, not a benchmark.

## 3. Scoring

| Signal | Points |
|---|---|
| AI: impersonates a registered entity (confidence ≥ 0.6) on a non-official domain, or visually imitates its logo/colours (counted only when AI impersonation confidence ≥ 0.5) | 35 |
| AI: imitates a well-known brand outside the registry (confidence ≥ 0.7) on a domain that is not the brand's own | 35 |
| Domain carries an entity's name, or the brand is embedded inside another domain | 30 |
| Look-alike letters / punycode imitating a brand | 30 |
| Linked from a red page impersonating an entity (chain) | 30 |
| AI: known UAE scam pattern (maids, fund recovery, insurance, shop, job, investment, real estate, unrealistic prices), confidence ≥ 0.75 | 30 |
| New own domain (≤ 7 days) whose page could not be scanned | 25 |
| Asks for payment or sensitive data (AI flag or payment words on the page) | 20 |
| Domain younger than 90 days (RDAP, or first certificate in CT logs) | 15 |
| URL hides the real host with "@", or uses an IP address | 15 |
| Phone number that is not the entity's official number | 10 |
| Free hosting platform (Linktree, Wix, Google Sites, pages.dev, Netlify, Vercel) | 10 |
| Risky TLD (.xyz, .top, .online …) · URL shortener · suspicious URL structure | 10 each |

Capped at 100; the two impersonation rows never add up. Safety rules:
- **Missing evidence is never proof of safety.** A page that cannot be scanned is never green; it becomes "تحتاج مراجعة".
- **Credential floor.** A page asking for a password, OTP or payment on a domain that is neither official nor known is at least yellow (30).
- **Brand-only cap.** Name/look signals alone (no payment or data request, AI confidence < 0.5, domain ≥ 90 days old) are capped at 55 (yellow): it may be an agent or an official branch, so a human checks it.
- **Removed pages are recognised** (404/410, redirect to the platform's login, "not found" title) and kept as evidence.
- **Shortened links are judged by their final destination**, and the redirect chain is shown as a reason.
- **Intermediary pages are judged by their destinations.** A Linktree page whose links all go to official sites is green.
- **City names (abudhabi, dubai …) never count as impersonation**, and an entity named only in a page path counts only with AI confirmation.

## 4. Technical choices and why

| Choice | Why |
|---|---|
| **Lovable** (React 19 + TypeScript + TanStack Start, Tailwind, shadcn/ui) | One builder shipped a working, bilingual Arabic RTL app in 24 hours, synced to GitHub. |
| **Lovable Cloud** (Postgres with row-level security, auth, private storage) | Team accounts only, every table behind RLS and an investigator role, private storage for evidence. |
| **Serper** (Google Search and Maps API) | The same results a victim in the UAE sees (`gl=ae`, Arabic or English), including ads and Maps phone numbers. |
| **Cloudflare URL Scanner** | The legal and safety core: pages are visited from Cloudflare's isolated infrastructure; our server never contacts a suspicious site. |
| **crt.sh (Certificate Transparency)** | Early detection: domains imitating UAE brands are found when their certificate is issued (last 14 days) — before they appear in search. |
| **RDAP (IANA bootstrap, Verisign)** | Official registration date, registrar and abuse contact for takedown requests. |
| **LLM `openai/gpt-6-astra` via the Lovable AI gateway** | Reads Arabic and English page text, or the screenshot when text is missing; returns a strict, schema-validated function call. Page content is treated as untrusted evidence, never as instructions. |
| **Deterministic rules around the AI** | Weights, similarity, official filter and payment words are code, so the score is explainable and stable between runs. |
| **Parallel scan pool with a database lock** | Up to 5 scans overlap, one start every 10 seconds (Cloudflare rate limit), race-safe through a Postgres row lock; workers share one throttled data refresh. |
| **Vitest** | 181 unit tests on the scoring rules, URL analysis, indicators, campaigns and parsing. |

**Cost:** about **$0.0023 per analysed link** (search + AI), an estimate from provider pricing.

## 5. Privacy, security and legality by design

- **Passive only.** No login, no form submission, no vulnerability probing on any site. All investigation HTTP goes through one transport (`providerFetch`) that only allows Serper, the Cloudflare URL Scanner API, crt.sh, the IANA RDAP bootstrap and RDAP registries, and never follows redirects. The AI is reached only through the Lovable AI gateway.
- **No victim data.** No user profiles; investigators are identified by auth ID only. The AI is instructed never to output names or personal details of people. Bank accounts are never included in awareness messages or takedown requests.
- **Manual links are sanitised**: query string and fragment are removed before a public scan, because a pasted link can carry personal tokens.
- **Evidence integrity**: original screenshot stored unchanged with SHA-256; evidence files cannot be edited (database trigger); every view, export and review is written to an insert-only chain-of-custody log; search phrases can be paused but not deleted.
- **Access control**: RLS on every table, every read and write requires the investigator role; specialist uploads are visible to their owner only; no self sign-up; paid services callable by investigators only.
- **Secrets**: `.env` contains only the public (publishable) Supabase key. API keys are server-side secrets.

## 6. Trade-offs

- **Built for UAE impersonation first.** Generic global phishing kits are covered by the AI's brand detection, but a page that shows only an error or a blank screen gives the engine nothing to judge.
- **Cloudflare cannot scan every page** (geo-blocking, bot protection, page text endpoint errors). Such links are scored from search, domain and URL evidence, are never green, and say so in their reasons; the AI reads the screenshot when page text is missing.
- **Public scans.** Private scan quota is limited, so scans are public on Cloudflare. Search links are public already; manual links are stripped of personal tokens first.
- **Rate limit.** One scan start per 10 seconds; official links are filtered before scanning to keep hunts short.
- **Bulk hunts run in the investigator's browser.** A full hunt of several hundred links overloaded the database during the race and needed a backend restart. Workers now share one throttled refresh and a stop survives a page reload; a server-side job queue is the first item below.
- **AI variance** is contained by fixed rules and thresholds; the AI never decides alone.
- **`.ae` domain age** has no public RDAP; certificate history from crt.sh is used and marked as such.
- **Cost figures are estimates** until confirmed against provider invoices.

## 7. What we left out

- Continuous CT streaming (CertStream) — we query crt.sh on demand for the last 14 days.
- Automatic scheduled re-scans to detect takedowns.
- Typosquatting generation for every official domain.
- Scanning from a UAE network location (for geo-blocked pages).

## 8. With more time

- A server-side scan queue with paged data loading, so hunts of thousands of links do not depend on an open browser.
- Integration with TDRA and police reporting channels; a pilot with Abu Dhabi Police investigators.
- RFC 3161 trusted timestamps and WARC archiving for evidence (aligned with ISO/IEC 27037).
- A larger registry (government, banks, delivery, utilities) and search phrases learned from real case data.
- A public lookup ("is this link official?") answering from Sayyad's database.

## Automatic hunt

- **Schedule:** a full search sweep daily at 03:00 Dubai, a certificate-log sweep every 6 hours, and a scan worker every 5 minutes. Long sweeps continue in small chunks on each worker run.
- **Cap:** at most the daily cap of new automatic links per Dubai day (default 100, owner-adjustable 10–500). The owner can switch the automatic hunt off at any time.
- **Cost control:** already-analysed URLs are never added again, and neither are already-analysed domains, except on free/shared platforms and shorteners, where only the exact URL counts. The worker exits immediately when there is nothing to do.
- **Passive only:** the same allowlisted providers (Serper, Cloudflare URL Scanner, RDAP, crt.sh, Lovable AI) and the same scoring. Nothing logs in, submits forms or probes the sites.
- **Privacy:** yellow/red results get an evidence file automatically with a custody entry marked "auto". No personal data is collected.

## Repository map

| Path | What is there |
|---|---|
| `src/lib/sayyad/rules.ts` | Scoring rules, official filter, URL (lexical) analysis — pure functions |
| `src/lib/sayyad/engine.server.ts` | Search, isolated scan, RDAP / crt.sh, AI analysis, the single outbound transport |
| `src/lib/sayyad/campaigns.ts` | Deterministic campaign / network clustering |
| `src/lib/sayyad/evidence*.ts`, `early.ts`, `indicators.ts`, `expert.ts` | Evidence files, CT watch and takedown texts, scammer indicators, private audit |
| `src/routes/_authenticated/` | The screens (hunter, analysis, evidence, campaigns, dashboard, private audit) |
| `drizzle/migrations/` | Database schema, RLS policies, entity registry, search phrases |
| `src/test/` | 181 Vitest unit tests |

Data: the 26-entity registry and the search phrases ship as migrations. The specialist's real fraud links are uploaded in the app by their owner and are never stored in code or migrations.

## 9. How to build and run

1. Clone this repository (branch `main`).
2. Install: `bun install`
3. Create a Lovable Cloud / Supabase project and apply the SQL migrations in `drizzle/migrations/` in order (tables, RLS policies, investigator role, scan lock, evidence immutability, the entity registry and search phrases).
4. Set server secrets: `SERPER_API_KEY`, `CLOUDFLARE_API_TOKEN` (URL Scanner permission), `CLOUDFLARE_ACCOUNT_ID`, plus the Supabase variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The AI runs through the Lovable AI gateway.
5. Run: `bun run dev`. An administrator creates accounts and grants the `investigator` role; then type a search phrase or paste a link.
6. Tests: `bun run test`

## 10. Third-party licenses and data

| Component | License / terms |
|---|---|
| React, TanStack Start/Router/Query, Tailwind CSS, shadcn/ui, Radix UI, Recharts, Zod, tldts, fastest-levenshtein, lucide-react, date-fns, sonner, and other UI packages (cmdk, vaul, embla-carousel, react-hook-form, react-day-picker, input-otp, class-variance-authority, clsx, tailwind-merge) | MIT |
| Reem Kufi, IBM Plex Sans Arabic, IBM Plex Mono (Google Fonts) | SIL Open Font License 1.1 |
| Serper API, Cloudflare URL Scanner, Lovable AI gateway | Used under each provider's terms of service |
| IANA RDAP bootstrap, RDAP registries, crt.sh | Public registry data |
| Official entity registry and allow-list | Compiled by the team from each organisation's official website |
| Awareness reporting channels (Aman 8002626, SMS 2828) | Abu Dhabi Police public announcements |

## 11. Team — Sayyad

- **Salem Saqr Alameri** — idea, product and build
- **Nahyan Yahya Al Nuaimi** — investigation workflow and evidence file
- **Salem Abdullah Alameri** — cybercrime review, presentation
- **Faisal Ali Al Mazmi** — cybercrime and legal review

The idea and project belong to Salem Saqr Alameri under a written agreement with the team.
