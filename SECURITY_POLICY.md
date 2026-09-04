# Security Policy & Sanctions Policy — DRAFT

**Status: draft, not adopted. Review with counsel/a compliance advisor before treating this as your
actual governing policy — see the sign-off block at the end.**

**Applies to:** Oncology Solutions LLC, operator of Hei Atlas (heiatlas.ai).

**A note on scope, honestly stated:** this policy is written for the organization as it actually
exists today — effectively one workforce member (Dr. Janeesh Sekkath Veedu, MD) — while still being
structured so each section extends cleanly once there are more people, contractors, or a designated
compliance hire. Where a section describes a process that's currently "the same person does all
these roles," that's stated plainly rather than dressed up with invented layers of approval that
don't exist yet. A real, honestly-scoped policy is more useful to an auditor and to you than a padded
one that describes a company you don't have.

---

## 1. Purpose and scope

This policy establishes the administrative, physical, and technical safeguards Oncology Solutions LLC
uses to protect the confidentiality, integrity, and availability of protected health information
("PHI") handled by Hei Atlas, consistent with the HIPAA Security Rule (45 CFR Part 164, Subpart C).

It covers all systems that store, process, or transmit PHI: the Hei Atlas backend (FastAPI, Fly.io),
frontend (Next.js, Vercel), primary datastore (Neon Postgres), cache/rate-limit store (Upstash Redis),
and the third-party subprocessors listed in §7.

## 2. Roles

- **Security Officer:** Dr. Janeesh Sekkath Veedu, MD — responsible for developing, implementing, and
  maintaining this policy, per 45 CFR §164.308(a)(2).
- **Privacy Officer:** Dr. Janeesh Sekkath Veedu, MD — responsible for developing and implementing
  privacy policies and serving as the contact for privacy complaints, per 45 CFR §164.530(a).

