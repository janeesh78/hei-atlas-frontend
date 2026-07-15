'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import {
  getOverview, getUsers, getFeedback, getActivity, getEncounters,
  type AdminOverview, type AdminUserRow, type AdminFeedbackRow, type AdminActivity, type AdminEncounters,
} from '@/lib/admin';

type Tab = 'users' | 'feedback' | 'activity' | 'encounters' | 'formats' | 'map';
type Module = 'ambient' | 'integrator' | 'consensus';
const REFRESH_MS = 30_000;

const MODULE_META: Record<Module, { label: string; live: boolean }> = {
  ambient: { label: 'Ambient Listening', live: true },
  integrator: { label: 'Record Integrator', live: false },
  consensus: { label: 'Consensus', live: false },
};

export default function AdminPage() {
  const router = useRouter();
  const { user, isBooting } = useSession();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedbackRow[]>([]);
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [encounters, setEncounters] = useState<AdminEncounters | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [activeModule, setActiveModule] = useState<Module>('ambient');
  const [err, setErr] = useState<string | null>(null);

  // Send anonymous users to the landing page; the backend also rejects with 403.
  useEffect(() => {
    if (!isBooting && !user) router.replace('/');
  }, [isBooting, user, router]);

  // Load everything (also probes admin authorization via /admin/overview).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      try {
        const [ov, us, fb, ac, en] = await Promise.all([getOverview(), getUsers(), getFeedback(200), getActivity(14), getEncounters(14)]);
        if (!alive) return;
        setOverview(ov); setUsers(us); setFeedback(fb); setActivity(ac); setEncounters(en);
        setAuthorized(true); setErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : 'load failed';
        if (msg.toLowerCase().includes('admin')) { setAuthorized(false); return; }
        setErr(msg);
      }
    };
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [user]);

  if (isBooting || authorized === null) return <Shell><p className="text-muted text-sm p-6">Loading…</p></Shell>;
  if (authorized === false) {
    return (
      <Shell>
        <div className="p-6">
          <h1 className="text-[18px] font-semibold text-ink">Not authorized</h1>
          <p className="text-[13px] text-muted mt-1">This dashboard is admin-only.</p>
          <Link href="/app" className="btn-primary mt-4 inline-block">Back to workspace</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between border-b border-rule bg-surface">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-[13px]">HA</div>
          <div>
            <h1 className="text-[16px] font-semibold text-ink leading-tight">Admin dashboard</h1>
            {overview && <p className="text-[12px] text-muted">Updated {new Date(overview.as_of).toLocaleTimeString()}</p>}
          </div>
        </div>
        <Link href="/app" className="text-[13px] text-muted hover:text-ink">← Workspace</Link>
      </header>

      {err && <p className="mx-6 mt-4 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">{err}</p>}

      {/* Module switcher — mirrors the three-globe workspace hub */}
      <div className="px-6 md:px-10 pt-6">
        <div className="inline-flex p-1 bg-canvas rounded-button">
          {(Object.keys(MODULE_META) as Module[]).map((m) => (
            <button
              key={m}
              onClick={() => setActiveModule(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-button transition-colors ${
                activeModule === m ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
              }`}
            >
              {MODULE_META[m].label}
              {!MODULE_META[m].live && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="coming soon" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeModule !== 'ambient' ? (
        <main className="px-6 md:px-10 py-8">
          <ModulePlaceholder module={activeModule} />
        </main>
      ) : (
        <>
          {/* Overview cards */}
          {overview && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 md:px-10 py-6">
              <Card label="Total users" value={overview.total_users.toString()} />
              <Card label="Encounters today" value={overview.encounters_today.toString()} />
              <Card label="Active users (7d)" value={overview.active_users_7d.toString()} />
              <Card
                label="Feedback (7d)"
                value={`${overview.feedback_last_7d.up} 👍 · ${overview.feedback_last_7d.down} 👎`}
              />
            </section>
          )}

          {/* Tabs */}
          <div className="px-6 md:px-10">
            <div className="inline-flex p-1 bg-canvas rounded-button">
              {(['users', 'encounters', 'formats', 'activity', 'feedback', 'map'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-button transition-colors capitalize ${
                    tab === t ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <main className="px-6 md:px-10 py-6">
            {tab === 'users' && <UsersTable rows={users} />}
            {tab === 'encounters' && encounters && <EncountersView data={encounters} />}
            {tab === 'formats' && encounters && <FormatsView data={encounters} />}
            {tab === 'activity' && activity && <ActivityView data={activity} />}
            {tab === 'feedback' && <FeedbackList rows={feedback} />}
            {tab === 'map' && <LocationMap rows={users} />}
          </main>
        </>
      )}
    </Shell>
  );
}

// ─── Coming-soon module placeholders ────────────────────────────────────────
const PLACEHOLDER_METRICS: Record<Exclude<Module, 'ambient'>, { blurb: string; metrics: string[] }> = {
  integrator: {
    blurb: 'Reconciles prior records, imaging, pathology, and labs from disparate EHRs into a single longitudinal view. Metrics will populate when the module ships.',
    metrics: ['Records reconciled', 'Connected sources', 'Charts merged', 'Avg reconciliation time'],
  },
  consensus: {
    blurb: 'Multi-source guideline consensus for complex or unusual presentations powered by AI with real human input. Metrics will populate when the module ships.',
    metrics: ['Queries answered', 'Guidelines cited', 'Evidence conflicts', 'Response time'],
  },
};

function ModulePlaceholder({ module: m }: { module: Exclude<Module, 'ambient'> }) {
  const meta = MODULE_META[m];
  const info = PLACEHOLDER_METRICS[m];
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="relative w-[150px] h-[150px] flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globe.png" alt="" className="w-full h-full object-contain select-none" draggable={false} />
      </div>
      <h2 className="mt-4 text-[18px] font-semibold tracking-tight" style={{ color: '#0B2447' }}>
        ATLAS {meta.label}
      </h2>
      <span className="mt-2 inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
        Coming Soon
      </span>
      <p className="mt-3 text-[13px] text-muted max-w-md leading-relaxed">{info.blurb}</p>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl">
        {info.metrics.map((label) => (
          <div key={label} className="ds-card p-4 opacity-60">
            <p className="text-[12px] text-muted uppercase tracking-wider">{label}</p>
            <p className="text-[22px] font-semibold text-muted mt-1">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-canvas text-ink safe-x">{children}</div>;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-card p-4">
      <p className="text-[12px] text-muted uppercase tracking-wider">{label}</p>
      <p className="text-[22px] font-semibold text-ink mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted">No users yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">{rows.length} users</p>
        <button
          type="button"
          onClick={() => downloadUsersCsv(rows)}
          className="text-[12px] font-medium px-3 py-1.5 border border-rule rounded-button text-ink hover:bg-canvas transition-colors"
        >
          Download CSV
        </button>
      </div>
      <div className="ds-card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-canvas text-muted">
            <tr className="text-left">
              <Th>Name</Th><Th>Cred</Th><Th>NPI</Th><Th>Email</Th><Th>Phone</Th>
              <Th right>Enc / day</Th><Th right>Minutes / day</Th><Th right>👍 / 👎</Th>
              <Th>Last login</Th><Th>Location</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-rule hover:bg-canvas">
                <Td>
                  {u.name}
                  {!u.npi_verified && <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">unverified</span>}
                </Td>
                <Td className="text-muted">{u.credentials}</Td>
                <Td className="font-mono text-[12px] text-muted">{u.npi}</Td>
                <Td>{u.email}</Td>
                <Td className="text-muted">{u.phone || '—'}</Td>
                <Td right className="tabular-nums">{u.encounters_today}</Td>
                <Td right className="tabular-nums">{u.active_minutes_today}</Td>
                <Td right className="tabular-nums">{u.feedback.up} / {u.feedback.down}</Td>
                <Td className="text-muted">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</Td>
                <Td className="text-muted">
                  {u.location
                    ? ([u.location.city, u.location.region, u.location.country].filter(Boolean).join(', ')
                        || `${u.location.latitude.toFixed(2)}, ${u.location.longitude.toFixed(2)}`)
                    : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function downloadUsersCsv(rows: AdminUserRow[]) {
  const header = [
    'Name','Credentials','NPI','Email','Phone','NPI verified',
    'Signed up','Last login','Encounters today','Minutes today',
    'Thumbs up','Thumbs down','City','Region','Country','Latitude','Longitude',
  ];
  // Prevent CSV injection: prefix cells that begin with =, +, -, @, tab, or CR.
  const safe = (v: unknown): string => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.map(safe).join(',')];
  for (const u of rows) {
    const loc = u.location;
    lines.push([
      u.name, u.credentials, u.npi, u.email, u.phone || '', u.npi_verified ? 'yes' : 'no',
      u.created_at || '', u.last_login || '',
      u.encounters_today, u.active_minutes_today,
      u.feedback.up, u.feedback.down,
      loc?.city || '', loc?.region || '', loc?.country || '',
      loc?.latitude ?? '', loc?.longitude ?? '',
    ].map(safe).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hei-atlas-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FeedbackList({ rows }: { rows: AdminFeedbackRow[] }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted">No feedback yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((f) => (
        <div key={f.id} className="ds-card px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-semibold ${
                  f.rating === 'up' ? 'bg-emerald-600' : 'bg-red-600'
                }`}
                aria-label={f.rating}
              >
                {f.rating === 'up' ? '👍' : '👎'}
              </span>
              <span className="text-ink font-medium">{f.user_name}</span>
              <span className="text-muted">({f.user_credentials})</span>
              {f.output_format && <span className="text-muted">· {f.output_format}</span>}
            </div>
            <span className="text-muted">{f.created_at && new Date(f.created_at).toLocaleString()}</span>
          </div>
          {f.feedback_text && <p className="text-[13px] text-ink whitespace-pre-wrap">{f.feedback_text}</p>}
        </div>
      ))}
    </div>
  );
}

function ActivityView({ data }: { data: AdminActivity }) {
  const maxMinutes = useMemo(
    () => Math.max(1, ...data.per_day.map((d) => d.minutes)),
    [data.per_day],
  );
  const totalMinutes = data.per_day.reduce((sum, d) => sum + d.minutes, 0);
  const activeUsers = data.per_user.length;
  const totalNotes = data.per_user.reduce((sum, u) => sum + u.notes, 0);
  // Sort per-user by notes desc for the leaderboard, tie-break on minutes.
  const leaderboard = [...data.per_user].sort(
    (a, b) => (b.notes - a.notes) || (b.minutes - a.minutes),
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total minutes" value={totalMinutes.toLocaleString()} />
        <Card label="Active users" value={activeUsers.toString()} />
        <Card label="Notes generated" value={totalNotes.toLocaleString()} />
        <Card label="Median notes / user" value={data.median_notes_per_active_user.toString()} />
      </div>

      <div className="ds-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-ink">Minutes per day — last {data.window_days} days</p>
          <p className="text-[12px] text-muted">{totalMinutes.toLocaleString()} total minutes</p>
        </div>
        <div className="flex items-end gap-1 h-32">
          {data.per_day.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.minutes} min, ${d.active_users} users`}>
              <div
                className="w-full bg-accent/70 hover:bg-accent transition-colors rounded-sm"
                style={{ height: `${(d.minutes / maxMinutes) * 100}%`, minHeight: d.minutes > 0 ? '2px' : '0' }}
              />
              <span className="text-[10px] text-muted">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-card overflow-x-auto">
        <div className="px-3 py-2 border-b border-rule text-[13px] font-semibold text-ink">
          Notes-per-user leaderboard
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-canvas text-muted">
            <tr className="text-left">
              <Th>User</Th><Th>Email</Th><Th right>Notes</Th><Th right>Minutes</Th><Th right>Active days</Th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((u) => (
              <tr key={u.user_id} className="border-t border-rule">
                <Td>{u.name}</Td>
                <Td className="text-muted">{u.email}</Td>
                <Td right className="tabular-nums font-semibold">{u.notes}</Td>
                <Td right className="tabular-nums">{u.minutes}</Td>
                <Td right className="tabular-nums">{u.active_days}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${right ? 'text-right' : ''}`}>{children}</th>;
}
function Td({ children, right, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-3 py-2 ${right ? 'text-right' : ''} ${className}`}>{children}</td>;
}

// ─── Encounters bar chart ───────────────────────────────────────────────────
function EncountersView({ data }: { data: AdminEncounters }) {
  const max = Math.max(1, ...data.per_day.map((d) => d.count));
  return (
    <div className="ds-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-ink">Encounters — last {data.window_days} days</p>
        <p className="text-[12px] text-muted">{data.total.toLocaleString()} total</p>
      </div>
      {data.per_day.length === 0 ? (
        <p className="text-[13px] text-muted">No encounters in the window yet.</p>
      ) : (
        <div className="flex items-end gap-1 h-40">
          {data.per_day.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count} notes`}>
              <span className="text-[10px] text-muted tabular-nums">{d.count || ''}</span>
              <div
                className="w-full bg-accent/70 hover:bg-accent transition-colors rounded-sm"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '2px' : '0' }}
              />
              <span className="text-[10px] text-muted">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Format popularity (horizontal bars) ───────────────────────────────────
