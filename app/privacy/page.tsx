export const metadata = { title: 'Privacy Policy — Hei Atlas' };

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-12 safe-x">
      <div className="mx-auto max-w-2xl ds-card p-8 text-ink text-[14px] leading-relaxed">
        <h1 className="text-[22px] font-semibold mb-4">Privacy Policy</h1>
        <p className="text-muted mb-6">Last updated: July 3, 2026</p>

        <h2 className="text-[16px] font-semibold mt-6 mb-2">1. What we collect</h2>
        <p>
          Name, credentials, NPI, email, optional phone. NPI is verified against the NPPES
          public registry. We do not collect payment information at this time.
        </p>

        <h2 className="text-[16px] font-semibold mt-6 mb-2">2. Encounter data</h2>
        <p>
          Audio transcripts, generated notes, coding output, and toxicity assessments are
          retained for 24 hours and then hard-deleted. Encounters are scoped to your account
          — no other user, including staff, can read them.
        </p>

        <h2 className="text-[16px] font-semibold mt-6 mb-2">3. Third-party processors</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Anthropic Claude — LLM note generation</li>
          <li>OpenAI Whisper — audio transcription fallback</li>
          <li>Neon — managed Postgres for auth + encounter storage</li>
          <li>Upstash — Redis cache</li>
          <li>Resend — one-time verification code delivery</li>
          <li>Fly.io — backend hosting</li>
          <li>Vercel — frontend hosting</li>
        </ul>
        <p className="mt-2">
          Each processor is subject to their own privacy terms. Business Associate Agreements
          are established prior to onboarding external beta users.
        </p>

        <h2 className="text-[16px] font-semibold mt-6 mb-2">4. Cookies and tracking</h2>
        <p>
          The application uses browser localStorage for session tokens and preferences. We do
          not use marketing cookies, analytics pixels, or third-party trackers.
        </p>

        <h2 className="text-[16px] font-semibold mt-6 mb-2">5. Your rights</h2>
        <p>
          You can delete any encounter from the sidebar at any time. Account deletion:
          email <a className="text-accent" href="mailto:support@heiatlas.ai">support@heiatlas.ai</a>.
        </p>

        <p className="mt-8 text-muted text-[12px]">
          This is a placeholder for beta launch. Consult qualified counsel before opening
          general availability.
        </p>
      </div>
    </main>
  );
}
