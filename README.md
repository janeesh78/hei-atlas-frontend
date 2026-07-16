# Hei Atlas — Frontend

Next.js frontend for [Hei Atlas](https://heiatlas.ai), a voice-first ambient documentation and clinical decision support app for oncology. Deployed to Vercel.

## Features

- **Ambient recording** — in-browser recording with an offline-tolerant upload queue (recordings survive a dropped connection or an expired session and drain automatically on reconnect/re-login).
- **Live transcription & note generation** — streams a visit transcript through the backend and generates a structured note (H&P, Consultation, Follow-Up, or Assessment & Plan), with reconciliation against a pasted prior note.
- **CTCAE toxicity extraction** — grades toxicities mentioned in the encounter, subtracting anything already documented in a prior note unless it was also discussed today.
- **Clinical decision support** — guideline citations and nearby clinical trial matching.
- **Coding Intelligence** — two layers, shown side by side:
  - an instant, purely client-side heuristic preview (`lib/coding.ts`), computed for free with no network round trip;
  - an authoritative backend-analyzed report (`components/BackendCodingPanel.tsx`) — deterministic E/M/CPT/ICD-10 suggestions grounded to today's transcript, with per-code accept/dismiss review and an attestation gate before codes can be copied for billing.
- **Encounter history** — signature-based autosave (regenerating a note updates its existing row instead of duplicating it) and restore of any saved visit, including its coding review state.
- **PWA / offline shell** — a service worker precaches the app shell and serves navigations network-first with a cached-shell fallback.
- **Admin dashboard** — usage and activity overview, gated by an allow-list of admin emails.

## Tech Stack

- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` to the backend's URL (`http://localhost:8000` for a local backend, or the deployed Fly.io API for a remote one).

## Development

```bash
npm run dev
```

Open `http://localhost:3000`. The app is auth-gated (OTP-based sign-in against the backend) beyond the landing page.

## Other Scripts

```bash
npm run build   # production build
npm start        # serve the production build (run `build` first)
npm run lint     # ESLint
```

## Deployment

```bash
vercel deploy --prod --yes
```

Deploys to the `hei-atlas` Vercel project. No CI/CD — this is a direct deploy from the local working tree. `next.config.js` also rewrites `/backend/*` to the Fly.io API as a same-origin fallback for networks that block the API's own hostname.

## Project Structure

```
oncology-solutions-web/
├── app/
│   ├── page.tsx              # Landing page
│   ├── login/                # OTP sign-in
│   ├── app/                  # Authenticated hub
│   │   └── ambient/          # Ambient recording + note-generation workspace
│   ├── admin/                 # Admin dashboard
│   ├── privacy/ terms/        # Static pages
│   └── layout.tsx             # Root layout, service worker registration
├── components/
│   ├── ResultsPanel.tsx        # Note review/edit, renders the coding + CDS panels
│   ├── CodingPanel.tsx         # Client-heuristic instant coding preview
│   ├── BackendCodingPanel.tsx  # Backend-analyzed authoritative coding report
│   ├── ToxicityPanel.tsx       # CTCAE findings
│   └── PendingUploadsPanel.tsx # Offline-tolerant recording upload queue
├── lib/
│   ├── api.ts                 # Typed backend API calls (notes, coding, transcription, CDS)
│   ├── auth.ts                 # Session/token handling, encounter save/restore
│   ├── apiBase.ts              # Resilient multi-base fetch (handles DNS-blocked hosts)
│   ├── coding.ts                # Client-side instant coding heuristic
│   ├── ctcae.ts                 # Toxicity extraction/grading
│   └── recordingQueue.ts        # Offline-tolerant recording upload queue
└── public/sw.js                 # Service worker (shell caching, network-first navigation)
```