function FormatsView({ data }: { data: AdminEncounters }) {
  if (data.per_format.length === 0) return <p className="text-[13px] text-muted">No encounters in the window yet.</p>;
  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">Output-format popularity</p>
        <p className="text-[12px] text-muted">Window: {data.window_days} days · {data.total} total</p>
      </div>
      <ul className="space-y-2">
        {data.per_format.map((f) => (
          <li key={f.format} className="flex items-center gap-3">
            <span className="w-40 truncate text-[13px] text-ink">{f.format}</span>
            <div className="flex-1 h-2.5 bg-canvas rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${f.pct}%` }} />
            </div>
            <span className="w-16 text-right text-[12px] text-muted tabular-nums">{f.count} · {f.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Location map (equirectangular; dots per user with tooltip) ────────────
function LocationMap({ rows }: { rows: AdminUserRow[] }) {
  const pins = rows
    .filter((u) => u.location && Number.isFinite(u.location.latitude) && Number.isFinite(u.location.longitude))
    .map((u) => {
      const loc = u.location!;
      const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || 'Unknown location';
      return {
        key: u.id,
        x: ((loc.longitude + 180) / 360) * 100,
        y: ((90 - loc.latitude) / 180) * 100,
        label: `${u.name} (${u.credentials}) — ${place}`,
        place,
      };
    });

  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">Physician locations</p>
        <p className="text-[12px] text-muted">
          {pins.length} of {rows.length} users pinned · dots = last-known coordinates
        </p>
      </div>
      <div className="relative w-full aspect-[2/1] bg-canvas rounded-card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/world.jpg"
          alt="World map"
          className="absolute inset-0 w-full h-full object-cover opacity-70 select-none"
          draggable={false}
        />
        {/* Subtle grid overlay for lat/lng orientation */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-full w-px bg-black/10" />
          <div className="absolute top-1/2 left-0 w-full h-px bg-black/10" />
        </div>
        {pins.map((p) => (
          <span
            key={p.key}
            title={p.label}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-white shadow-md cursor-help"
          />
        ))}
        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted bg-black/5">
            No location grants yet.
          </div>
        )}
      </div>
      {pins.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="font-semibold text-ink">Cities:</span>
          {Object.entries(
            pins.reduce<Record<string, number>>((acc, p) => {
              acc[p.place] = (acc[p.place] || 0) + 1;
              return acc;
            }, {}),
          )
            .sort((a, b) => b[1] - a[1])
            .map(([place, n]) => (
              <span key={place}>
                {place}
                {n > 1 && <span className="text-ink font-medium"> ×{n}</span>}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
