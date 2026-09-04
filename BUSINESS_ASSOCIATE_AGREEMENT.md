# HIPAA Business Associate Agreement (Physician/Practice-Facing) — DRAFT

**Status: draft, not adopted, not legally binding until executed. This carries materially higher
stakes than the other four policy documents in this repo** — those are internal governance
documents; this is a **bilateral contract**. Once a physician or practice actually accepts it,
Oncology Solutions LLC is legally bound by its exact terms with them. **Do not present this to any
physician for acceptance until it has been reviewed by a healthcare/HIPAA attorney** — see the
sign-off block at the end.

**Applies to:** the relationship between Oncology Solutions LLC ("Business Associate," operator of
Hei Atlas) and each physician or practice ("Covered Entity") using Hei Atlas.

---

## Why this document exists

`COMPLIANCE.md`'s BAA checklist tracks two directions, and this is the one that wasn't tracked before
2026-09-04: now that Oncology Solutions LLC's role is confirmed as a **Business Associate** (physicians
and their practices are the Covered Entities Hei Atlas serves), HIPAA requires a signed BAA **between
Hei Atlas and each Covered Entity** before their PHI is handled (45 CFR §164.502(e), §164.504(e)) —
separate from, and in the opposite direction of, the vendor BAAs tracked in `baa-intake.csv` (where
Hei Atlas is the customer, not the party being contracted).

**A note on how this should probably be executed, not just what it says:** negotiating a bespoke BAA
with every individual physician doesn't scale for a self-service product, and this session already has
real precedent for the alternative — Neon's and Vercel's own BAAs with *their* customers (including
Hei Atlas) are both standard-form, click-through documents accepted without a negotiated signature
exchange (see `baa-intake.csv`). This draft is written the same way: a **standard-form addendum
incorporated into Hei Atlas's existing Terms of Use**, intended to be accepted via a click-through
step (at signup or at admin approval — still an open implementation decision, tracked in
`COMPLIANCE.md`), not a bespoke contract requiring individual negotiation. If a specific practice ever
needs a negotiated version instead of the standard form, that's a distinct, counsel-involved path, not
what this template is for.

---

## HIPAA Business Associate Agreement

This Business Associate Agreement ("Agreement") supplements and is incorporated into the Terms of Use
between Oncology Solutions LLC ("Business Associate") and the physician or practice accepting it
("Covered Entity"), effective as of the date Covered Entity accepts Hei Atlas's Terms of Use
("Effective Date").

### 1. Definitions

Terms used but not otherwise defined in this Agreement — including "Breach," "Business Associate,"
"Covered Entity," "Protected Health Information" (PHI), "Required by Law," "Secretary," "Subcontractor,"
"Unsecured PHI," and "Workforce" — have the meanings given in 45 CFR Parts 160 and 164 (the "HIPAA
Rules"), as amended from time to time.

### 2. Permitted uses and disclosures by Business Associate

Business Associate may use or disclose PHI only:
(a) to perform the Hei Atlas services on Covered Entity's behalf — transcribing dictated clinical
    encounters, generating draft clinical notes, structured coding/toxicity-grading output, and
    guideline/clinical-trial matching — consistent with the Terms of Use, and as otherwise permitted
    or required by this Agreement or applicable law;
(b) for Business Associate's own proper management and administration, or to carry out its own legal
    responsibilities, provided any further disclosure is either Required by Law or Business Associate
    obtains reasonable assurances from the recipient that the PHI will be held confidentially, used or
    further disclosed only as Required by Law or for the purpose disclosed, and that the recipient will
    notify Business Associate of any instance of which it becomes aware in which the confidentiality of
    the PHI has been breached;
(c) to report violations of law to appropriate federal or state authorities, consistent with
    45 CFR §164.502(j)(1);
(d) to de-identify PHI in accordance with 45 CFR §164.514(a)-(c), after which the resulting information
    is no longer PHI and is not subject to this Agreement.

Business Associate will not use or disclose PHI in any manner that would violate the HIPAA Rules if
done by Covered Entity, except as permitted above.

### 3. Obligations of Business Associate

Business Associate agrees to:

(a) **Safeguards.** Implement administrative, physical, and technical safeguards that reasonably and
    appropriately protect the confidentiality, integrity, and availability of electronic PHI, consistent
    with 45 CFR Part 164, Subpart C — as described in `SECURITY_POLICY.md`.
(b) **Reporting.** Report to Covered Entity any use or disclosure of PHI not permitted by this
    Agreement, including any incident meeting the definition of a "Breach" under 45 CFR §164.402,
    without unreasonable delay and in no case later than **[10] business days** after discovery — a
    shorter window than the general 60-day HIPAA maximum, deliberately, so that Covered Entity retains
    adequate time within its own 60-day statutory clock to notify affected patients. This is the
    obligation `BREACH_NOTIFICATION_PROCEDURE.md` §3 already commits Business Associate to; this
    Agreement is what makes that commitment contractually binding rather than only a matter of internal
    policy.
(c) **Subcontractors.** Ensure that any subcontractor that creates, receives, maintains, or transmits
    PHI on Business Associate's behalf agrees, in writing, to the same restrictions and conditions that
    apply to Business Associate under this Agreement. Business Associate's current subcontractors and
    their PHI-handling role are tracked in `baa-intake.csv`; a subcontractor without its own executed
    BAA in place should not be handling live PHI (see `SECURITY_POLICY.md` §3.8).
(d) **Access.** Make PHI available to Covered Entity (or, at Covered Entity's direction, to an
    individual) as necessary to satisfy Covered Entity's obligations under 45 CFR §164.524. In
    practice, physicians already have self-service access via `GET /me/export`.
(e) **Amendment.** Make PHI available for amendment, and incorporate any amendments, as necessary to
    satisfy Covered Entity's obligations under 45 CFR §164.526.
(f) **Accounting of disclosures.** Make available the information necessary for Covered Entity to
    provide an accounting of disclosures under 45 CFR §164.528. `phi_access_log`'s existing audit trail
    (see `SECURITY_POLICY.md` §5.2) is the technical source for this.
(g) **Availability of books and records.** Make Business Associate's internal practices, books, and
    records relating to the use and disclosure of PHI available to the Secretary of Health and Human
    Services for purposes of determining Covered Entity's compliance with the HIPAA Rules.
(h) **Minimum necessary.** Request, use, and disclose only the minimum PHI necessary to accomplish the
    permitted purpose — consistent with Hei Atlas's existing data-minimization design (initials/handle
    only, no name/MRN/DOB; 24-hour retention; see `SECURITY_POLICY.md` §6).
