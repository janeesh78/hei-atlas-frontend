# BAA request drafts — all 7 tracked vendors

Drafted 2026-09-04. Read the **Corrections** section first — researching these turned up real
differences from what's currently in `baa-intake.csv` and `COMPLIANCE.md`, confirmed against each
vendor's own site/docs where possible, not just secondary sources. Two of the seven aren't actually
"send an email" situations once you look closely — flagged inline below.

These are drafts for **you to review and send** — I don't have an email-sending capability in this
session, and sending on your behalf needs your explicit go-ahead per how this session is scoped
anyway. Fill in the `[bracketed]` placeholders (mainly: your name/title, and current plan
confirmations I couldn't check myself) before sending.

---

## Corrections found while researching (fix these regardless of which emails you send)

| Vendor | Doc currently says | Actually is (confirmed 2026-09-04) |
|---|---|---|
| **OpenAI** | Portal: Settings > Org > Legal & compliance | Email **baa@openai.com** directly — confirmed via OpenAI's own Help Center, corroborated by multiple independent sources. No portal request path. |
| **Neon** | Email: support@neon.tech | Email **hipaa@neon.tech** — a dedicated HIPAA-intake address, confirmed via Neon's own docs. General support isn't wrong, just not the direct route. |
| **Fly.io** | Email: billing@fly.io | Email **sales@fly.io** — confirmed via Fly's own healthcare-blueprint doc. `billing@` is very unlikely to be the right inbox for this. |
| **Upstash** | Route: Form only | Also **support@upstash.com** by email — confirmed via Upstash's own docs; the form still works too. |
| **Resend** | "Request via hipaa@resend.com. Available on business plans." | **Resend does not offer a BAA at all, on any plan.** Confirmed directly from resend.com/security's own FAQ: "Resend is not HIPAA compliant and cannot sign a Business Associate Agreement." Not a tier gate — a blanket no. This is a real compliance-posture fact, not just a stale contact. |
| **Vercel** | Form: vercel.com/contact/sales, "Enterprise plan only" | Vercel now has a **self-serve Pro-plan BAA** — $350/mo add-on, click-through in the team billing dashboard, no sales conversation needed. Enterprise is still a separate path (for custom redlines), via your Customer Success Manager/Account Executive, not a generic sales form. **If you're on Vercel Pro (not Enterprise), the fastest path is the dashboard, not either email below.** |
| **Anthropic** | Email: legal@anthropic.com | Anthropic's documented path is "reach out to your Anthropic contact or Sales team" (claude.com/contact-sales) — I found no confirmation that legal@anthropic.com is actually the BAA intake. Drafted below anyway since it's a plausible real address, but flagged as unconfirmed. |

One more thing worth your attention, not just contact-info trivia: Anthropic's help docs say **Covered Models under a BAA require 30-day data retention and aren't available with Zero Data Retention (ZDR)** — the opposite of OpenAI, where ZDR is what makes the BAA actually cover PHI. If you sign both, Claude API traffic would be retained 30 days under Anthropic's BAA while OpenAI's stays zero-retention — a real, asymmetric data-retention posture across your two model vendors worth deciding on deliberately, not something to notice after the fact.

---

## 1. OpenAI

**To:** baa@openai.com
**Subject:** BAA request — API (Whisper + Chat Completions) for Hei Atlas

> Hi,
>
> I'm requesting a Business Associate Agreement (BAA) for OpenAI API usage.
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists. We're currently in closed beta with a small number of physician users.
>
> **Use case:** We use the Whisper API for transcribing recorded oncology patient encounters, and Chat Completions for generating structured clinical notes from those transcripts. Both are in our direct request path and may process PHI once we're handling real patient encounters (we do not currently send real PHI through the API — no BAA is executed yet, so we're intentionally holding off).
>
> **Zero Data Retention:** We understand ZDR is required for the BAA to actually cover PHI in API requests, and we'd like ZDR enabled as part of this agreement.
>
> Could you let us know the next steps, and whether there's any additional information about our account or use case you need from us?
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 2. Anthropic

**To:** legal@anthropic.com — **unconfirmed as the real intake; the documented path is the sales contact form at claude.com/contact-sales, or an existing Anthropic account contact if you have one.** Try this email first if you want, but if you don't hear back within a few business days, use the contact-sales form with the same message instead of waiting.

**Subject:** BAA request — Claude API for Hei Atlas (oncology clinical documentation)

> Hi,
>
> I'm requesting a Business Associate Agreement (BAA) for our use of the Claude API (first-party, opus/sonnet models).
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists, currently in closed beta.
>
> **Use case:** Claude generates structured oncology clinical notes from encounter transcripts and answers point-of-care questions grounded in the current encounter (our "Ask Atlas" feature). This is in our direct PHI-adjacent request path once we begin handling real patient encounters — no PHI is sent today, pending this agreement.
>
> **Setup:** We understand this requires our organization to be configured as a HIPAA-Ready API Org, with our Primary Owner activating this after the BAA is signed. We'd appreciate guidance on that process.
>
> One thing we'd like to understand as part of this: we've read that Covered Models under Anthropic's BAA require 30-day data retention and aren't available with Zero Data Retention enabled. Could you confirm this is still current, and help us understand the retention implications for clinical transcript/note content specifically?
>
> Please let us know next steps, or if this should go through your sales team instead.
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 3. Neon

