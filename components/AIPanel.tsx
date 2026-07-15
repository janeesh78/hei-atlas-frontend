'use client';

import { useMemo, useState, KeyboardEvent } from 'react';
import type { OncologyNote } from '@/lib/api';
import type { CodingResult } from '@/lib/coding';
import type { ToxicityFinding } from '@/lib/ctcae';

interface AIPanelProps {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSelectPrompt: (prompt: string) => void;
  onMicrophoneClick?: () => void;
  isListening?: boolean;

  /** Used to compute Visit Insights + Billing display. */
  note?: OncologyNote | null;
  coding?: CodingResult | null;
  toxicities?: ToxicityFinding[];
  transcript?: string;

  /** Optional slot rendered after Visit Insights (e.g. location widget). */
  extraWidgets?: React.ReactNode;
}

// ────────────────────────────────────────────────────────────────────────────
// Static catalogs
// ────────────────────────────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  icon: React.ReactNode;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Recommend additional history questions', icon: <Icon name="message" /> },
  { label: 'Review today’s assessment', icon: <Icon name="check-circle" /> },
  { label: 'Check contraindications', icon: <Icon name="shield-alert" /> },
  { label: 'Suggest evidence-based treatment', icon: <Icon name="sparkle" /> },
  { label: 'Review NCCN recommendations', icon: <Icon name="book" /> },
  { label: 'Review ASCO/ESMO guidance', icon: <Icon name="book-stack" /> },
  { label: 'Explain pathology findings', icon: <Icon name="microscope" /> },
  { label: 'Generate patient education', icon: <Icon name="file-text" /> },
  { label: 'Suggest billing improvements', icon: <Icon name="dollar" /> },
  { label: 'Identify missing documentation', icon: <Icon name="alert-triangle" /> },
];

interface ExternalLink {
  name: string;
  subtitle?: string;
  url: string;
  /** 2-3 char monogram for the logo tile. */
  monogram: string;
  /** Tile background color (subtle). */
  color: string;
}

