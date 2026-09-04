# Breach Notification Procedure — DRAFT

**Status: draft, not adopted. Review with counsel/a compliance advisor before treating this as your
actual governing policy — see the sign-off block at the end.**

**Applies to:** Oncology Solutions LLC, operator of Hei Atlas (heiatlas.ai). Implements the HIPAA
Breach Notification Rule (45 CFR Part 164, Subpart D). Paired with
[`CONTINGENCY_PLAN.md`](CONTINGENCY_PLAN.md) — that document covers system availability/data-loss
incidents; this one covers PHI confidentiality incidents specifically, whether or not any system was
ever down.

**This document is meant to be usable during an actual live incident** — it's written to be
skimmable under pressure, not just legally complete. If you're reading this because something just
happened, start at §1.

---

## A note on who this notice runs to — read before an incident, not during one

**Resolved 2026-09-04: Oncology Solutions LLC is a Business Associate**, serving physicians/practices
who are themselves the Covered Entities (see `COMPLIANCE.md`'s "Register the entity type" item, now
checked). **§3 below is the operative path.** Oncology Solutions LLC's obligation under HIPAA is to
**notify the affected physician/practice** (the Covered Entity) without unreasonable delay, and no
later than 60 days after discovery, or sooner if the BAA with that practice specifies a shorter
window. The practice then carries its own separate obligation to notify their patients, HHS, and
potentially media — Oncology Solutions LLC does not do that notification directly.

§4 (the Covered Entity path — direct-to-patient/HHS/media notification) is retained below only for
completeness, in case some future version of the product ever contracts with patients directly. It is
not the operative path today and should not be followed for an actual incident under the current
business model.

---

## 1. If you suspect a breach right now

1. **Don't try to fix it and stay quiet about it — start the clock instead.** The notification
   deadline runs from the date of *discovery*, not the date you finish investigating. "Discovery"
   legally happens the moment anyone in the organization knew or should have known — so identify that
   date and write it down immediately.
