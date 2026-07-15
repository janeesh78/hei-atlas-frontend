'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session';

type ModuleDef = {
  key: string;
  title: string;
  blurb: string;
  href: string | null; // null → coming soon
};

const MODULES: ModuleDef[] = [
  {
    key: 'ambient',
    title: 'Ambient Listening',
    blurb: 'Voice-first encounter capture, note generation, CTCAE grading, E/M coding, guideline citations, and trial matching.',
    href: '/app/ambient',
  },
  {
    key: 'integrator',
    title: 'ATLAS Clinical Record Integrator',
    blurb: 'Reconcile prior records, imaging, pathology, and labs from disparate EHRs into a single longitudinal view.',
    href: null,
  },
  {
    key: 'consensus',
    title: 'ATLAS Consensus',
    blurb: 'Multi-source guideline consensus for complex or unusual presentations powered by AI with real human input.',
    href: null,
  },
];

export default function WorkspaceHub() {
  const router = useRouter();
  const { user, isBooting, logout } = useSession();

  useEffect(() => {
    if (!isBooting && !user) router.replace('/');
  }, [isBooting, user, router]);

  if (isBooting || !user) return null;

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5] safe-x flex flex-col">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between border-b border-rule/50">
        <Link href="/app" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-[13px]">HA</div>
          <span className="font-semibold text-[16px] text-ink tracking-tight">Hei Atlas</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted hidden sm:inline">
            {user.name} · {user.credentials}
          </span>
          <button
            type="button"
            onClick={() => { void logout(); }}
            className="text-[13px] font-medium text-muted hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-14">
        <div className="text-center">
          <h1 className="text-[24px] md:text-[36px] font-semibold tracking-tight" style={{ color: '#0B2447' }}>
            Choose a workspace
          </h1>
          <p className="mt-2 text-[14px] md:text-[15px] text-muted">
            Three ATLAS modules. Pick where you want to work today.
          </p>
        </div>

        <div className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {MODULES.map((m) => (
            <ModuleCard key={m.key} module={m} />
          ))}
        </div>
      </main>

      <footer className="w-full border-t border-rule/60 py-5">
        <div className="max-w-6xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-3 text-[13px] text-muted">
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

function ModuleCard({ module: m }: { module: ModuleDef }) {
  const disabled = m.href === null;

  const card = (
    <div className={`relative flex flex-col items-center text-center transition-transform ${disabled ? '' : 'hover:scale-[1.02] cursor-pointer'}`}>
      <div
        className="relative animate-float w-[200px] h-[200px] md:w-[240px] md:h-[240px] flex items-center justify-center"
        style={{ filter: 'drop-shadow(0 12px 30px rgba(0,0,0,0.06))' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/globe.png"
          alt=""
          className="w-full h-full object-contain select-none"
          draggable={false}
        />
      </div>

      <h2 className="mt-5 text-[18px] md:text-[20px] font-semibold tracking-tight" style={{ color: '#0B2447' }}>
        {m.title}
      </h2>
      <p className="mt-2 text-[13px] text-muted max-w-[260px] leading-relaxed">{m.blurb}</p>

      {disabled ? (
        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
          Coming Soon
        </span>
      ) : (
        <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
          Open workspace →
        </span>
      )}
    </div>
  );

  if (disabled) {
    return (
      <div
        role="button"
        aria-disabled="true"
        tabIndex={-1}
        className="cursor-not-allowed"
        onClick={(e) => e.preventDefault()}
      >
        {card}
      </div>
    );
  }
  return (
    <Link href={m.href!} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-card">
      {card}
    </Link>
  );
}
