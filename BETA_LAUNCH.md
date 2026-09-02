# Beta Launch Checklist

## Pre-launch — required before opening to any external user

### Auth & PHI
- [x] **Rotate any dev OTPs and secrets** — done 2026-09-01. `OPENAI_API_KEY`, `DATABASE_URL` (Neon/Postgres password), and `RESEND_API_KEY` rotated and each verified live against the real provider (not just "secret updated" — confirmed the new credential actually works: OpenAI `/v1/models`, a real DB query, Resend `/domains`). Session table cleared (150 stale rows). `SMTP_PASSWORD` doesn't apply — see the SMTP item below, superseded by Resend.
- [x] **`DEV_MODE`** — already off. `DEV_MODE=0` is set in `fly.toml`'s `[env]` (the code also defaults to off if unset); confirmed empirically 2026-09-01 that a live `/auth/login` response contains no `dev_code`.
- [x] ~~**Configure SMTP** for real OTP delivery~~ — superseded. Production email goes through the Resend HTTP API (`RESEND_API_KEY`, see `_deliver_otp()` in `backend/routers/auth.py`), not SMTP. `SMTP_HOST`/`SMTP_PASSWORD` are an unused fallback path in the same function; nothing to configure here unless you want SMTP as a secondary provider.
- [x] **Enable strict NPI validation** — already on. `NPI_STRICT=1` is set in `fly.toml`; confirmed empirically 2026-09-01 (a signup attempt with a non-real NPI was rejected with "NPI not found in NPPES or name mismatch").
- [ ] **Sign a BAA with OpenAI** (or whichever LLM vendor is upstream of `/notes/generate`) before any real PHI flows through transcription/note generation. Still outstanding — see `COMPLIANCE.md`'s BAA checklist (0 of 7 vendors signed as of 2026-08-27).
- [x] **HTTPS everywhere** — checked 2026-09-01. TLS termination: confirmed both `heiatlas.ai` (Vercel) and `hei-atlas-api.fly.dev` (`force_https = true` in `fly.toml`) redirect plain HTTP to HTTPS. HSTS: frontend already had it (`vercel.json`); the backend didn't send it at all — added an HSTS middleware in `main.py` matching the frontend's config. Deployed and verified live on both plain GET responses and CORS preflight OPTIONS (fixed a middleware-ordering bug along the way — `CORSMiddleware` answers preflight itself without calling further inward, so the HSTS middleware needed to be registered last to cover it too). Cookie flags: N/A, confirmed no `Set-Cookie` header is ever sent — auth is `Authorization: Bearer <token>` in localStorage as the doc already noted, so `Secure`/`SameSite`/`HttpOnly` don't apply.
- [x] **CORS** — already restricted. `ALLOWED_ORIGINS` is a deployed Fly secret and `main.py` only falls back to `*` when that secret is absent; confirmed the secret is set.
- [x] **Audit-log the auth endpoints** — done 2026-09-01 (missed updating this line at the time — fixed now). Confirmed the gap was real: neither `AuditLoggingMiddleware` (scoped only to `/cds/*`/`/recommendations`) nor any `record_access()` call touched `/auth/*` before this. `signup`/`login`/`verify` in `routers/auth.py` now log every success and failure path through `phi_access_log`. Verified live: exercised all 7 code paths (signup success + both denials, OTP-sent + unknown-email, verify success + both denials) and confirmed each row landed correctly by querying `phi_access_log` directly — caught and fixed one real bug along the way (an action name too long for the column was being silently truncated).
- [ ] **Session rotation on privilege change** — N/A for now, checked 2026-09-01. There is no email/NPI update capability anywhere in the app yet — no self-service endpoint, no admin action, nothing mutates `User.email` or `User.npi` after signup (confirmed by grepping the whole backend). Nothing to rotate sessions *on* until that feature exists. Revisit this item when profile editing gets built — wire the rotation in from day one of that feature rather than bolting it on after.
- [x] **Signup-approval gate** — done 2026-08-27, closes the gap this doc's own rollout plan called for (see below). New self-signups default to unapproved and can't complete login until an admin approves them from the `/admin` dashboard.

