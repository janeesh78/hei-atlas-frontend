# Notice of Privacy Practices — DRAFT

**Status: draft, not published. Do not treat as adopted or distribute to anyone until reviewed by
counsel and formally adopted (see the sign-off block at the end).**

## A note on why this document exists and who should actually publish it

A Notice of Privacy Practices (NPP) is a specific, defined HIPAA document (45 CFR §164.520) that a
**Covered Entity** — a healthcare provider, health plan, or clearinghouse that directly treats
patients or bills for care — must give to the individuals it treats, describing how their health
information is used and their rights regarding it.

Hei Atlas/Oncology Solutions LLC's actual role under HIPAA isn't settled yet (see `COMPLIANCE.md`'s
"Register the entity type" item). Based on how the product actually works — physicians use Hei Atlas
as a documentation tool for encounters that happen under their own practice's care relationship, not
Hei Atlas's — the more likely classification is that **each physician's own practice is the Covered
Entity**, with Hei Atlas acting as a **Business Associate** to that practice. If that's how this
shakes out, the obligation to issue an NPP to patients belongs to the practice, not to Hei Atlas —
a Business Associate's obligations run through its BAAs with covered entities, not through its own
patient-facing NPP.

This draft is written so it's useful either way:
- If Hei Atlas is a Business Associate (the more likely case): this serves as a **template/reference**
  a physician can adapt into their own practice's NPP, specifically covering how their practice's use
  of Hei Atlas fits into what patients are told.
- If some future version of this product ever contracts directly with patients (the Covered Entity
  case): this becomes the real, publishable NPP, once the placeholder sections below are filled in
  and reviewed by counsel.

**Don't publish this as-is.** Confirm the entity classification first — it changes who this document
is even for.

---

## Notice of Privacy Practices

**Effective date:** [ ] · **Last revised:** 2026-09-04

**THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN
GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.**

### Who this notice covers

[If issued by a physician's practice: name of the practice/provider.]
[If issued by Hei Atlas directly: Oncology Solutions LLC, operator of Hei Atlas (heiatlas.ai).]

### Our commitment to your privacy

We are required by law to maintain the privacy of your protected health information ("PHI"), to
provide you with this notice describing our legal duties and privacy practices, and to notify you if
a breach occurs that compromises the privacy or security of your information.

### How your information is used and disclosed

**Treatment.** Your care team uses Hei Atlas to record and document oncology encounters — the tool
transcribes the conversation and generates a structured clinical note, which your provider reviews
and finalizes into your medical record. This is treatment-related use.

**A note on how the underlying technology works, since this is unusual enough to explain plainly:**
Hei Atlas is an AI-assisted documentation tool. Your encounter is recorded, transcribed via a
third-party AI transcription service, and a draft clinical note is generated via a third-party AI
language model. Both are subject to a Business Associate Agreement once executed, meaning they may
only use your information to provide this specific service and are contractually bound by the same
HIPAA obligations we are. Your provider reviews and is solely responsible for the accuracy of any
AI-generated note before it becomes part of your medical record.

**Data minimization.** Hei Atlas does not require your name, medical record number, or other direct
identifiers — providers are instructed to reference you only by initials or a private handle within
the tool. Voice recordings, transcripts, and draft notes are automatically and permanently deleted
24 hours after creation; anything meant to be part of your permanent medical record is finalized into
your provider's actual record system before that window closes.

**Payment and healthcare operations.** [Practice-specific — fill in if applicable: billing,
insurance claims processing, quality assessment, etc.]

**As required by law.** We may disclose your information when required by federal, state, or local
law, including in response to court orders, subpoenas, or public health reporting requirements.

### Your rights

- **Right to access** — You may request a copy of your medical record.
- **Right to request amendment** — You may ask us to correct information you believe is incorrect or
  incomplete.
- **Right to an accounting of disclosures** — You may request a list of certain disclosures we've
  made of your information.
- **Right to request restrictions** — You may ask us to limit how we use or disclose your
  information for treatment, payment, or operations.
- **Right to request confidential communications** — You may ask that we contact you in a specific
  way or at a specific location.
- **Right to a paper copy of this notice** — Available upon request at any time, even if you agreed
  to receive it electronically.
- **Right to be notified of a breach** — We will notify you if your unsecured PHI is involved in a
  breach, as required by the HIPAA Breach Notification Rule.

### How to exercise these rights or file a complaint

[Contact method — practice's own contact info, or if Hei Atlas-issued: compliance@oncologysolutions.us]

You may also file a complaint with the U.S. Department of Health and Human Services, Office for Civil
Rights, without fear of retaliation.

### Changes to this notice

We reserve the right to change this notice and to make the revised notice effective for information
we already have as well as information we receive in the future.

---

## Sign-off (do not distribute until completed)

- [ ] Entity classification confirmed (Covered Entity vs. Business Associate) — see `COMPLIANCE.md`
- [ ] Reviewed by counsel
- [ ] [If practice-issued] Adapted with the specific practice's name, contact info, and any
      practice-specific payment/operations language
- [ ] Effective date set
- [ ] Publication method decided (posted, handed out, posted online per §164.520(c))