const MOLECULAR_LABS: ExternalLink[] = [
  { name: 'Tempus',             subtitle: 'Physician Portal', url: 'https://hub.securetempus.com/',             monogram: 'TX', color: 'bg-violet-50 text-violet-700' },
  { name: 'Guardant Health',    subtitle: 'Physician Portal', url: 'https://portal.guardanthealth.com',         monogram: 'GH', color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Foundation Medicine',subtitle: 'Physician Portal', url: 'https://ordering.foundationmedicine.com',   monogram: 'FM', color: 'bg-cyan-50 text-cyan-700' },
  { name: 'Natera',             subtitle: 'Physician Portal', url: 'https://my.natera.com',                     monogram: 'NT', color: 'bg-rose-50 text-rose-700' },
  { name: 'NeoGenomics',        subtitle: 'Physician Portal', url: 'https://neogenomics.com',                   monogram: 'NG', color: 'bg-amber-50 text-amber-700' },
  { name: 'Caris Life Sciences',subtitle: 'Physician Portal', url: 'https://miportal.carisls.com',              monogram: 'CL', color: 'bg-indigo-50 text-indigo-700' },
];

const CLINICAL_RESOURCES: ExternalLink[] = [
  { name: 'NCCN Guidelines',   url: 'https://www.nccn.org/guidelines/category_1', monogram: 'NC', color: 'bg-blue-50 text-blue-700' },
  { name: 'ASCO Guidelines',   url: 'https://www.asco.org/practice-patients/guidelines', monogram: 'AS', color: 'bg-green-50 text-green-700' },
  { name: 'ESMO Guidelines',   url: 'https://www.esmo.org/guidelines', monogram: 'ES', color: 'bg-purple-50 text-purple-700' },
  { name: 'OpenEvidence',      url: 'https://www.openevidence.com', monogram: 'OE', color: 'bg-teal-50 text-teal-700' },
  { name: 'PubMed',            url: 'https://pubmed.ncbi.nlm.nih.gov', monogram: 'PM', color: 'bg-sky-50 text-sky-700' },
  { name: 'ClinicalTrials.gov',url: 'https://clinicaltrials.gov', monogram: 'CT', color: 'bg-rose-50 text-rose-700' },
  { name: 'UpToDate',          url: 'https://www.uptodate.com', monogram: 'UT', color: 'bg-orange-50 text-orange-700' },
];

// ────────────────────────────────────────────────────────────────────────────

export default function AIPanel({
  value,
  disabled,
  onChange,
  onSubmit,
  onSelectPrompt,
  onMicrophoneClick,
  isListening,
  note,
  coding,
  toxicities,
  transcript,
  extraWidgets,
}: AIPanelProps) {
  const [focused, setFocused] = useState(false);
  const [billingOpen, setBillingOpen] = useState(true);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim() && !disabled) onSubmit();
  };

  // ── Visit Insights — derive a clinical-quality checklist from current state ──
  const visitInsights = useMemo(() => {
    const corpus = [
      note?.chief_complaint, note?.history_present_illness, note?.assessment,
      note?.plan, note?.follow_up, transcript,
    ].filter(Boolean).join(' ').toLowerCase();
    return [
      { label: 'Diagnoses documented',          met: !!note?.cancer_type?.trim() || /\b(?:diagnosis|cancer|tumor|lymphoma|leukemia|myeloma|mgus|mds)\b/.test(corpus) },
      { label: 'Biomarkers reviewed',           met: /\b(?:egfr|alk|kras|her2|brca|pd[- ]?l1|msi|tmb|ros1|braf|ngs)\b/i.test(corpus) },
      { label: 'ECOG documented',               met: !!note?.ecog_status?.trim() || /\becog\s*(?:performance\s+status\s*)?[0-4]\b/i.test(corpus) },
      { label: 'Treatment intent identified',   met: /\b(?:curative|palliative|adjuvant|neoadjuvant|consolidation|maintenance)\b/i.test(corpus) },
      { label: 'Toxicities assessed',           met: !!(toxicities && toxicities.length >= 0 && (toxicities.length > 0 || /toxicit|side\s+effect|tolerat/i.test(corpus))) },
      { label: 'Follow-up interval documented', met: !!note?.follow_up?.trim() && note.follow_up.length > 10 },
      { label: 'Clinical trial eligibility reviewed', met: /\b(?:clinical\s+trial|nct\d|eligibility|enrollment)\b/i.test(corpus) },
    ];
  }, [note, toxicities, transcript]);

  return (
    <aside className="h-full w-full bg-surface border-l border-rule flex flex-col">
      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-rule flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-button bg-accent-subtle text-accent flex items-center justify-center">
            <Icon name="sparkle" size={16} />
          </div>
          <span className="text-[18px] font-semibold text-ink tracking-tight">Ask Atlas</span>
        </div>
        {note && (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-accent-subtle text-accent rounded-full">
            ACTIVE
          </span>
        )}
      </div>

      {/* ── Scrolling body ── */}
      <div className="flex-1 overflow-y-auto ds-scroll px-6 py-6 space-y-8">
        {/* AI search pill */}
        <div className="relative">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Icon
              name="sparkle"
              size={18}
              className={`transition-colors duration-150 ${focused ? 'text-accent' : 'text-muted'}`}
            />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask a clinical question..."
            className="w-full h-[54px] pl-14 pr-14 text-[15px] bg-surface border border-rule rounded-pill text-ink placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-200"
            disabled={disabled}
          />
          {onMicrophoneClick && (
            <button
              type="button"
              onClick={onMicrophoneClick}
              className={`absolute inset-y-0 right-2 my-auto w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-150 ${
                isListening
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-muted hover:text-accent hover:bg-accent-subtle'
              }`}
              aria-label={isListening ? 'Stop ATLAS listening' : 'Start ATLAS listening'}
            >
              <Icon name="microphone" size={18} />
            </button>
          )}
        </div>

        {/* ── AI Quick Actions ── */}
        <Section title="AI Quick Actions">
          <ul className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <li key={a.label}>
                <button
                  type="button"
                  onClick={() => onSelectPrompt(a.label)}
                  disabled={disabled}
                  className="group w-full h-[54px] px-4 flex items-center gap-3 bg-surface border border-rule rounded-card hover:border-accent/40 hover:bg-canvas transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="flex-shrink-0 text-muted group-hover:text-accent transition-colors duration-200">
                    {a.icon}
                  </span>
                  <span className="text-[15px] font-medium text-ink text-left leading-snug">
                    {a.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Molecular Diagnostics ── */}
        <Section title="Molecular Diagnostics">
          <ul className="space-y-2">
            {MOLECULAR_LABS.map((lab) => (
              <li key={lab.name}>
                <LinkCard link={lab} />
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Clinical Resources ── */}
        <Section title="Clinical Resources">
          <ul className="space-y-2">
            {CLINICAL_RESOURCES.map((r) => (
              <li key={r.name}>
                <LinkCard link={r} />
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Billing & Coding (collapsible) ── */}
        <section>
          <button
            type="button"
            onClick={() => setBillingOpen((v) => !v)}
            className="w-full flex items-center justify-between mb-3"
            aria-expanded={billingOpen}
          >
            <h3 className="text-[18px] font-semibold text-ink">Billing &amp; Coding</h3>
            <Icon
              name="chevron"
              size={18}
              className={`text-muted transition-transform duration-200 ${
                billingOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {billingOpen && (
            <BillingPanel coding={coding} />
          )}
        </section>

        {/* ── Visit Insights ── */}
        <Section title="Visit Insights">
          <ul className="space-y-1.5">
            {visitInsights.map((v) => (
              <li
                key={v.label}
                className="flex items-center gap-2.5 px-3 py-2 bg-surface border border-rule rounded-card"
              >
                {v.met ? (
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Icon name="check" size={12} />
                  </span>
                ) : (
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-canvas text-muted/60 flex items-center justify-center">
                    <Icon name="dot" size={6} />
                  </span>
                )}
                <span className={`text-[14px] ${v.met ? 'text-ink' : 'text-muted'}`}>
                  {v.label}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Slot for external widgets (e.g. trial-location helper) */}
        {extraWidgets}
      </div>

      {/* ── Sticky footer ── */}
      <div className="border-t border-rule px-4 py-3 flex items-center gap-2 bg-surface">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 px-3 py-2 text-[14px] font-medium text-muted hover:text-ink hover:bg-canvas rounded-button transition-colors duration-150"
        >
          <Icon name="settings" size={18} />
          Settings
        </button>
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[18px] font-semibold text-ink mb-3">{title}</h3>
      {children}
    </section>
  );
}

function LinkCard({ link }: { link: ExternalLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full px-3.5 py-3 bg-surface border border-rule rounded-card hover:border-accent/40 hover:shadow-soft transition-all duration-200"
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex-shrink-0 w-9 h-9 rounded-button flex items-center justify-center text-[11px] font-bold ${link.color}`}
        >
          {link.monogram}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-ink truncate">{link.name}</div>
          {link.subtitle && (
            <div className="text-[12px] text-muted truncate">{link.subtitle}</div>
          )}
        </div>
        <Icon
          name="external"
          size={16}
          className="flex-shrink-0 text-muted/60 group-hover:text-accent transition-colors duration-200"
        />
      </div>
    </a>
  );
}

function BillingPanel({ coding }: { coding?: CodingResult | null }) {
  if (!coding) {
    return (
      <div className="px-4 py-5 bg-canvas border border-rule rounded-card text-[14px] text-muted text-center">
        Generate a note to see CPT, ICD-10, and E/M recommendations.
      </div>
    );
  }

  const em = coding.recommended_em_code;
  const icds = coding.icd10_codes || [];
  const cpts = (coding.cpt_codes || []).filter((c) => c.code !== em);
  const gaps = coding.documentation_gaps?.length || 0;
  const completeness =
    gaps === 0 ? 'Complete' : gaps <= 2 ? 'Minor gaps' : 'Needs work';
  const completenessColor =
    gaps === 0
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : gaps <= 2
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';

  return (
    <div className="space-y-2">
      {/* E/M code card */}
      <div className="px-4 py-3 bg-surface border border-rule rounded-card flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">
            E/M
          </div>
          <div className="text-[20px] font-bold font-mono text-ink mt-0.5">{em}</div>
        </div>
        <span className="px-2 py-0.5 text-[11px] font-semibold rounded border bg-accent-subtle text-accent border-accent/30">
          {coding.mdm_level} MDM
        </span>
      </div>

      {/* ICD-10 codes */}
      {icds.length > 0 && (
        <div className="px-4 py-3 bg-surface border border-rule rounded-card">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
            ICD-10
          </div>
          <ul className="space-y-1.5">
            {icds.slice(0, 4).map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <span className="font-mono font-semibold text-ink whitespace-nowrap">
                  {c.code}
                </span>
                <span className="text-muted leading-snug">{c.description}</span>
                {c.primary && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded whitespace-nowrap">
                    1°
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional CPT (G2211, infusion, etc.) */}
      {cpts.length > 0 && (
        <div className="px-4 py-3 bg-surface border border-rule rounded-card">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
            CPT / HCPCS
          </div>
          <ul className="space-y-1.5">
            {cpts.slice(0, 4).map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <span className="font-mono font-semibold text-ink whitespace-nowrap">
                  {c.code}
                </span>
                <span className="text-muted leading-snug">{c.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentation completeness */}
      <div className={`px-4 py-3 border rounded-card ${completenessColor}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
              Documentation
            </div>
            <div className="text-[15px] font-semibold mt-0.5">{completeness}</div>
          </div>
          {gaps > 0 && (
            <span className="text-[13px] font-medium">{gaps} gap{gaps === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Icon library (Heroicons-style outlines, inlined to avoid an extra dep)
// ────────────────────────────────────────────────────────────────────────────

interface IconProps {
  name:
    | 'sparkle' | 'microphone' | 'external' | 'chevron' | 'check' | 'dot'
    | 'settings' | 'message' | 'check-circle' | 'shield-alert' | 'book'
    | 'book-stack' | 'microscope' | 'file-text' | 'dollar' | 'alert-triangle';
  size?: number;
  className?: string;
}

function Icon({ name, size = 20, className }: IconProps) {
  const s = size;
  const common = {
    width: s,
    height: s,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className,
  };
  switch (name) {
    case 'sparkle':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L23 12l-6.857 2.143L14 21l-2.143-6.857L5 12l6.857-2.143L14 3z" />
        </svg>
      );
    case 'microphone':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 11-14 0M12 19v3m-4 0h8M12 4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3z" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7m0-7L10 14m-7 7h7" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common} strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'dot':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="6" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'message':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'check-circle':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'shield-alert':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'book-stack':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20v-5M4 19.5v-15A2.5 2.5 0 016.5 2H20v15M4 4.5h16" />
        </svg>
      );
    case 'microscope':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18h12M9 18v-3a3 3 0 116 0v3M9 12V6a3 3 0 016 0v6M9 22h6" />
        </svg>
      );
    case 'file-text':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'dollar':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'alert-triangle':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
      );
  }
}