**To:** hipaa@neon.tech

**Subject:** BAA / HIPAA enablement — Postgres project for Hei Atlas

> Hi,
>
> I'm reaching out about enabling HIPAA compliance and a Business Associate Agreement (BAA) for our Postgres project.
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists, currently in closed beta.
>
> **Project:** `ep-empty-violet-atovl6j8-pooler`, us-east-1. [Confirm current plan tier here — Scale plan is required and we may not be on it yet; happy to upgrade as part of this process.]
>
> **Use case:** This database stores encounter records (transcripts, generated notes) with a 24-hour retention policy before permanent deletion — no PHI is stored today, pending this agreement and our own internal readiness.
>
> Could you walk us through your self-serve HIPAA enablement process, and confirm what's needed on our end (plan tier, any database-level configuration) before PHI can flow through this project under a signed BAA?
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 4. Upstash

**To:** support@upstash.com

**Subject:** BAA request — Redis (Enterprise) for Hei Atlas

> Hi,
>
> I'm requesting a Business Associate Agreement (BAA) for our Redis database, as part of your Enterprise HIPAA offering.
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists, currently in closed beta.
>
> **Database:** `fine-piranha-148206`. Used for rate-limiting counters, short-lived auth/WebAuthn challenges, and an idempotency cache — no PHI is stored in Redis by design, but we're pursuing a BAA as part of a complete vendor compliance posture before opening this app more broadly.
>
> Could you let us know Enterprise pricing and next steps, and what's needed on our end (e.g., marking specific databases as HIPAA databases, enabling Prod Pack / Credential Protection, per your own docs) to get this in place?
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 5. Fly.io

**To:** sales@fly.io

**Subject:** BAA request — Machines hosting for Hei Atlas (app: hei-atlas-api)

> Hi,
>
> I'm requesting a Business Associate Agreement (BAA) for our backend hosting on Fly.io.
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists, currently in closed beta.
>
> **App:** `hei-atlas-api`, region `iad`. This is our FastAPI backend — the request path for transcription, note generation, and encounter storage.
>
> We've read through your healthcare-apps guide (fly.io/docs/blueprints/going-to-production-with-healthcare-apps/) and understand the BAA is pre-signed on your end and activates once countersigned by us. Could you confirm our account is eligible (plan tier, order form requirements) and send over the agreement?
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 6. Vercel

**Check your plan tier before sending anything.** If you're on **Pro**: skip this email entirely — go to your team's billing settings in the Vercel dashboard, there should be a HIPAA BAA add-on ($350/mo, self-serve click-through, no request needed). If you're on **Enterprise**, or want the standard agreement redlined (which Pro can't do), use the message below via your Customer Success Manager/Account Executive if you have one, or the sales contact form at vercel.com/contact/sales.

**Subject:** BAA request — Enterprise, frontend hosting for Hei Atlas

> Hi,
>
> I'm requesting a Business Associate Agreement (BAA) for our frontend hosting.
>
> **Company:** Oncology Solutions LLC, operating Hei Atlas (heiatlas.ai) — an ambient clinical documentation platform for oncologists, currently in closed beta.
>
> **Project:** `hei-atlas` (heiatlas.ai). The frontend itself doesn't handle PHI directly — patient data flows through our own backend API, not through Vercel's infrastructure — but we're pursuing a complete vendor compliance posture ahead of opening this more broadly, and understand your standard BAA covers PHI across your global infrastructure regardless.
>
> Could you let us know Enterprise pricing and next steps to get this signed?
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## 7. Resend

**Resend has confirmed on their own site that they cannot sign a BAA, on any plan.** Sending a request won't produce a BAA — but there's still real value in getting a dated, explicit confirmation on file for your compliance records, and in asking whether that's likely to change. That's what this drafts, not a request expecting a "yes."

**To:** team@resend.com

**Subject:** HIPAA / BAA status confirmation for Hei Atlas

> Hi,
>
> We use Resend for transactional email (domain heiatlas.ai) — currently one-time login codes and account notifications, never patient health information.
>
> Your security page states Resend cannot sign a Business Associate Agreement on any plan. Could you confirm that's still current, and let us know if HIPAA/BAA support is on your roadmap? We'd like to keep this on file as part of our vendor compliance review, and revisit if your position changes.
>
> Thank you,
> [Your name], [title]
> Oncology Solutions LLC
> compliance@oncologysolutions.us

---

## Recommended next step for your own tracking docs

Once you've reviewed these, say the word and I'll update `baa-intake.csv` and `COMPLIANCE.md`'s BAA
checklist with the corrected contacts, the Resend "cannot BAA" fact, and the Vercel self-serve option
— all currently still showing the stale info from before this research.
