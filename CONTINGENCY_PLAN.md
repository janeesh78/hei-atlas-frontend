# Contingency Plan — DRAFT

**Status: draft, not adopted. Review with counsel/a compliance advisor before treating this as your
actual governing policy — see the sign-off block at the end.**

**Applies to:** Oncology Solutions LLC, operator of Hei Atlas (heiatlas.ai).

Required under 45 CFR §164.308(a)(7): a data backup plan, disaster recovery plan, and emergency mode
operation plan, an applications-and-data-criticality analysis, and a testing/revision procedure.
Paired with [`BREACH_NOTIFICATION_PROCEDURE.md`](BREACH_NOTIFICATION_PROCEDURE.md) — that document
covers what happens when PHI confidentiality is compromised; this one covers what happens when a
*system* is unavailable, degraded, or has lost data, whether or not PHI was ever exposed.

---

## 1. Applications and data criticality analysis

| System | Holds PHI? | Criticality | Notes |
|---|---|---|---|
| Neon Postgres (primary DB) | Yes | Critical | `auth_user`, `encounter_record`, `phi_access_log`, sessions, everything durable |
| Fly.io (backend API) | Transiently (in-flight requests only) | Critical | Stateless application layer — no durable PHI on the machine itself |
| Upstash Redis | No | Low | OTP codes (short-TTL), rate-limit counters, cached trial-search results — see §2.2 for why this is explicitly out of backup scope |
| Vercel (frontend) | No | Medium | Static/SSR frontend, no PHI touches this tier directly |
| OpenAI / Anthropic (transcription, note generation) | Transiently, in-request only | High (functional dependency) | No durable storage of PHI on these platforms once ZDR/appropriate retention terms are in place under BAA |

The clear conclusion from this table: **Neon Postgres is the one system whose loss would mean actual
data loss.** Every other component either holds nothing durable or holds nothing at all. This is a
deliberate architectural property, not an accident — it's the same minimization posture described in
`SECURITY_POLICY.md` §6, and it's what makes this contingency plan simpler and more defensible than a
typical multi-datastore system would need.

## 2. Data backup plan

### 2.1 Postgres (Neon) — the system of record

Full backup/restore mechanics, verified procedure, and results of the actual verification run live in
[`BACKUP_RESTORE.md`](BACKUP_RESTORE.md) — this plan references it rather than duplicating it, so
there's one place the real, current procedure lives.

