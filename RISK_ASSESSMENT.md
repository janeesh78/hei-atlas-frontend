# Initial Risk Assessment — DRAFT

**Status: draft, not adopted. Review with counsel/a compliance advisor before treating this as your
final risk assessment — see the sign-off block at the end.**

**Applies to:** Hei Atlas (heiatlas.ai), operated by Oncology Solutions LLC.
**Methodology:** NIST SP 800-30 Rev. 1 (Guide for Conducting Risk Assessments), qualitative approach.
**Assessment date:** 2026-09-04. **Assessor:** Dr. Janeesh Sekkath Veedu, MD (Security Officer).

This satisfies `COMPLIANCE.md`'s "Complete an initial risk assessment" item and feeds the SOC 2 table's
CC3 row in that document. It formalizes, as a standalone risk-analysis exercise, what was previously
true only informally — that gaps were tracked candidly in `COMPLIANCE.md`/`BETA_LAUNCH.md` as they
were found, but never assembled into one risk register with likelihood/impact ratings.

**A note on scale, same as the other policy drafts:** this uses a simplified 3×3 likelihood/impact
matrix rather than NIST's full 5×5 scale — appropriately sized for a single-workforce-member
organization at beta stage. A future SOC 2 Type II audit may expect the fuller 5-level granularity;
extend the matrix in §3 if/when that's required, rather than inventing precision this assessment
doesn't actually have yet.

---

## 1. Purpose and scope

Identify, analyze, and prioritize risks to the confidentiality, integrity, and availability of PHI
handled by Hei Atlas, and document existing controls and recommended next steps for each. Scope
matches `COMPLIANCE.md`'s system description: the FastAPI backend (Fly.io), Next.js frontend
(Vercel), primary datastore (Neon Postgres), cache/rate-limit store (Upstash Redis), and the
subprocessors in §7 of `SECURITY_POLICY.md`.

Out of scope: financial/business risk not tied to PHI security (e.g., market risk, general business
continuity unrelated to the app) — this is a security/privacy risk assessment, not a general
enterprise risk assessment.

## 2. Methodology

Per NIST SP 800-30: for each identified threat-vulnerability pair, estimate **likelihood** (given
existing controls) and **impact** (if the risk materializes), combine into a **risk level**, and
record the existing control(s) already mitigating it plus any recommended additional action.

**Likelihood scale:** Low (unlikely without a determined, targeted effort) · Medium (plausible,
could occur without special effort) · High (likely, or already known to have nearly occurred).

**Impact scale:** Low (limited/no PHI exposure, brief/no availability loss) · Medium (limited PHI
exposure or meaningful availability loss) · High (broad PHI exposure, a reportable breach, or
extended unavailability).

**Risk level** = Likelihood × Impact per the matrix below:

| | Impact: Low | Impact: Medium | Impact: High |
|---|---|---|---|
| **Likelihood: Low** | Low | Low | Medium |
| **Likelihood: Medium** | Low | Medium | High |
| **Likelihood: High** | Medium | High | High |

## 3. System characterization (summary)

Full technical detail lives in `COMPLIANCE.md`'s "Technical safeguard mapping" — not duplicated here.
In brief: physicians authenticate (NPI-verified, admin-approved), dictate encounters, and receive
AI-generated notes/coding/guideline citations. PHI touched: audio transcripts, generated notes,
structured clinical output, encounter metadata — no formal identifiers (name/MRN/DOB). All PHI-
bearing content is deleted 24 hours after creation. Six external subprocessors touch the system as
described in `baa-intake.csv`.

## 4. Threat sources considered

- **Adversarial — external.** An attacker attempting unauthorized access to PHI: credential/session
  attacks, API abuse, exploitation of a code vulnerability, or targeting a subprocessor to reach PHI
  indirectly.
- **Adversarial — insider.** Currently low-relevance given a single-workforce-member organization,
  but assessed forward-looking since `SECURITY_POLICY.md` is written to extend past one person.
- **Accidental — workforce/user error.** A physician mis-using the product (e.g., entering a real
  patient name against instructions) or a configuration mistake during development/deploy.
