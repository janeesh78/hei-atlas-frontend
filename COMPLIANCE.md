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
- Encounters TTL: 24 hours. Lazy pruned on every read; a periodic pruner should be added when volume warrants.
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
| CC7 — System operations | Partial | Audit log + incidents shipped. Need documented SLA, alerting via PagerDuty/OpsGenie, monthly access review evidence. |
| CC8 — Change management | — | Deploy currently unrestricted from local. Add branch protection + required PR review. |
| CC9 — Risk mitigation | — | Vendor risk assessment + BAA registry required (see below). |

Recommended platform for evidence collection + auditor coordination:
**Vanta**, **Drata**, or **Secureframe**. Budget ~$15–20K/year plus $8–15K for a Type I audit, $20–40K for Type II.

---

## Business Associate Agreements — CHECKLIST

**Sign a BAA with each vendor below before onboarding external physicians.**
Without these, the app is not HIPAA compliant, no matter what any technical
control says.

- [ ] **OpenAI** — request via <https://openai.com/enterprise-privacy/> (BAA available on API + Enterprise; requires zero-data-retention rider for full compliance).
- [ ] **Anthropic** — request via <https://anthropic.com/legal> or sales rep (available on Team/Enterprise + API with prior arrangement).
- [ ] **Neon** — request via support with a Scale-tier subscription (`support@neon.tech`).
- [ ] **Upstash** — request via <https://upstash.com/enterprise> — Pro tier eligible.
- [ ] **Fly.io** — request via <https://fly.io/docs/about/healthcare/> — must be on a paid plan and have a signed order form.
- [ ] **Vercel** — request via <https://vercel.com/contact/enterprise>. Enterprise plan only.
- [ ] **Resend** — request via <mailto:hipaa@resend.com>. Available on business plans.

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