Summary: Neon provides continuous point-in-time recovery (PITR) on the Scale plan, currently
configured with a 6-hour retention window (adjustable). This was independently verified end-to-end on
2026-09-04 — a restore branch was created, all 18 tables confirmed present with correct row counts, a
known row spot-checked for correctness, and isolation from production definitively proven via a
marker-row test (not just a passive, potentially-inconclusive timestamp comparison — see
`BACKUP_RESTORE.md`'s change log for why that distinction mattered). A second verification run at a
different point in the retention window (`BACKUP_RESTORE.md` Step 4) was deliberately deferred by
choice, not attempted and failed — revisit when convenient.

### 2.2 Redis (Upstash) — deliberately not backed up

Confirmed 2026-09-01: Redis holds only OTP/IP rate-limit counters (self-resetting every 15 minutes
regardless of any outage) and trial-data caching that is fully rebuilt from source APIs at startup
(`CacheManager.startup()` in `services/cache_layer.py`). Losing Redis entirely costs a brief cold
start, not data. No backup mechanism is needed or planned for it.

### 2.3 Source code and configuration

Both repositories (frontend and backend) are under git version control with a remote (GitHub) as an
independent copy — code and infrastructure-as-config (`fly.toml`, etc.) are inherently backed up by
normal development practice, not a separate contingency concern.

## 3. Disaster recovery plan

### 3.1 Recovery objectives, stated honestly

- **Recovery Point Objective (RPO):** effectively continuous for Postgres, given Neon's PITR — data
  loss in a true database-loss scenario would be bounded by however recent the last committed
  transaction was, not a periodic backup gap.
- **Recovery Time Objective (RTO):** not yet formally measured end-to-end (i.e., "how long would it
  actually take to go from declaring a disaster to physicians being able to use the app again" has not
  been timed as a drill). What **is** verified is the data-recovery mechanism itself (creating and
  validating a restore branch, per `BACKUP_RESTORE.md`) — cutting the live application over to a
  restored branch (updating `DATABASE_URL` and redeploying) has not yet been drilled as a full,
  timed exercise. Recommended as a next step, tracked here rather than overstated as already done.

### 3.2 Infrastructure redundancy — a known, deliberate gap

Fly.io currently runs a single machine for the backend (`hei-atlas-api`). Scaling to 2+ machines for
redundancy was evaluated and explicitly deferred on cost grounds during this beta phase — this is a
documented decision (see `BETA_LAUNCH.md`), not an oversight, and it means a Fly.io machine-level
failure today causes real downtime (the app becomes unavailable) rather than a transparent failover,
even though no *data* would be lost (Postgres survives independently of the application machine).
Vercel's frontend hosting is inherently more redundant — it runs on Vercel's own multi-region
infrastructure, inherited rather than something this plan needs to build.

### 3.3 Recovery procedure (database loss or corruption)

1. Declare the incident; the Security Officer leads recovery.
2. Follow `BACKUP_RESTORE.md` Steps 0–2 to create and verify a restore branch at the most recent safe
   point in time (immediately before the corruption/loss event, using the verified marker-row-style
   isolation check if there's any doubt about the right timestamp).
3. Once verified, point the backend's `DATABASE_URL` at the restored branch and redeploy
   (`flyctl deploy --remote-only --now -a hei-atlas-api`).
4. Run the smoke test (`backend/scripts/smoke_test.py`) against production to confirm the application
   is functioning correctly end-to-end before considering the incident resolved.
5. Document the incident: cause, timeline, data-loss window (if any), and resolution — feeds into
   §5's testing/revision loop and, if PHI confidentiality was ever at risk (not just availability),
   triggers `BREACH_NOTIFICATION_PROCEDURE.md`'s assessment process in parallel.

### 3.4 Recovery procedure (application/hosting failure, data intact)

If Fly.io or Vercel suffer a platform-level outage with Postgres itself unaffected: this is primarily
a wait-on-vendor situation given the current single-machine/vendor-managed-redundancy posture (§3.2).
Vercel's frontend and Fly's backend are independent — a Vercel outage does not affect data integrity,
and a Fly outage does not affect Neon. Monitor each vendor's status page; no data recovery action is
needed, only availability recovery once the vendor resolves the outage (or, if prolonged, standing up
a replacement Fly machine from the existing `fly.toml`/Dockerfile, which are both version-controlled).

## 4. Emergency mode operation plan

**The most important fact shaping this section:** Hei Atlas is a documentation *aid*, not the system
of record. Physicians are already instructed (see `SECURITY_POLICY.md` §6, the onboarding email) to
finalize any note meant to be part of the permanent medical record into their own practice's actual
record system before Hei Atlas's 24-hour retention window closes. This means an Hei Atlas outage does
not create a care-continuity emergency the way an EHR outage would — physicians fall back to their
practice's normal documentation method (direct EHR entry, dictation, paper) exactly as they would on
any day the tool wasn't available for any reason.

Emergency mode operation, therefore, is deliberately simple:
1. If Hei Atlas is unavailable, physicians continue documenting encounters through their practice's
   standard means — no Hei Atlas-specific "emergency mode" workflow is needed on the clinical side.
2. The Security Officer prioritizes restoring the application per §3's recovery procedures.
3. Once restored, physicians resume normal use; no data reconciliation is needed on the clinical side
   since nothing clinical was ever solely dependent on Hei Atlas being up.

This is a genuine structural advantage worth stating plainly rather than under-selling: many
healthcare software contingency plans have to solve for "clinicians literally cannot document care
right now," and this product's design (ambient aid with a short, non-authoritative retention window)
avoids that failure mode by construction.

## 5. Testing and revision procedure

- The backup/restore mechanism itself should be re-verified periodically, not just once — recommended
  at least every 6 months, or after any material change to the Neon plan/retention configuration. The
  deferred `BACKUP_RESTORE.md` Step 4 (a second run at a different point in the retention window) is
  the natural next test.
- This Contingency Plan should be reviewed at least annually alongside `SECURITY_POLICY.md` (see that
  document's §3.7), and immediately after any actual incident, per §3.3 step 5 above.
- A full, timed cutover drill (§3.1's RTO gap) is recommended as the next concrete improvement to this
  plan — currently the data-recovery mechanism is verified, but the full "declare disaster → serving
  physicians again" timeline is not.

---

## Sign-off (do not treat as adopted until completed)

- [ ] Reviewed by counsel / a compliance advisor
- [ ] Full timed cutover drill completed at least once (§3.1)
- [ ] `BACKUP_RESTORE.md` Step 4 completed (second verification run, §5)
- [ ] Adoption date set
- [ ] First scheduled review date set (§5)