- **Structural — system/software failure.** Infrastructure failure, software defects (including
  latent ones, per §5's reference to a bug already caught once this session), or a data-isolation
  defect.
- **Environmental.** Cloud-provider regional outage or platform-level incident at a subprocessor.

## 5. Risk register

| # | Threat / vulnerability | Likelihood | Impact | Risk | Existing control(s) | Recommended action |
|---|---|---|---|---|---|---|
| R1 | External attacker gains a valid session via credential/OTP brute force | Low | High | Medium | OTP rate-limited 5/15min/account + 20/15min/IP; passwordless (nothing to phish/reuse); passkeys are phishing-resistant by construction | None required now; revisit if IP-distributed abuse is ever observed in `phi_access_log`/`/admin/incidents` |
| R2 | Attacker or bug exposes one physician's encounters to another | Low | High | Medium | Every query is `user_id`-scoped at the ORM layer, not just the API layer; no cross-user PHI surface anywhere, including admin dashboard | Add an automated test asserting cross-user query isolation, so this stays true as the codebase grows, not just true today |
| R3 | Subprocessor (OpenAI/Anthropic/Neon/Upstash/Fly/Vercel) suffers its own breach affecting Hei Atlas PHI | Low | High | Medium | BAA-in-progress with 6 of 8 vendors (Neon signed); `BREACH_NOTIFICATION_PROCEDURE.md` §5 defines the upstream-notification handling | Complete remaining BAA signings (tracked in `baa-intake.csv`); confirm OpenAI ZDR / Anthropic HIPAA-Ready Org activation once signed |
| R4 | Workforce/physician enters a real identifier (name, MRN) into `patient_ref` despite instructions | Medium | Medium | Medium | Product instructs initials/handle only; 24h TTL limits how long any such entry persists; onboarding email reinforces this | Consider a light client-side nudge/warning if free-text `patient_ref` pattern-matches a full name (heuristic only, not a hard block — false positives on legitimate initials would be worse than the risk) |
| R5 | Single Fly.io machine fails, causing an availability outage | Medium | Low | Low | Health check every 15s + auto-restart; no PHI is lost (Postgres is independent of the app machine); documented in `CONTINGENCY_PLAN.md` §3.2/§4 as a deliberate, cost-driven deferral | Revisit the 2+ machine cost decision if/when physician volume makes an outage more disruptive than it is today |
| R6 | Delayed detection of an ongoing incident (no log aggregator/RUM/tracing yet) | Medium | Medium | Medium | `phi_access_log` + `/admin/incidents` + threshold-based Resend alerting (`services/alerting.py`) cover the PHI-specific and error-rate cases already | Vendor pick for a general log aggregator/tracing tool remains open in `BETA_LAUNCH.md`; not urgent given the alerting already in place, but closes the gap for issues outside its specific thresholds |
| R7 | Audit log write fails silently (fail-open by design) during a genuine PHI access | Low | Medium | Low | Deliberate tradeoff — never blocking real user-facing functionality on audit-log success; failures are themselves logged, just not blocking | Accepted residual risk; revisit only if fail-open audit writes are ever observed in practice, not preemptively |
| R8 | Self-review limitation — Security/Privacy Officer is the only workforce member, so no independent second reviewer exists | High | Low | Medium | Documented plainly in `SECURITY_POLICY.md` §2 rather than concealed; this risk assessment and the four policy documents are themselves reviewed by counsel as an external check, per each document's sign-off block | Add an independent second reviewer (technical or compliance) once the organization grows past one person |
| R9 | Passkey/WebAuthn code path (new this session) has a latent defect, being newer and less battle-tested than the OTP path | Low | Medium | Low | Challenge storage fails closed (not open, unlike the rest of the codebase's Redis posture) specifically because this is the one path where fail-open would be a real replay hole; verified via synthetic ceremonies and real-device testing (Touch ID, Face ID ×2) before shipping | Continue treating OTP as the permanent, always-available fallback rather than ever making passkeys the sole auth method |
| R10 | A schema/migration gap causes a NOT NULL or similar defect in production (already occurred once this session, caught before shipping) | Medium | Low | Low | Caught via the DailyErrorStats incident (local dev DB missing a column production had); `server_default` now applied proactively on new nullable-averse columns as a direct lesson from that incident | Consider a lightweight local/production schema-drift check before relying on manual catches alone |
| R11 | Formal disaster-recovery cutover has not been timed end-to-end (data recovery is verified; full app cutover is not) | Medium | Medium | Medium | Data-recovery mechanism itself independently verified 2026-09-04 (marker-row isolation test); documented gap in `CONTINGENCY_PLAN.md` §3.1 | Run a full timed cutover drill; also complete `BACKUP_RESTORE.md` Step 4 (second verification run), currently deferred by choice |
| R12 | Entity classification (Covered Entity vs. Business Associate) remains unresolved, leaving downstream obligations (NPP, breach notification chain) ambiguous | High | Medium | High | Both `NOTICE_OF_PRIVACY_PRACTICES.md` and `BREACH_NOTIFICATION_PROCEDURE.md` default to the narrower/faster-triggering Business Associate obligation as a safe operating assumption in the meantime | Resolve with counsel — this is the single highest-priority open item in this entire assessment, since it gates the real operative content of two other policy documents |

## 6. Summary of top residual risks

Ordered by risk level, highest first:

1. **R12 — entity classification unresolved (High).** Blocks finalizing two of the four policy
   documents drafted 2026-09-04. Recommend resolving with counsel before those documents are adopted.
2. **R1, R2, R3, R4, R6, R8, R11 (Medium).** Each has a real existing control already in place;
   none represent an unmitigated gap, but each has a clear, already-identified next step (above) that
   would move it to Low.
3. **R5, R7, R9, R10 (Low).** Accepted residual risk or already substantially mitigated; revisit
   opportunistically rather than urgently.

No risk in this register was rated High on both axes simultaneously (i.e., nothing is both likely
*and* high-impact with no mitigating control) — the closest is R12, which is high-likelihood-of-
remaining-unresolved but medium-impact, not a High/High combination.

## 7. Review cadence

Re-assess at least annually alongside `SECURITY_POLICY.md`'s own annual review (§3.7 of that
document), and immediately after: any new subprocessor, any new PHI-touching feature, any security
incident, or any material infrastructure change (e.g., moving off a single Fly.io machine).

---

## Sign-off (do not treat as final until completed)

- [ ] Reviewed by counsel / a compliance advisor
- [ ] R12 (entity classification) resolved — see `COMPLIANCE.md`
- [ ] Adoption date set
- [ ] First annual re-assessment date scheduled (§7)