These are the same person today. If the two roles are ever split, or if additional workforce members
are added, update this section and the responsibilities below — several of the "self-review" steps in
this policy (e.g. §4's periodic access review) become meaningfully stronger once the reviewer isn't
also the sole account holder being reviewed.

## 3. Administrative safeguards

### 3.1 Security management process

- **Risk analysis.** A formal, documented risk analysis (45 CFR §164.308(a)(1)(ii)(A)) has not yet
  been completed as a standalone exercise — this is tracked as open in `COMPLIANCE.md`'s
  "Organizational + policy work" section. This Security Policy describes controls already
  implemented, but it is not a substitute for that formal risk analysis, which should be done
  (or reviewed) with a compliance advisor.
- **Risk management.** Known gaps are tracked candidly rather than hidden: see `COMPLIANCE.md` and
  `BETA_LAUNCH.md` for the live list (e.g., single-machine Fly.io deployment with no redundancy yet,
  no log aggregation/tracing vendor chosen yet, SOC 2 not yet started). Each is a conscious,
  documented decision, not an oversight.

### 3.2 Workforce security

- **Authorization.** Access to production systems (Fly.io, Neon, Upstash, Vercel, GitHub) is limited
  to the Security Officer. Application-level admin access (the `/admin` dashboard) is gated by an
  explicit `ADMIN_EMAILS` allowlist checked on every request, not a role stored in the database —
  changing who has admin access requires a deploy, which is itself logged in git history.
- **Workforce clearance.** New physician users are not self-service: sign-up requires NPI verification
  against the NPPES registry and an explicit admin approval step (`POST /admin/users/{id}/approve`)
  before the account can access any PHI. This is the workforce-equivalent control for the one
  "workforce" category that currently scales past one person — physician end users — even though they
  aren't Oncology Solutions employees.
- **Termination procedure.** Revoking a physician's access: an admin can deactivate the account,
  which invalidates all active sessions. Revoking infrastructure access (Fly.io/Neon/Upstash/Vercel/
  GitHub) as the team grows beyond one person: rotate or remove credentials for departing workforce
  members at each vendor's own access-control panel; this is a manual step today given there is
  exactly one credentialed person, and should become a documented checklist once that changes.

### 3.3 Information access management

- **Access is minimum-necessary by construction, not just policy.** Physicians can only ever query
  their own encounters (`user_id`-scoped at the ORM layer, not just the API layer). There is no
  cross-physician PHI visibility anywhere in the product — not even for admins, whose dashboard
  surfaces aggregate error/usage metrics, not encounter content.
- **Admin access review.** Because `ADMIN_EMAILS` is a short, explicit list read from a deploy-time
  config value, it is trivially auditable at any time via `git log` / `git blame` on `fly.toml`. No
  separate access-review process is needed beyond periodically actually looking at it — recommended
  quarterly, tracked as a to-do rather than an automated control today.

### 3.4 Security awareness and training

Given the current workforce is one clinician-founder who is also the engineer, formal training
delivery (posters, phishing simulations, LMS modules) isn't meaningful yet and would be theater. What
exists in its place: this policy itself, `COMPLIANCE.md`'s living gap list, and the practice of
documenting every security-relevant decision with dated reasoning (see this repo's own docs). Once a
second workforce member is added — clinical or technical — this section needs a real onboarding
training step before they get any access, not just a policy update.

### 3.5 Security incident procedures

See `BREACH_NOTIFICATION_PROCEDURE.md` for the full incident response and breach notification
process. In brief: suspected incidents are investigated immediately, PHI exposure is assessed against
the four-factor risk test in that document, and notification timelines run from the discovery date,
not the resolution date.

### 3.6 Contingency plan

See `CONTINGENCY_PLAN.md` for the full data backup plan, disaster recovery plan, and emergency mode
operation plan, including the verified Neon point-in-time-recovery procedure in `BACKUP_RESTORE.md`.

### 3.7 Evaluation

This policy and the technical controls it describes should be reviewed at least annually, or after
any material architecture change (a new subprocessor, a new PHI-touching feature, a security incident,
or a significant infrastructure change like adding redundant machines). Next scheduled review: one
year from adoption date (see sign-off block).

### 3.8 Business associate contracts

PHI is shared with third-party subprocessors only under an executed Business Associate Agreement
(BAA), or where the vendor never has access to PHI in the first place. Current status (see
`baa-intake.csv` for the live tracker):

| Vendor | Role | BAA status as of 2026-09-04 |
|---|---|---|
| Neon | Primary Postgres database | **Signed and enabled** (org + project-level HIPAA enabled) |
| OpenAI | Transcription + note generation | Requested, pending — also requires the Zero Data Retention rider |
| Anthropic | Note generation, Ask Atlas | Requested, pending |
| Upstash | Redis (rate limiting, caching — no durable PHI) | Requested, pending |
| Fly.io | Application hosting | Requested, pending |
| Vercel | Frontend hosting (no direct PHI) | Requested, pending |
| Resend | Transactional email (OTP codes only, no PHI) | **Not available from vendor** — use is limited to non-PHI OTP delivery by design |
| Twilio | SMS OTP delivery (not yet activated) | Not started |

No production PHI processing should newly rely on a subprocessor without an executed BAA in place,
Resend/Twilio excepted since their use is architecturally limited to OTP codes, never PHI.

## 4. Physical safeguards

Oncology Solutions LLC operates no physical servers or data centers — all infrastructure is hosted by
third-party cloud providers (Fly.io, Neon, Upstash, Vercel). Physical safeguards (facility access
control, environmental protections, media disposal) are therefore inherited from and are each
vendor's own responsibility under their respective BAA/security commitments, not something this
policy independently implements. The workforce's own devices (laptops/phones used to access admin
tooling) should follow ordinary good practice — OS-level disk encryption, screen lock, and passkey/
biometric auth where available (Hei Atlas's own passkey login is one example of this being pushed
into the product itself, not just device policy).

## 5. Technical safeguards

### 5.1 Access control

- **Unique user identification.** Every account is tied to a unique `auth_user` row; sessions are
  unique per login (unique session tokens, no shared/service accounts for physician access).
- **Authentication.** Passwordless by design — no password to leak, phish, or reuse across sites.
  Three methods, all funneled through one session-issuance choke point (`_issue_session`, tagged by
  `method` in the audit log): (1) one-time email codes, (2) SMS OTP via Twilio (built, not yet
  activated pending a Twilio account), (3) Passkeys/WebAuthn (FIDO2, phishing-resistant by
  construction, verified end-to-end against real Touch ID and Face ID hardware).
- **Automatic logoff.** Sessions expire after 30 minutes of inactivity (sliding window).
- **Rate limiting.** OTP requests are capped at 5 per 15 minutes per account and 20 per 15 minutes per
  IP, mitigating brute-force and enumeration attempts.
- **Signup gating.** New accounts require NPI verification and explicit admin approval before any PHI
  access — access is opt-in per verified physician, not open registration.

### 5.2 Audit controls

Every PHI access and every authentication event is written to an append-only `phi_access_log` table —
this table has no update or delete path in the application, only inserts, and is retained for 6 years
consistent with HIPAA's documentation retention requirement (45 CFR §164.316(b)(2)). Admin actions
(approvals, error-rate views) are separately audit-logged. `GET /admin/errors` and `GET /admin/
retention` provide operational visibility into system health without exposing PHI content.

### 5.3 Integrity

- Data in transit and at rest uses vendor-managed, industry-standard mechanisms (see §5.4/§5.5) that
  include integrity protection as part of TLS and disk-level encryption.
- The 24-hour encounter retention window (§6) limits the window in which any integrity issue with raw
  transcripts/recordings could even be relevant — data meant to persist is a physician-reviewed,
  finalized note, not raw AI output.

### 5.4 Transmission security

All network traffic is encrypted in transit: HTTPS enforced end-to-end with HSTS (2-year max-age,
preloaded), Postgres connections require TLS (`sslmode=require`), Redis connections use TLS
(`rediss://`), and all third-party API calls (OpenAI, Anthropic, Twilio) use HTTPS.

### 5.5 Encryption at rest

AES-256 at rest across every durable store: Neon Postgres, Upstash Redis, and Fly.io volumes. This
was confirmed as vendor-managed, always-on encryption at each provider (not a configurable option
that could be accidentally left off) as of the 2026-09-04 review referenced in `BETA_LAUNCH.md`.

## 6. Data minimization and retention

- Encounter recordings, transcripts, and AI-generated draft notes are automatically and permanently
  deleted 24 hours after creation (enforced by a background prune job running every 15 minutes, plus
  a lazy per-user prune on access) — this window was a deliberate decision, confirmed and kept at 24h
  this session, balancing physician workflow (time to review/finalize a note) against minimizing how
  long raw PHI persists anywhere in the system.
  Physicians are instructed to finalize any note that should become part of the permanent medical
  record into their own practice's record system before this window closes — Hei Atlas is a
  documentation aid, not the system of record.
- Physicians are instructed to reference patients by initials or a private handle, not name or MRN,
  further limiting what identifiers ever enter the system at all.
- Audit log entries (`phi_access_log`) are the one deliberately long-retained table (6 years),
  consistent with HIPAA documentation requirements — but audit rows record that an access happened,
  not the PHI content itself.

## 7. Individual rights

Consistent with HIPAA's access and deletion-adjacent expectations, physicians (and, transitively,
their obligation to patients) are supported by:
- `GET /me/export` — full data export.
- `DELETE /me/account` — full account and data deletion.

