# Beta Launch Checklist

## Pre-launch — required before opening to any external user

### Auth & PHI
- [ ] **Rotate any dev OTPs and secrets** — `OPENAI_API_KEY`, `SMTP_PASSWORD`, `POSTGRES_PASSWORD`, session table cleared.
- [ ] **Turn OFF `DEV_MODE`** — set `DEV_MODE=0` (or delete the line) in `backend/.env`. When set, the OTP is returned in the API response — must not ship to production.
- [ ] **Configure SMTP** for real OTP delivery. Set env vars in `backend/.env`:
  ```
  SMTP_HOST=smtp.gmail.com          # or smtp.sendgrid.net / email-smtp.us-east-1.amazonaws.com
  SMTP_PORT=587
  SMTP_USER=notifications@yourdomain.com
  SMTP_PASSWORD=<app-password-or-api-key>
  SMTP_FROM="Hei Atlas <notifications@yourdomain.com>"
  SMTP_TLS=1
  ```
  **Gmail (dev-friendly):** turn on 2-step verification, then generate an app password at https://myaccount.google.com/apppasswords — use that as `SMTP_PASSWORD`. Gmail SMTP has a 500/day cap and is not suitable for production.
  **SendGrid / AWS SES / Postmark / Resend (production):** use the provider's SMTP relay creds, or swap `_deliver_otp()` in `backend/routers/auth.py` to hit the HTTP API. Verify delivery to a real inbox before onboarding users.
- [ ] **Enable strict NPI validation** — set `NPI_STRICT=1`. Test with a real NPI + name and confirm mismatches are blocked.
- [ ] **Sign a BAA with OpenAI** (or whichever LLM vendor is upstream of `/notes/generate`) before any real PHI flows through transcription/note generation.
- [ ] **HTTPS everywhere** — terminate TLS at the load balancer. Set `Secure` on cookies (currently the app uses `Authorization: Bearer <token>` in localStorage; if you switch to cookies, set `SameSite=Strict; Secure; HttpOnly`).
- [ ] **CORS** — restrict `Access-Control-Allow-Origin` to the frontend origin. Currently allows `*`.
- [ ] **Audit-log the auth endpoints**. `auth_log` table already exists; wire the audit middleware to also record `/auth/*` requests (username + IP + user-agent + outcome).
- [ ] **Session rotation on privilege change** — invalidate old sessions when a user updates their email or NPI.

### Data lifecycle
- [ ] Confirm encounter TTL policy (24 h) matches your compliance stance; adjust `ENCOUNTER_TTL` in `backend/models/user_auth.py` if needed.
- [ ] Schedule a background prune job for `Encounter.expires_at < now()` — currently pruned lazily on read, which is fine at low volume but should run every 15 min in production.
- [ ] Backup Postgres and Redis before every deploy. Confirm restore procedure end-to-end at least once.
- [ ] Encrypt Postgres at rest (managed service: AWS RDS with KMS, Cloud SQL with CMEK, etc.).
- [ ] Confirm the `patient_ref` column is understood by physicians as a **client-side handle** (initials or MRN alias), not full PHI.

### Rate limits & quotas
- [ ] `DAILY_ENCOUNTER_CAP = 30` returns HTTP 429 — verified.
- [ ] Add per-user OTP rate limit (currently unbounded — someone could hammer `/auth/login`). Suggested: 5 OTPs per email per 15 minutes.
- [ ] Add IP-based rate limit on `/auth/signup` to prevent enumeration attacks.
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

1. **Alpha (internal)** — 3 physicians on the team. Run for 1 week. Collect note-quality feedback.
2. **Closed beta** — 25 invited physicians. Feature-gated behind a manual admin approval step after signup (add a `is_approved` column to `auth_user` and reject login until an admin flips it).
3. **Open beta** — public signup enabled, cap raised as backend scales.
4. **GA** — announce, pricing, subscription model.

## What already ships in this build

- ✅ NPI-verified signup + email OTP verification (SMS-ready hook in `_deliver_otp`)
- ✅ Session tokens with 24-hour TTL
- ✅ Per-user preferences (both explicit and repeat-use learning)
- ✅ Encounter storage with 24-hour TTL + 30-per-user-per-day cap
- ✅ User name + credentials chip in the left sidebar with sign-out menu
- ✅ Today's encounters list in the sidebar (with `N/30` counter)
- ✅ Route guard on the main workspace — anonymous users redirect to `/login`
- ✅ Frontend hydrates preferences on sign-in and auto-saves preference changes
- ✅ Frontend auto-saves encounter to `/encounters` after every note generation
- ✅ Cap-reached UI: error banner shown when the 429 lands
