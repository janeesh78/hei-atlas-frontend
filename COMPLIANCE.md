# Hei Atlas — Compliance Posture

**Last reviewed:** 2026-07-03
**Owner:** Janeesh Sekkath Veedu (Security Officer, primary contact)

This document maps the *technical* controls that Hei Atlas has implemented to
the HIPAA Security Rule (45 CFR §164.312) and the SOC 2 Trust Services
Criteria. It exists so an external auditor doesn't have to reverse-engineer
the code. **It is not a legal opinion**, and it does not on its own make Hei
Atlas HIPAA-compliant or SOC 2-certified — those determinations depend on
policies, contracts, workforce training, and an audit by a licensed CPA firm.

---

## Scope of the app

Hei Atlas is a voice-first ambient documentation platform for oncology.
Physicians authenticate with NPI + email OTP, dictate encounters, and receive
generated notes, coding, toxicity grading, guideline citations, and clinical-
trial matches. Encounters are held for 24 hours then hard-deleted. There is
one admin dashboard.

**PHI touched by the app:**
- Audio transcripts of clinical encounters
- Physician-generated notes derived from the transcript
- CMS/CTCAE-style structured output
- Encounter metadata (created_at, physician identity)

**Not touched:**
- Formal patient identifiers (MRN, DOB, name) — the app never asks for these;
  physicians are instructed to use initials or a private handle in the
  `patient_ref` field.

---

## Technical safeguard mapping

| Control | HIPAA §164.312 | SOC 2 CC | Implementation |
|---|---|---|---|
| Unique user identification | (a)(2)(i) | CC6.1 | NPI + email at signup; UUID PK on `auth_user`. |
| Emergency access procedure | (a)(2)(ii) | — | Not required for the current beta scope. Access is via founder-controlled Fly + Neon consoles. |
| Automatic logoff | (a)(2)(iii) | CC6.1 | 30-minute sliding inactivity TTL enforced server-side (`SESSION_TTL` in `models/user_auth.py`) and matched by a client-side idle timer with a 28-minute warning modal (`lib/session.tsx`). Activity in any tab of the same browser counts toward the shared timer (localStorage broadcast), so an idle-but-open tab can't sign out a session another tab is actively using. |
| Encryption / decryption (at rest) | (a)(2)(iv) | CC6.7 | Neon Postgres AES-256 at rest (managed). Upstash Redis AES-256 at rest (managed). Fly volumes encrypted at rest. |
| Audit controls | (b) | CC7.2 | `phi_access_log` table records every PHI-touching request (encounter read/write/delete, admin dashboard access, self-export, account deletion) with actor, IP, UA, timestamp. Written via `services/phi_audit.py`. Append-only; 6-year retention (`AUDIT_RETENTION`). |
| Integrity | (c)(1) | CC7.1 | JSON payloads stored verbatim; Postgres enforces UTF-8; SQLAlchemy models are the single source of truth for shape. |
| Person / entity authentication | (d) | CC6.1 | Signup blocked until NPI matches NPPES-registered name (`verify_npi_at_nppes`), enforced via `NPI_STRICT=1`. Email OTP required for both signup and login. Sessions revoked on logout. |
| Transmission security | (e)(1) | CC6.7 | HTTPS on Vercel (HSTS 2y preload). Fly-terminated TLS on backend. Neon `sslmode=require`. Upstash `rediss://` (TLS-only). Resend HTTPS API. CORS restricted to production origin. CSP + COOP + CORP headers. |

### Access control detail
- Signup and login rate-limited: 5 attempts/email/15min AND 20 attempts/IP/15min.
- Session tokens are 64-char URL-safe random. 30-minute sliding TTL.
- Admin routes gated by `ADMIN_EMAILS` server-side env var.
- No public write endpoints reach PHI.

### Audit control detail
- `phi_access_log(id, user_id, action, resource_type, resource_id, ip_address, user_agent, status_code, meta, created_at)`.
- Fail-open: audit write failure is logged but never raises to the caller.
- Query interface at `GET /admin/incidents?hours=N` surfaces: 4xx/403 clusters, off-hours admin access, cross-user resource access, denied-admin attempts.

