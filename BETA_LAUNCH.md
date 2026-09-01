# Beta Launch Checklist

## Pre-launch — required before opening to any external user

### Auth & PHI
- [x] **Rotate any dev OTPs and secrets** — done 2026-09-01. `OPENAI_API_KEY`, `DATABASE_URL` (Neon/Postgres password), and `RESEND_API_KEY` rotated and each verified live against the real provider (not just "secret updated" — confirmed the new credential actually works: OpenAI `/v1/models`, a real DB query, Resend `/domains`). Session table cleared (150 stale rows). `SMTP_PASSWORD` doesn't apply — see the SMTP item below, superseded by Resend.
- [x] **`DEV_MODE`** — already off. `DEV_MODE=0` is set in `fly.toml`'s `[env]` (the code also defaults to off if unset); confirmed empirically 2026-09-01 that a live `/auth/login` response contains no `dev_code`.
- [x] ~~**Configure SMTP** for real OTP delivery~~ — superseded. Production email goes through the Resend HTTP API (`RESEND_API_KEY`, see `_deliver_otp()` in `backend/routers/auth.py`), not SMTP. `SMTP_HOST`/`SMTP_PASSWORD` are an unused fallback path in the same function; nothing to configure here unless you want SMTP as a secondary provider.
- [x] **Enable strict NPI validation** — already on. `NPI_STRICT=1` is set in `fly.toml`; confirmed empirically 2026-09-01 (a signup attempt with a non-real NPI was rejected with "NPI not found in NPPES or name mismatch").
- [ ] **Sign a BAA with OpenAI** (or whichever LLM vendor is upstream of `/notes/generate`) before any real PHI flows through transcription/note generation. Still outstanding — see `COMPLIANCE.md`'s BAA checklist (0 of 7 vendors signed as of 2026-08-27).
- [x] **HTTPS everywhere** — checked 2026-09-01. TLS termination: confirmed both `heiatlas.ai` (Vercel) and `hei-atlas-api.fly.dev` (`force_https = true` in `fly.toml`) redirect plain HTTP to HTTPS. HSTS: frontend already had it (`vercel.json`); the backend didn't send it at all — added an HSTS middleware in `main.py` matching the frontend's config, not yet deployed. Cookie flags: N/A, confirmed no `Set-Cookie` header is ever sent — auth is `Authorization: Bearer <token>` in localStorage as the doc already noted, so `Secure`/`SameSite`/`HttpOnly` don't apply.
- [x] **CORS** — already restricted. `ALLOWED_ORIGINS` is a deployed Fly secret and `main.py` only falls back to `*` when that secret is absent; confirmed the secret is set.
- [ ] **Audit-log the auth endpoints**. `phi_access_log` (see `COMPLIANCE.md`) already covers PHI-touching requests and admin access; not confirmed whether `/auth/login`/`/auth/verify`/`/auth/signup` themselves are logged there — worth a direct check before relying on this.
- [ ] **Session rotation on privilege change** — N/A for now, checked 2026-09-01. There is no email/NPI update capability anywhere in the app yet — no self-service endpoint, no admin action, nothing mutates `User.email` or `User.npi` after signup (confirmed by grepping the whole backend). Nothing to rotate sessions *on* until that feature exists. Revisit this item when profile editing gets built — wire the rotation in from day one of that feature rather than bolting it on after.
- [x] **Signup-approval gate** — done 2026-08-27, closes the gap this doc's own rollout plan called for (see below). New self-signups default to unapproved and can't complete login until an admin approves them from the `/admin` dashboard.

### Data lifecycle
- [ ] Confirm encounter TTL policy (24 h) matches your compliance stance; adjust `ENCOUNTER_TTL` in `backend/models/user_auth.py` if needed.
- [ ] Schedule a background prune job for `Encounter.expires_at < now()` — currently pruned lazily on read, which is fine at low volume but should run every 15 min in production.
- [ ] Backup Postgres and Redis before every deploy. Confirm restore procedure end-to-end at least once.
- [ ] Encrypt Postgres at rest (managed service: AWS RDS with KMS, Cloud SQL with CMEK, etc.).
- [ ] Confirm the `patient_ref` column is understood by physicians as a **client-side handle** (initials or MRN alias), not full PHI.

### Rate limits & quotas
- [ ] `DAILY_ENCOUNTER_CAP = 30` returns HTTP 429 — verified.
- [x] Add per-user OTP rate limit — already implemented as suggested. Confirmed in `backend/routers/auth.py`: `MAX_OTP_PER_WINDOW = 5`, `WINDOW_SECONDS = 15 * 60`, applied on both signup and login.
- [x] Add IP-based rate limit — already implemented, and covers both `/auth/signup` and `/auth/login`, not just signup. Confirmed: `MAX_ATTEMPTS_PER_IP = 20` per 15 minutes.
- [ ] Cap transcription payload size at 25 MB (browser MediaRecorder 10-min cap + backend enforcement).

### Observability
- [ ] Point `/tmp/onc-backend.log` and `/tmp/oncology-dev.log` at a real log aggregator (Datadog / CloudWatch / Loki / etc.). Redact OTP codes at ingest.
- [ ] Hook the frontend `pingBackend('*')` telemetry to Datadog RUM or PostHog for pipeline-stage funnels.
- [ ] Enable HTTP request tracing (OpenTelemetry) end-to-end.
- [ ] Alert on: 5xx spike, transcription failure rate >5%, encounter save failure rate >0%, daily-cap 429s.

### Infrastructure
- [ ] Deploy Postgres + Redis to managed services (RDS + ElastiCache, Cloud SQL + Memorystore, etc.). Local Docker containers are dev-only.
- [ ] Frontend built with `next build`, served from Vercel / Netlify / Cloudflare Pages / your own Node runtime.
- [ ] Backend containerized (Dockerfile already exists at `backend/Dockerfile`). Deploy behind an ALB / Cloud Run with 2+ replicas and health-check on `/health`.
- [ ] Static assets (`sw.js`, `manifest.json`, icons) served with correct `Cache-Control` and immutable hashes for JS bundles.
- [ ] CDN in front of the frontend.
- [ ] Domain + TLS certificate configured.
- [ ] Add real PWA icons at `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png` (currently 404s — non-fatal but visible).

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