2. **Contain it.** Revoke the specific credential/session/access path if identifiable (e.g., an admin
   can deactivate a user's account and invalidate their sessions immediately). Don't destroy evidence
   — don't delete logs, don't reset the database — while doing so.
3. **Notify the Security Officer** (Dr. Janeesh Sekkath Veedu, MD) immediately if they aren't already
   aware — given the current one-person workforce this is usually the same person discovering it, but
   the step is stated explicitly for when that's no longer true.
4. **Preserve evidence.** `phi_access_log` is already append-only and can't be tampered with after the
   fact — pull the relevant rows (by user, time range, or IP as applicable) rather than relying on
   memory of what happened.
5. **Move to §2 (assessment).** Don't skip the formal 4-factor assessment even if the answer feels
   obvious — it's what the regulation requires and it's what your documentation trail needs to show,
   per §6.

## 2. Is this actually a "breach"? — the 4-factor assessment

Under 45 CFR §164.402, an impermissible use or disclosure of PHI is *presumed* to be a breach requiring
notification **unless** a documented risk assessment demonstrates a **low probability that the PHI was
compromised**, based on at least these four factors:

1. **Nature and extent of the PHI involved** — Does this include identifiers, clinical detail, or
   both? (Hei Atlas's own architecture limits this somewhat by design — physicians are instructed to
   reference patients by initials/handle rather than name or MRN, and raw transcripts/recordings are
   deleted after 24 hours — so the realistic exposure window and identifier richness are both smaller
   than a typical EHR breach, but this must still be assessed per-incident, not assumed.)
2. **Who the unauthorized person was and what they could do with it** — An internal, credentialed
   physician accidentally viewing a stray row is a very different risk than an external attacker.
3. **Whether the PHI was actually acquired or viewed**, or only potentially exposed — e.g., a
   misdirected email that bounced vs. one confirmed opened.
4. **The extent to which the risk has been mitigated** — e.g., a lost device was remotely wiped before
   any access occurred; a credential was rotated within minutes.

**Two narrow exceptions** don't require this assessment at all, because they're not "breaches" by
definition (45 CFR §164.402(1)):
- Unintentional access by a workforce member acting in good faith, within their authority, not
  further used/disclosed impermissibly.
- Inadvertent disclosure between two people both authorized to access PHI at the same organization,
  not further used/disclosed impermissibly.

**Document the assessment either way** — including a conclusion that notification isn't required. See
§6.

## 3. Operative path: Hei Atlas is the Business Associate (confirmed 2026-09-04 — see note above)

1. Notify the affected physician(s)/practice(s) **without unreasonable delay, and no later than 60
   days** after the discovery date established in §1.
2. Include what's known at the time: a description of what happened, the types of PHI involved, and
   what Oncology Solutions LLC is doing about it (investigation, mitigation, remediation) — HIPAA does
   not require waiting for a complete investigation before making this notification; an incomplete but
   timely notice is expected practice.
3. Check the specific BAA with that practice — some BAAs specify a shorter notification window than
   the 60-day statutory maximum (e.g., "within 5 business days"). The signed BAA controls if stricter.
4. The practice then owns notifying their own patients, HHS, and (if applicable) media under §4 below
   — Oncology Solutions LLC's direct obligation under this model ends at step 1, though offering
   reasonable cooperation/information to the practice for their own notification is good practice and
   likely a BAA term.

## 4. Reference only, not operative today: if Oncology Solutions LLC were the Covered Entity

1. **Notify affected individuals** without unreasonable delay, no later than **60 days** after
   discovery. Must include: a brief description of what happened: including discovery date and
   incident date if known; the types of PHI involved; steps individuals should take to protect
   themselves; what the organization is doing to investigate, mitigate, and prevent recurrence; and
   contact information.
2. **Notify HHS**, via the [HHS breach portal](https://ocrportal.hhs.gov/ocr/breach/wizard_breach.jsf):
   - **500 or more individuals:** notify HHS **concurrently** with individual notification (within the
     same 60-day window), and notify prominent media outlets serving the affected state/jurisdiction.
   - **Fewer than 500 individuals:** HHS notification can be made annually, within 60 days of the end
     of the calendar year in which the breach was discovered — but don't defer individual notification
     itself, which stays on the 60-day-from-discovery clock regardless of count.
3. **Notify media** (§4.2) only applies at the 500+ threshold, per jurisdiction affected.

## 5. Subprocessor (upstream) breach notification

If a subprocessor — OpenAI, Anthropic, Neon, Upstash, Fly.io, Vercel — experiences a breach involving
Hei Atlas PHI, their BAA with Oncology Solutions LLC obligates them to notify Oncology Solutions LLC
without unreasonable delay. On receiving such a notice:
1. Treat it exactly as if internally discovered — the discovery-date clock in §1 starts from when
   Oncology Solutions LLC (not the subprocessor) learned of it, per how BA-to-BA/CE chains work under
   the rule, but don't sit on it — flow the assessment (§2) and notification (§3) through promptly.
2. Confirm the subprocessor's own remediation steps before considering the incident closed on that
   side.
3. Cross-reference `baa-intake.csv` for the current BAA status of each vendor — a vendor without an
   executed BAA yet (see the live tracker) has no contractual notification obligation in the first
   place, which is itself a reason those requests are being pursued actively rather than treated as
   optional paperwork.

## 6. Documentation

Maintain a record of every breach risk assessment performed — including ones that concluded
notification wasn't required — for **6 years**, consistent with HIPAA's general documentation
retention requirement (45 CFR §164.316(b)(2), the same retention period already applied to
`phi_access_log`). At minimum, each record should capture: discovery date, incident description, the
4-factor assessment and its conclusion, notifications made (to whom, when, how), and remediation
steps taken.

## 7. Roles

- **Security Officer** (Dr. Janeesh Sekkath Veedu, MD): leads investigation, containment, and the
  4-factor assessment.
- **Privacy Officer** (Dr. Janeesh Sekkath Veedu, MD): leads notification content and delivery,
  coordinates with counsel.

Currently the same person for both roles, per `SECURITY_POLICY.md` §2 — stated here again
deliberately, since during a live incident it matters that there's no ambiguity about who's driving.

---

## Sign-off (do not treat as adopted until completed)

- [ ] Reviewed by counsel / a compliance advisor
- [x] Entity classification confirmed — Business Associate (2026-09-04); §3 is the operative path
- [ ] Adoption date set
- [ ] Confirm whether any executed BAA (once signed) specifies a notification window shorter than the
      statutory 60 days, and note it against that vendor in `baa-intake.csv`