### Data lifecycle
- Encounters TTL: 24 hours (confirmed 2026-09-02 as the intended policy — PHI-minimization stance, no BAA yet and no EHR integration to hold data for). Lazy pruned on every read, plus a periodic global sweep (`prune_all_expired()`) every 15 minutes since 2026-09-01.
- Audit log retention: 6 years (HIPAA minimum for policies and audit artifacts). Never pruned by app code.
- Physician right-to-access: `GET /me/export` — returns full JSON archive of user, preferences, location, activity, encounters, feedback.
- Physician right-to-delete: `DELETE /me/account` — irreversibly wipes every row keyed to the user; deletion event recorded in `phi_access_log` before user row removal.

### Availability
- Fly.io backend: `min_machines_running=1`, `auto_start_machines=true`. Health check on `/health` every 15s.
- Neon Postgres: point-in-time recovery available on all paid tiers.
- Upstash Redis: multi-AZ replication on paid tiers.
- Backup verification: run manually before every production deploy; automate before GA.

---

## SOC 2 Trust Services Criteria coverage (Type I readiness)

| CC | Technical status | Remaining work |
|---|---|---|
| CC1 — Control environment | — | Written policies + org chart + code-of-conduct required. |
| CC2 — Communication & information | Partial | Public /privacy + /terms shipped. Need internal security policy + incident-response runbook. |
| CC3 — Risk assessment | — | Annual risk assessment doc required. |
| CC4 — Monitoring activities | Partial | `/admin/incidents` + `/admin/access-review` shipped. Need documented review cadence (weekly) + evidence retention. |
| CC5 — Control activities | — | Written change-mgmt process. Suggest: require GitHub PR + reviewer approval before deploy. |
| CC6 — Logical & physical access | Strong | NPI auth, OTP, session TTL, RBAC via ADMIN_EMAILS, CORS lockdown, TLS everywhere. |
| CC7 — System operations | Partial | Audit log + incidents shipped. Basic threshold alerting added 2026-09-02 (`services/alerting.py`, backend): 5xx spikes, transcription/encounter-save failures, and daily-cap hits email the admin allowlist — but this is a lightweight Redis-counter-and-email bridge, not real on-call infra. Still need: documented SLA, actual paging via PagerDuty/OpsGenie (with escalation/on-call rotation), monthly access review evidence. |
| CC8 — Change management | — | Deploy currently unrestricted from local. Add branch protection + required PR review. |
| CC9 — Risk mitigation | — | Vendor risk assessment + BAA registry required (see below). |

Recommended platform for evidence collection + auditor coordination:
**Vanta**, **Drata**, or **Secureframe**. Budget ~$15–20K/year plus $8–15K for a Type I audit, $20–40K for Type II.

---

## Business Associate Agreements — CHECKLIST

**Sign a BAA with each vendor below before onboarding external physicians.**
Without these, the app is not HIPAA compliant, no matter what any technical
control says.

