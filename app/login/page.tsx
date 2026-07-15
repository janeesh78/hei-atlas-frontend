'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signup, login, verify } from '@/lib/auth';
import { useSession } from '@/lib/session';

type Mode = 'signup' | 'login';
type Step = 'entry' | 'otp';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useSession();
  const initialMode: Mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>('entry');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signup fields
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState('MD');
  const [npi, setNpi] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      let res;
      if (mode === 'signup') {
        if (!/^\d{10}$/.test(npi)) throw new Error('NPI must be 10 digits.');
        res = await signup({ email, npi, name, credentials, phone: phone || undefined });
      } else {
        res = await login(email);
      }
      // DEV_MODE: prefill the code field so the developer can just click Verify.
      if (res.dev_code) {
        setCode(res.dev_code);
        setNotice(`Dev mode: code ${res.dev_code} auto-filled below.`);
      } else {
        setNotice(mode === 'signup' ? 'Check your email for the 6-digit code.' : 'If an account exists, a code has been sent.');
      }
      setStep('otp');
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await verify({ email, code, purpose: mode });
      setUser(res.user);
      router.push('/app');
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-canvas px-4 safe-x">
      <div className="w-full max-w-md ds-card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-[15px]">HA</div>
          <div>
            <h1 className="text-[18px] font-semibold text-ink leading-tight">Hei Atlas</h1>
            <p className="text-[13px] text-muted">Sign in to continue</p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="flex p-1 bg-canvas rounded-button mb-6">
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setStep('entry'); setError(null); setNotice(null); }}
              className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-button transition-colors ${
                mode === m ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {step === 'entry' ? (
          <form onSubmit={submitEntry} className="space-y-3">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="ds-label">Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="ds-input mt-1" placeholder="e.g., Alex Chen" required autoFocus />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="ds-label">Credentials</label>
                    <select value={credentials} onChange={(e) => setCredentials(e.target.value)} className="ds-input mt-1">
                      {['MD','DO','PA-C','NP','MBBS','MD, PhD','DNP','RN'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="ds-label">NPI (10 digits)</label>
                    <input value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g,'').slice(0,10))} className="ds-input mt-1 font-mono" placeholder="1234567890" required inputMode="numeric" />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="ds-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ds-input mt-1" placeholder="you@clinic.org" required autoFocus={mode==='login'} />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="ds-label">Phone (optional)</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="ds-input mt-1" placeholder="+1 555 123 4567" />
              </div>
            )}
            {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">{error}</p>}
            {notice && <p className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-button px-3 py-2">{notice}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? 'Sending code…' : mode === 'signup' ? 'Send verification code' : 'Send sign-in code'}
            </button>
            <p className="text-[12px] text-muted text-center mt-3">
              A one-time 6-digit code will be sent to your email.
            </p>
            <p className="text-[11px] text-muted text-center mt-4">
              By continuing you agree to our{' '}
              <a href="/terms" className="text-accent hover:underline">Terms</a>
              {' '}and{' '}
              <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
            </p>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="space-y-3">
            <p className="text-[13px] text-muted">
              A 6-digit code was sent to <span className="font-medium text-ink">{email}</span>. Enter it below to continue.
            </p>
            <div>
              <label className="ds-label">Verification code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                className="ds-input mt-1 font-mono text-center tracking-[0.4em] text-[18px]"
                placeholder="••••••"
                inputMode="numeric"
                required autoFocus
              />
            </div>
            {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? 'Verifying…' : 'Verify and continue'}
            </button>
            <button type="button" onClick={() => { setStep('entry'); setCode(''); setError(null); }} className="btn-ghost w-full text-[13px]">
              ← Change email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