(i) **Return or destruction of PHI upon termination.** Upon termination of this Agreement, if feasible,
    return or destroy all PHI received from, or created/received on behalf of, Covered Entity. Where
    Hei Atlas's own 24-hour retention policy applies, this is substantially self-fulfilling in
    practice — there is ordinarily very little PHI left to return or destroy by the time a termination
    would take effect. If return or destruction is infeasible for any residual data (e.g., audit-log
    entries retained per §164.316(b)(2)), Business Associate will extend the protections of this
    Agreement to that information for as long as it is retained, and limit further uses/disclosures to
    the purposes that make return/destruction infeasible.

### 4. Obligations of Covered Entity

Covered Entity agrees to:
(a) notify Business Associate of any limitation in its own Notice of Privacy Practices that may affect
    Business Associate's permitted uses or disclosures of PHI;
(b) notify Business Associate of any restriction on use or disclosure of PHI that Covered Entity has
    agreed to (under 45 CFR §164.522) that may affect Business Associate's permitted uses or
    disclosures;
(c) not request Business Associate to use or disclose PHI in any manner that would not be permissible
    under the HIPAA Rules if done by Covered Entity itself, except for Business Associate's own proper
    management/administration or legal responsibilities as permitted under §2(b) above.

### 5. Term and termination

(a) **Term.** This Agreement is effective as of the Effective Date and terminates automatically upon
    termination of the underlying Terms of Use, or as otherwise provided below.
(b) **Termination for cause.** Upon either party's knowledge of a material breach of this Agreement by
    the other party, the non-breaching party will provide an opportunity to cure within **[30] days**.
    If the breaching party does not cure within that period, the non-breaching party may terminate this
    Agreement and the underlying Terms of Use.
(c) **Effect of termination.** See §3(i) above (return or destruction of PHI).

### 6. Miscellaneous

(a) **Interpretation.** Any ambiguity in this Agreement will be resolved in favor of an interpretation
    that permits compliance with the HIPAA Rules.
(b) **Amendment.** The parties agree to amend this Agreement as necessary for Business Associate or
    Covered Entity to comply with the HIPAA Rules as they may be amended from time to time.
(c) **No third-party beneficiaries.** Nothing in this Agreement confers any rights on any person other
    than the parties and their respective successors and permitted assigns.
(d) **Survival.** §3(i) (return/destruction of PHI) and any related confidentiality obligations survive
    termination of this Agreement.
(e) **Governing law.** [To be set by counsel — typically the state of incorporation or principal place
    of business.]

---

## Sign-off (do not present to any physician for acceptance until completed)

- [ ] Reviewed by a healthcare/HIPAA attorney — **do not skip this one**; unlike the internal policy
      documents, this creates binding obligations the moment a physician accepts it
- [ ] Breach-notification window in §3(b) confirmed (currently drafted at 10 business days — a
      reasonable industry-typical placeholder, not a fixed requirement)
- [ ] Cure period in §5(b) confirmed (currently drafted at 30 days)
- [ ] Governing law set (§6(e))
- [ ] Execution mechanism decided and built — click-through at signup vs. at admin-approval time vs.
      some other flow; see `COMPLIANCE.md`'s BAA checklist item for this exact open question
- [ ] Confirmed how this interacts with the existing Terms of Use (incorporated by reference, versioned
      together, etc.)
- [ ] Effective-date mechanics finalized once the execution mechanism (above) is built
