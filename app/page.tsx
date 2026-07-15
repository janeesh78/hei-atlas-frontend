'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { apiFetch } from '@/lib/apiBase';

export default function LandingPage() {
  const router = useRouter();
  const { user, isBooting } = useSession();

  // If a physician is already signed in, send them straight to the workspace.
  useEffect(() => {
    if (!isBooting && user) router.replace('/app');
  }, [isBooting, user, router]);

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5] flex flex-col safe-x">
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="w-full px-6 md:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0B2447] text-white flex items-center justify-center font-bold text-[13px]">
            HA
          </div>
          <span className="font-semibold text-[16px] text-[#0B2447] tracking-tight">Hei Atlas</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-4 py-2 rounded-button text-[14px] font-medium text-[#0B2447] hover:bg-black/5 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/login?mode=signup"
            className="px-4 py-2 rounded-button text-[14px] font-medium bg-[#0B2447] text-white hover:bg-[#0B2447]/90 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </header>

      {/* ── Hero — spec: centered column, clamp typography, 500px globe ── */}
      <main className="flex-1 w-full mx-auto px-4 py-8 flex flex-col items-center justify-center text-center">
        <h1
          className="font-extrabold tracking-[-0.02em] leading-[1.1] mt-8 mb-4"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: '#0B2447' }}
        >
          Hei Atlas
        </h1>
        <p className="text-[1.25rem] leading-[1.6] text-muted max-w-[580px] mb-12">
          Voice-first ambient documentation and clinical decision support for oncology.
        </p>
        <div
          className="w-full max-w-[500px] flex items-center justify-center"
          style={{ filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.06))' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/globe.png"
            alt="Hei Atlas — connected globe"
            className="w-full h-auto max-h-[45vh] object-contain select-none"
            draggable={false}
          />
        </div>
      </main>

      {/* ── Company + Contact ────────────────────────────────────── */}
      <section className="w-full max-w-2xl mx-auto px-6 py-12 flex flex-col sm:flex-row sm:items-start sm:justify-center gap-6 sm:gap-10">
        <Company />
        <ContactForm />
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="w-full border-t border-rule/60 py-6">
        <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-3 text-[13px] text-muted">
          <span>© 2026 Hei Atlas.</span>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-ink transition-colors">Terms of Use</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function Company() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink transition-colors mb-3"
      >
        Company
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {open && (
        <p className="text-[14px] text-ink leading-relaxed">
          Hei Atlas builds ambient clinical intelligence for oncology. Our voice-first workspace
          listens during a patient encounter, drafts a structured note in the physician&apos;s
          preferred format, grades toxicities against CTCAE v5, computes CMS 2021/2023 outpatient
          E/M coding, matches ClinicalTrials.gov, and cites NCCN/ESMO/ASCO guidelines — all in real
          time. Notes remain the physician&apos;s to review, edit, and sign.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ContactForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState('MD');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const res = await apiFetch(`/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, credentials, message, email: email || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || 'Send failed.');
      setStatus('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch (e2: unknown) {
      setStatus('error');
      setError(e2 instanceof Error ? e2.message : 'Send failed.');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink transition-colors mb-3"
      >
        Contact
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {!open ? null : status === 'sent' ? (
        <div className="p-4 rounded-button bg-emerald-50 border border-emerald-200 text-emerald-900 text-[14px]">
          Thanks — we&apos;ll be in touch shortly.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="ds-label">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ds-input mt-1"
                placeholder="Dr. Alex Chen"
                required
              />
            </div>
            <div className="w-32">
              <label className="ds-label">Credentials *</label>
              <select
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                className="ds-input mt-1"
              >
                {['MD','DO','PA-C','NP','MBBS','MD, PhD','DNP','RN','Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="ds-label">Email (optional — so we can reply)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ds-input mt-1"
              placeholder="you@clinic.org"
            />
          </div>
          <div>
            <label className="ds-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="ds-input mt-1 h-28 resize-none"
              placeholder="How can we help?"
              required
            />
          </div>
          {error && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending' || !name || !message}
            className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </div>
  );
}