### Data lifecycle
- [ ] Confirm encounter TTL policy (24 h) matches your compliance stance; adjust `ENCOUNTER_TTL` in `backend/models/user_auth.py` if needed.
- [x] Schedule a background prune job for `Encounter.expires_at < now()` — done 2026-09-01. `prune_all_expired()` (`routers/encounters.py`) sweeps every user's expired rows, not just the requesting user; runs every 15 min via an `asyncio.create_task` loop started in `main.py`'s lifespan, same pattern already used for the trial-cache refresh. The existing per-user lazy prune stays in place alongside it — that one gives an active user immediate consistency, which a 15-min sweep alone would regress. Verified directly: created an already-expired test encounter, confirmed `prune_all_expired()` found and removed it.
- [ ] Backup Postgres and Redis before every deploy. Confirm restore procedure end-to-end at least twice. Scoped 2026-09-01, see `BACKUP_RESTORE.md`: Redis excluded (no durable data — confirmed it's only rate-limit counters + a rebuildable cache), Postgres restore verified via Neon's own point-in-time recovery rather than a custom backup script. Restoring is a Neon-account action (creating a restore branch) that only the Neon dashboard can do — waiting on you to run Steps 0–1 there twice; I'll independently verify each restored branch's data (Step 2) the moment you hand me a connection string.
- [x] Encrypt Postgres at rest — this line predates the actual infra choice (Neon, not raw AWS RDS/Cloud SQL). Confirmed 2026-09-01 directly against Neon's own docs (neon.com/docs/security/security-overview): AES-256 at the NVMe storage layer, on by default across every plan, not opt-in or tier-gated — nothing to configure. This is documentation-level confirmation, not a first-party audit; a formal certificate would be Neon's own SOC2 report, which is the same ask already tracked under the SOC2/compliance-platform work in `COMPLIANCE.md`, not a separate action here.
- [x] Confirm the `patient_ref` column is understood as a **client-side handle** (initials or a private handle), not full PHI. Checked 2026-09-01 — found and fixed a real contradiction: `COMPLIANCE.md` already stated the app "never asks for" MRN and directs physicians to initials/a private handle instead, but the actual UI placeholder, its code comments, and two backend field comments all suggested "MRN" as a valid option (MRN is one of HIPAA's 18 Safe Harbor identifiers, so that's not equivalent to initials/codename — this checklist line itself had the same "MRN alias" framing, now corrected above). Fixed all 5 places across both repos. Checked real usage: 0 encounters currently have a non-empty `patient_ref` — the field is unused in production so far, so there's no actual-misuse evidence either way, just the now-corrected guidance. "Physician understanding" beyond the one current user isn't something code alone can fully guarantee — that depends on the not-yet-built onboarding materials (see "Physician onboarding email" under Nice-to-have below).

### Rate limits & quotas
- [x] `DAILY_ENCOUNTER_CAP = 30` returns HTTP 429 — this line already claimed "verified" but the box was unchecked and I hadn't actually confirmed it myself, so treated it as unverified. Tested for real 2026-09-01: created a throwaway user with exactly 30 encounters for today, called the real `POST /encounters` endpoint for a 31st — got back `429 {"detail":"Daily encounter cap of 30 reached. Retry tomorrow."}` exactly as designed. Test user and all 30 rows cleaned up afterward.
- [x] Add per-user OTP rate limit — already implemented as suggested. Confirmed in `backend/routers/auth.py`: `MAX_OTP_PER_WINDOW = 5`, `WINDOW_SECONDS = 15 * 60`, applied on both signup and login.
- [x] Add IP-based rate limit — already implemented, and covers both `/auth/signup` and `/auth/login`, not just signup. Confirmed: `MAX_ATTEMPTS_PER_IP = 20` per 15 minutes.
- [x] Transcription payload size — already handled, checked 2026-09-01. This line described a stale architecture: the "10-min MediaRecorder cap" it references was deliberately removed 2026-07-09 because it was cutting off real consults, and recording length is unbounded client-side now. 25 MB (24 MB with headroom, `_OPENAI_MAX_BYTES` in `services/whisper_service.py`) isn't a cap the app enforces — it's OpenAI's Whisper API's own hard per-request limit. The backend already works around it: audio over that size is ffmpeg-split into chunks and transcribed concurrently (`_transcribe_openai_chunked`), verified in production up to 35 min / 26 MB, 4 segments, 75s total. Nothing to build — the checklist item just hadn't caught up to the July fix.

### Observability
- [ ] Point logs at a real log aggregator (Datadog / CloudWatch / Loki / etc.). Redact OTP codes at ingest. The specific paths this line named (`/tmp/onc-backend.log`, `/tmp/oncology-dev.log`) are stale — checked 2026-09-02, neither exists anywhere in the current repo, and neither does `scripts/start-local.sh` (also referenced under Testing below). Actual current logging: no file handler configured anywhere, so Python's `logging` goes to stderr by default, captured as stdout/stderr by Fly and viewable via `fly logs` — no aggregator connected. This is a real, still-open gap: Fly's own log buffer is short-retention (confirmed empirically earlier this session investigating an unrelated issue — only ~14 minutes of history available via `fly logs`), so there's genuinely no way to look back at what happened even an hour ago right now. Picking a vendor (Datadog/CloudWatch/Loki/etc.) and getting an account/API key set up is your call to make, same as the BAA vendors — let me know which one and I'll wire up the actual log shipping once you have a credential to hand me.
- [ ] Hook the frontend `pingBackend('*')` telemetry to Datadog RUM or PostHog for pipeline-stage funnels. This part of the description is accurate, unlike some other items — `pingBackend()` (`lib/api.ts`) is real and extensively used with exactly the pipeline-stage tags you'd want for funnel analysis (`pipeline:audio-start`, `pipeline:transcribe-done`, `pipeline:note-done`, etc.). But checked where the data actually goes 2026-09-02: `POST /debug/ping` (`routers/debug.py`) just does `log.warning(...)` — the same ephemeral stdout stream as the log-aggregator gap above, not any persistent or queryable store. Confirmed neither PostHog nor Datadog is loaded anywhere in the frontend currently. So today this data is only useful for live-tailing during an active debugging session (which is genuinely how it's been used a couple of times this session) — there's no way to actually compute a funnel or drop-off rate from it. Same shape of decision as the log aggregator: picking Datadog RUM vs PostHog vs something else is yours to make.
- [ ] Enable HTTP request tracing (OpenTelemetry) end-to-end.
- [ ] Alert on: 5xx spike, transcription failure rate >5%, encounter save failure rate >0%, daily-cap 429s.