Both are audit-logged operations.

## 8. Sanctions Policy

Required under 45 CFR §164.308(a)(1)(ii)(C): Oncology Solutions LLC applies appropriate sanctions
against any workforce member who fails to comply with this Security Policy, the Privacy Policy, or
applicable HIPAA requirements.

### 8.1 What counts as a violation

Examples include (non-exhaustive): accessing PHI without a legitimate purpose; sharing credentials;
disabling or circumventing a security control (e.g., attempting to query another physician's
encounters, disabling disk encryption on a work device); failing to report a known or suspected
security incident promptly; storing PHI outside of Hei Atlas's sanctioned systems (e.g., pasting
transcript content into an unapproved third-party tool).

### 8.2 Sanctions

Sanctions are proportionate to the severity, intent, and impact of the violation, and may include, in
increasing order of severity: a documented verbal warning; a written warning placed in the workforce
member's file; mandatory retraining; suspension of system access pending investigation; termination
of access or employment/contractor relationship; and, where the violation may constitute a legal
violation (e.g., unauthorized PHI disclosure), referral to legal counsel and/or regulatory reporting
as required under the Breach Notification Rule (`BREACH_NOTIFICATION_PROCEDURE.md`).

### 8.3 Application

The Security Officer is responsible for investigating suspected violations and determining
appropriate sanctions, documenting both the violation and the sanction applied. Given the current
one-person workforce, self-caused incidents (e.g., a misconfiguration) are handled as documented
corrective action rather than a formal sanction — the mechanism exists and is described here so it is
already in place, correctly, once there is a workforce member other than the Security Officer.
Sanctions apply equally regardless of role or seniority.

### 8.4 Non-retaliation

Workforce members who report a suspected security incident, privacy violation, or compliance concern
in good faith will not be retaliated against, even if the report turns out to be mistaken.

---

## Sign-off (do not treat as adopted until completed)

- [ ] Reviewed by counsel / a compliance advisor
- [ ] Formal risk analysis completed (§3.1) — this policy describes controls, not a substitute for
      that analysis
- [ ] Security Officer / Privacy Officer designation formally confirmed (§2)
- [ ] Adoption date set
- [ ] First annual review date scheduled (§3.7)