- [ ] **OpenAI** — request via <mailto:baa@openai.com> (corrected 2026-09-04, confirmed via OpenAI's own Help Center — direct email, not the enterprise-privacy page; no Enterprise plan needed for the API BAA itself, but requires the zero-data-retention rider for the BAA to actually cover PHI in requests). Draft ready in `baa-request-drafts.md`.
- [ ] **Anthropic** — documented path is the sales contact form (<https://claude.com/contact-sales>) or an existing account contact; `legal@anthropic.com` is plausible but unconfirmed as the real BAA intake (available on Team/Enterprise + API with prior arrangement). Worth knowing before signing: Covered Models under Anthropic's BAA require 30-day retention and are **not** compatible with Zero Data Retention — the opposite of OpenAI's requirement above, so signing both means an asymmetric retention posture across model vendors, worth deciding on purpose rather than discovering later. Draft ready in `baa-request-drafts.md`.
- [ ] **Neon** — request via <mailto:hipaa@neon.tech> (corrected 2026-09-04 — a dedicated HIPAA-intake address, not `support@neon.tech`) with a Scale-tier subscription. Neon also documents a self-serve HIPAA-enablement process on Scale, so this email may just be for guidance rather than a from-scratch negotiation. Draft ready in `baa-request-drafts.md`.
- [ ] **Upstash** — request via <https://upstash.com/enterprise> or <mailto:support@upstash.com> (email confirmed 2026-09-04 as a working alternate route) — **Enterprise tier required, not Pro** (this line previously said Pro; Upstash's own docs confirm HIPAA/BAA support is an Enterprise-only feature). Draft ready in `baa-request-drafts.md`.
- [ ] **Fly.io** — request via <mailto:sales@fly.io> (corrected 2026-09-04, confirmed via Fly's own healthcare-blueprint doc — not `billing@fly.io`) — must be on a paid plan; the BAA is pre-signed by Fly and activates once countersigned by us. Draft ready in `baa-request-drafts.md`.
- [ ] **Vercel** — **check our actual plan before requesting anything** (correction 2026-09-04): if we're on Pro, Vercel now offers a self-serve BAA — $350/mo add-on, click-through in the team billing dashboard, no request needed at all. Enterprise (for custom redlines) goes through a Customer Success Manager/Account Executive, not a generic address; <https://vercel.com/contact/sales> is the closest public entry point if we don't have one. Draft ready in `baa-request-drafts.md` for the Enterprise path.
- [ ] **Resend** — **does not offer a BAA, on any plan** (major correction 2026-09-04: confirmed directly on resend.com/security's own FAQ — "Resend is not HIPAA compliant and cannot sign a Business Associate Agreement." The previous "available on business plans" note and `hipaa@resend.com` contact were both wrong). Resend only ever carries an OTP code to the physician's own inbox, never patient data, so this may not need to be a hard blocker for onboarding — worth confirming with counsel rather than treating "0 of 7 vendors" as including an impossible one. Sent a confirmation-only email to keep a dated record; see `baa-request-drafts.md`.
- [ ] **Twilio** — request via <https://www.twilio.com/en-us/legal/hipaa>. Added 2026-09-02 alongside SMS OTP delivery; tracked here for consistency with Resend, which plays the identical role for email (only ever carries the OTP code, never patient data) — worth confirming with counsel whether this specific use actually falls in BAA scope before treating it as a hard blocker. (Not part of the original "7 vendors" count below — Resend's discovery above applies here too.)

### After signing — technical activation steps

Added 2026-09-04. A signed BAA is a contract, not a switch — several of the vendors above require a
follow-up technical step before the agreement actually covers PHI in practice. Tracked separately from
the checklist above on purpose: checking off "sign the BAA with X" reads as "done," and it's easy to
lose track of a required follow-up buried in that same line once it's checked.

- [ ] **OpenAI** — request and confirm the Zero Data Retention (ZDR) rider is active. Without it, the signed BAA does not cover PHI in API requests at all — signing alone is not enough.
- [ ] **Anthropic** — our organization's Primary Owner must activate the HIPAA-Ready Org setting (Data and privacy → HIPAA compliance) after signing, and accept Anthropic's BAA there too. Also confirm at that point whether Covered Models' 30-day retention requirement (incompatible with ZDR) is acceptable for our data — this doesn't block signing, but it's a real operational difference from OpenAI's posture above.
- [ ] **Neon** — mark the relevant database(s) as HIPAA databases via their self-serve enablement process (Scale plan). Core Postgres, branching, backups, and PITR are covered; Neon Auth and the Data API are explicitly outside the HIPAA boundary regardless — don't route PHI through those even after signing.
- [ ] **Upstash** — per their own HIPAA docs: mark the relevant database(s) as HIPAA databases, enable MFA on all Upstash Console accounts, enable Prod Pack (encryption at rest + advanced security), and enable Credential Protection.

---

## Organizational + policy work (not code)

**HIPAA — required before treating any real PHI:**
- [ ] Designate the Security Officer in writing (probably Janeesh).
- [ ] Designate the Privacy Officer in writing.
- [ ] Complete an initial risk assessment (methodology: NIST 800-30 or SANS).
- [ ] Draft and publish a Notice of Privacy Practices.
- [ ] Draft and publish an internal Security Policy, Sanctions Policy, Contingency Plan, and Breach Notification Procedure.
- [ ] Complete HIPAA workforce training (Vanta and Drata both offer this in-app).
- [ ] Sign BAAs (see above).
- [ ] Register the entity type: Business Associate if serving Covered Entities, Covered Entity if contracting directly with patients.

**SOC 2 — before starting the audit window:**
- [ ] Pick a compliance platform (Vanta / Drata / Secureframe).
- [ ] Pick an auditor (A-LIGN, Prescient, Barr, Insight Assurance).
- [ ] Decide Type I vs Type II. Type I ~$8–15K, 4–6 weeks. Type II needs 3+ months of collected evidence.
- [ ] Scope Trust Services Criteria: **Security** is mandatory; add **Confidentiality**, **Availability** for a healthcare product.

---

## Change log

- 2026-07-03: Initial version. Shipped: 15-min sliding session TTL, per-IP rate limits, phi_access_log, `/me/export`, `/me/account` delete, `/admin/access-review`, `/admin/incidents`, CSP + COOP + CORP + HSTS headers. Documentation of all vendor + policy work still owed.
- 2026-07-22: Session inactivity TTL increased from 15 to 30 minutes (server `SESSION_TTL` + client `IDLE_MS`, kept in sync). Client-side idle timer is now synchronized across browser tabs via a localStorage activity broadcast, so activity in one tab keeps the shared session alive in all tabs of the same browser instead of an idle tab independently signing everyone out.
- 2026-08-25: Fixed premature session expiry during ambient recording. The 4-minute keep-alive ping (the only thing sliding the session while recording, since the general activity heartbeat goes idle once the physician stops clicking) had no `visibilitychange` catch-up — a backgrounded or throttled tab could miss enough pings to let the 30-minute TTL lapse mid-recording. `app/app/ambient/page.tsx` now also pings on both tab-hide and tab-show while a recording is active or paused.
- 2026-08-26: Broadened what counts as "activity" for the client-side idle timer (`lib/session.tsx`). Previously only `mousedown`/`keydown`/`touchstart`/`wheel` counted, so reading a note for 20-30+ minutes without clicking or using a scroll wheel was indistinguishable from having stepped away and triggered logout mid-read. Added throttled `mousemove` and `scroll` (capture-phase, so it also catches scrolling inside a nested panel) — a session with genuinely no mouse movement or scrolling anywhere still times out at 30 minutes, unchanged.
- 2026-08-27: Added a signup-approval gate — new self-service signups are held as unapproved until an admin (`ADMIN_EMAILS`) approves them via the admin dashboard, closing the gap noted in `BETA_LAUNCH.md`'s closed-beta rollout plan (previously anyone with an email + NPI could sign up and immediately start using the app, with no approval step). Existing users as of this change were grandfathered in as already-approved.
- 2026-09-02: Confirmed the 24-hour encounter TTL as the intended policy, not just an unreviewed default. Kept as-is: no BAA yet exists with any vendor (PHI-minimization is the operative stance) and there's no EHR integration for notes to eventually flow into, so there's no benefit to retaining data longer, only added PHI-at-rest exposure. Reliability side was already closed 2026-09-01 by `prune_all_expired()`, a global 15-minute sweep supplementing the existing per-user lazy prune.
- 2026-09-02: Built SMS OTP delivery via Twilio, alongside the existing email delivery (`_deliver_otp` in `backend/routers/auth.py`) — fires whenever a physician has a phone on file and Twilio is configured, independent of the email fallback chain. Added Twilio to the BAA checklist for consistency with Resend's identical role on the email side. Not yet live: no Twilio account/secrets exist yet, so this is a no-op in production until that vendor setup happens and a deploy follows.
- 2026-09-02: Built threshold-based operational alerting (`backend/services/alerting.py`) ahead of the log-aggregator/RUM/tracing vendor decision — reuses infrastructure already deployed (Upstash Redis for counters, Resend + `ADMIN_EMAILS` for delivery) rather than waiting on a new platform. Emails the admin allowlist on: a 5xx spike, an elevated transcription failure rate, any encounter-save failure, or a daily-cap 429 — each with a 1-hour per-condition cooldown. Unlike the SMS item above, this goes live the moment it's deployed (all three dependencies already exist in production).