### Infrastructure
- [x] Deploy Postgres + Redis to managed services — this line predates the actual choices (written generically for AWS RDS/ElastiCache). Confirmed 2026-09-02: Neon (Postgres) and Upstash (Redis), both managed, both live (`DATABASE_URL`/`REDIS_URL` deployed Fly secrets).
- [x] Frontend built with `next build`, served from Vercel — confirmed, this is exactly the setup (one of the options this line already named).
- [ ] Backend containerized, 2+ replicas, health-check on `/health` — **partially true, one real gap remains.** Containerization ✓ (Dockerfile, built fresh every `flyctl deploy`), health-check ✓ (`fly.toml` checks + every deploy confirms it), but replicas: checked `flyctl status` 2026-09-02 — exactly **1 machine** running, not 2+. Zero redundancy right now — if that one machine goes down, the backend is fully offline. This is the actual remaining work in this item, not a wording problem.
- [x] Static assets served with correct `Cache-Control` and immutable JS bundle hashes — verified live 2026-09-02: `sw.js` → `public, max-age=0, must-revalidate`, `manifest.json` → `public, max-age=3600`, a JS chunk → `public,max-age=31536000,immutable`. All correct.
- [x] CDN in front of the frontend — Vercel's edge network serves every deployment through their CDN by default; no separate setup needed. Already confirmed via `x-vercel-cache`/`server: Vercel` response headers seen repeatedly this session.
- [x] Domain + TLS certificate configured — `heiatlas.ai`, HTTPS enforced, HSTS on both frontend and backend. Confirmed repeatedly this session (most recently in the HTTPS/HSTS item above).
- [x] Add real PWA icons — done 2026-09-02. Generated to match the existing "HA" brand chip (navy `#0B2447` background, bold white Inter "HA", same mark already used in `LeftSidebar.tsx`) at the exact sizes/format `manifest.json` declares: 180×180 (apple-touch-icon, opaque, full-bleed — Apple applies its own corner rounding), 192×192 and 512×512 (both `"purpose": "any maskable"` — kept the glyph conservatively inside the standard safe-zone circle so an aggressive OS mask shape can't clip it). Verified locally: all three + `manifest.json` return 200, not 404.

### Legal / policy pages
- [ ] Terms of service link in login screen footer.
- [ ] Privacy policy explaining encounter retention (24 h), transcription providers used, and NPI verification via NPPES.
- [ ] BAA / SOC 2 posture documented for prospective customers.
- [ ] Data deletion request flow — the /encounters DELETE endpoint handles single-item deletes; add a full account deletion route.

### Testing
- [ ] End-to-end smoke test (already covered in `scripts/start-local.sh status` and the `/loop test modes` heartbeat)
- [ ] Load test at 100 concurrent users with realistic payloads (transcription + note generation). Backend should scale horizontally.
- [ ] Chaos test the offline queue: kill network mid-encounter, verify audio persists and uploads on reconnect.
- [ ] Cross-browser: Safari (iOS), Chrome (Android), Chrome/Edge/Firefox desktop.
- [ ] Accessibility pass: screen reader on the login flow, ATLAS button, results panel. Confirm min-44px tap targets everywhere.

## Known issue — hospital DNS filtering (NRD + fly.dev)

Two flavors seen in the field, opposite directions:

- **2026-07-06** — `heiatlas.ai` (registered 2026-07-02) blocked by
  newly-registered-domain filtering on a managed workstation ("DNS server not
  responding"); fly.dev was fine. Ages out ~early Aug 2026.
- **2026-07-07** — `hei-atlas-api.fly.dev` blocked by Cisco Umbrella on a
  hospital guest network (block-page IP + interception cert); `heiatlas.ai`
  was fine. Every API call failed with "Failed to fetch" (sign-in included).

Mitigations now in place:

- The frontend fails over automatically across API routes (`lib/apiBase.ts`):
  configured base → `hei-atlas-api.fly.dev` direct → same-origin `/backend`
  Vercel relay (works whenever the page itself loads). WebSocket live-sync
  can't traverse the relay and degrades gracefully; everything else works.
- Include the fallback URL in every onboarding email: **https://hei-atlas.vercel.app**
  (identical app; already in the backend CORS allowlist).
- `api.heiatlas.ai` is the primary API host as of 2026-07-08 (GoDaddy
  A/AAAA → Fly, Let's Encrypt cert, `NEXT_PUBLIC_API_URL` flipped). The IT
  whitelist ask is now just `heiatlas.ai` and subdomains — no fly.dev.
  fly.dev remains failover tier 2, the `/backend` relay tier 3.
- Re-test NRD filtering in August 2026 and trim this section when clear.

## Nice-to-have before opening beta

- [ ] SMS OTP delivery (Twilio / SNS) alongside email.
- [ ] Passkeys / WebAuthn as an alternative to OTP.
- [ ] Admin dashboard to see active users, encounter volume, error rate.
- [ ] Physician onboarding email with tips for good ATLAS captures.
- [ ] Retention analytics — how many physicians return day-2, week-2, month-2.

## Rollout plan

1. **Alpha (internal)** — currently here, solo (single physician), ongoing since July — longer and narrower than the original "3 physicians / 1 week" plan.
2. **Closed beta** — 25 invited physicians. The approval gate this step called for now exists (`is_approved` column, login rejected until an admin flips it via `/admin`) — done 2026-08-27. BAAs (see `COMPLIANCE.md`) are still the blocker before inviting anyone external.
3. **Open beta** — public signup enabled, cap raised as backend scales.
4. **GA** — announce, pricing, subscription model.

## What already ships in this build

- ✅ NPI-verified signup + email OTP verification (SMS-ready hook in `_deliver_otp`) + signup-approval gate (admin must approve before a new signup can log in)
- ✅ Session tokens with a 30-minute sliding inactivity TTL (HIPAA §164.312(a)(2)(iii) auto-logoff; bumped from 15 min 2026-07-22 — this line was stale at 24h, corrected 2026-09-01)
- ✅ Per-user preferences (both explicit and repeat-use learning)
- ✅ Encounter storage with 24-hour TTL + 30-per-user-per-day cap
- ✅ User name + credentials chip in the left sidebar with sign-out menu
- ✅ Today's encounters list in the sidebar (with `N/30` counter)
- ✅ Route guard on the main workspace — anonymous users redirect to `/login`
- ✅ Frontend hydrates preferences on sign-in and auto-saves preference changes
- ✅ Frontend auto-saves encounter to `/encounters` after every note generation
- ✅ Cap-reached UI: error banner shown when the 429 lands
