// CTCAE (Common Terminology Criteria for Adverse Events) toxicity grading engine.
// Version-aware: the active schema is selected from SCHEMAS by version key so
// future CTCAE revisions can be added without touching call sites.

export const CTCAE_VERSION = 'v5.0';

export type CtcaeGrade = 1 | 2 | 3 | 4 | 5;

export interface ToxicityFinding {
  /** Canonical CTCAE term, e.g. "Peripheral sensory neuropathy". */
  toxicity: string;
  /** Free-text severity quote pulled from the note. */
  severityText: string;
  /** CTCAE grade. */
  grade: CtcaeGrade;
  /** Versioned management suggestions keyed off toxicity + grade. */
  management: string[];
  /** CTCAE schema version used for this finding. */
  ctcaeVersion: string;
  /** True when only counseled/anticipated — displays as "Expected", not a grade. */
  expected?: boolean;
}

interface GradeRule {
  grade: CtcaeGrade;
  /** Keyword/phrase patterns. Any match → this grade. Higher grades evaluated first. */
  patterns: RegExp[];
}

interface ToxicityDef {
  /** Canonical CTCAE term. */
  canonical: string;
  /** Patterns that pull this toxicity out of free-text. */
  detectors: RegExp[];
  /** Default grade if no severity match — usually 1. */
  defaultGrade: CtcaeGrade;
  /** Severity-keyed grade rules, evaluated highest grade first. */
  rules: GradeRule[];
  /** Per-grade management suggestions. */
  management: Partial<Record<CtcaeGrade, string[]>>;
}

interface CtcaeSchema {
  version: string;
  toxicities: ToxicityDef[];
}

// ---------------------------------------------------------------------------
// CTCAE v5.0 schema (subset most relevant to oncology practice)
// ---------------------------------------------------------------------------
const SCHEMA_V5: CtcaeSchema = {
  version: 'v5.0',
  toxicities: [
    // ---------------- Neurologic ----------------
    {
      canonical: 'Peripheral sensory neuropathy',
      detectors: [
        /\bperipheral\s+(?:sensory\s+)?neuropathy\b/i,
        /\bneuropathy\b/i,
        /\bnumbness\b/i,
        /\btingling\b/i,
        /\bparesthesia[s]?\b/i,
      ],
      defaultGrade: 1,
      rules: [
        {
          grade: 4,
          patterns: [/life[- ]threatening/i, /\bdisabling\b/i],
        },
        {
          grade: 3,
          patterns: [
            /severe/i,
            /limiting\s+self[- ]?care\s+adl/i,
            /unable\s+to\s+(?:walk|dress|button)/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /moderate/i,
            /limiting\s+(?:instrumental\s+)?adl/i,
            /affecting\s+(?:buttons|writing|fine\s+motor)/i,
            /interfering\s+with\s+function/i,
          ],
        },
        { grade: 1, patterns: [/mild/i, /asymptomatic/i, /minimal/i] },
      ],
      management: {
        1: ['Continue treatment', 'Monitor at next cycle'],
        2: [
          'Consider dose reduction',
          'Document baseline neuro exam',
          'Monitor progression closely',
        ],
        3: [
          'Hold offending agent',
          'Consider duloxetine for symptomatic relief',
          'Neurology referral if persistent',
        ],
        4: ['Discontinue offending agent', 'Urgent neurology consultation'],
      },
    },

    // ---------------- GI ----------------
    {
      canonical: 'Nausea',
      detectors: [/\bnausea\b/i, /\bnauseous\b/i, /\bqueasy\b/i],
      defaultGrade: 1,
      rules: [
        { grade: 4, patterns: [/life[- ]threatening/i] },
        {
          grade: 3,
          patterns: [
            /iv\s+(?:fluids|hydration)/i,
            /hospitaliz/i,
            /\btpn\b/i,
            /tube\s+feed/i,
            /inadequate\s+oral\s+(?:intake|caloric)/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /oral\s+intake\s+decreased/i,
            /poor\s+(?:po|oral)\s+intake/i,
            /weight\s+loss/i,
            /dehydration/i,
          ],
        },
        { grade: 1, patterns: [/mild/i, /loss\s+of\s+appetite/i] },
      ],
      management: {
        1: ['Ondansetron PRN'],
        2: ['Scheduled antiemetics (5-HT3 + dexamethasone)', 'Hydration plan'],
        3: ['IV fluids', 'NK-1 antagonist (aprepitant)', 'Consider admission'],
        4: ['Hospital admission', 'Aggressive antiemetic regimen'],
      },
    },
    {
      canonical: 'Vomiting',
      detectors: [/\bvomit/i, /\bemesis\b/i, /\bthrew\s+up\b/i],
      defaultGrade: 1,
      rules: [
        { grade: 4, patterns: [/life[- ]threatening/i] },
        {
          grade: 3,
          patterns: [
            /≥\s*6\s+episodes/i,
            />\s*5\s+episodes/i,
            /iv\s+fluids/i,
            /hospitaliz/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /3\s*[-–]\s*5\s+episodes/i,
            /outpatient\s+iv\s+hydration/i,
          ],
        },
        { grade: 1, patterns: [/1\s*[-–]\s*2\s+episodes/i, /mild/i] },
      ],
      management: {
        1: ['Ondansetron PRN'],
        2: ['Scheduled antiemetics', 'Outpatient hydration'],
        3: ['IV fluids', 'Admission consideration'],
        4: ['Hospital admission'],
      },
    },
    {
      canonical: 'Diarrhea',
      detectors: [/\bdiarrhea\b/i, /\bloose\s+stool/i, /\bwatery\s+stool/i],
      defaultGrade: 1,
      rules: [
        { grade: 4, patterns: [/life[- ]threatening/i, /hemodynamic\s+collapse/i] },
        {
          grade: 3,
          patterns: [
            /≥\s*7\s+stool/i,
            />\s*6\s+stool/i,
            /hospitaliz/i,
            /iv\s+fluids/i,
            /incontinen/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /4\s*[-–]\s*6\s+stool/i,
            /moderate/i,
            /limiting\s+adl/i,
          ],
        },
        {
          grade: 1,
          patterns: [
            /<\s*4\s+stool/i,
            /1\s*[-–]\s*3\s+stool/i,
            /mild/i,
            /increase\s+over\s+baseline/i,
          ],
        },
      ],
      management: {
        1: ['Loperamide PRN', 'Hydration education'],
        2: ['Scheduled loperamide', 'Stool studies if persistent'],
        3: ['IV fluids', 'Hold therapy', 'C. difficile testing', 'Admission'],
        4: ['Hospital admission', 'Discontinue offending agent'],
      },
    },
    {
      canonical: 'Mucositis (oral)',
      detectors: [
        /\bmucositis\b/i,
        /\bstomatitis\b/i,
        /\bmouth\s+sores?\b/i,
        /\boral\s+ulcer/i,
      ],
      defaultGrade: 1,
      rules: [
        { grade: 4, patterns: [/life[- ]threatening/i] },
        {
          grade: 3,
          patterns: [
            /unable\s+to\s+(?:eat|drink)/i,
            /tube\s+feed/i,
            /tpn/i,
            /severe/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /moderate/i,
            /modified\s+diet/i,
            /soft\s+diet/i,
          ],
        },
        {
          grade: 1,
          patterns: [/mild/i, /asymptomatic/i, /erythema/i],
        },
      ],
      management: {
        1: ['Saline/baking soda mouthwash'],
        2: ['Magic mouthwash', 'Topical anesthetic', 'Soft diet'],
        3: ['Hold therapy', 'Pain control', 'Nutrition consult'],
        4: ['Admission for IV nutrition'],
      },
    },

    // ---------------- Constitutional ----------------
    {
      canonical: 'Fatigue',
      detectors: [/\bfatigue\b/i, /\btired\b/i, /\bexhausted\b/i, /\basthenia\b/i],
      defaultGrade: 1,
      rules: [
        {
          grade: 3,
          patterns: [
            /severe/i,
            /limiting\s+self[- ]?care\s+adl/i,
            /bedbound/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /moderate/i,
            /limiting\s+(?:instrumental\s+)?adl/i,
            /not\s+relieved\s+by\s+rest/i,
          ],
        },
        {
          grade: 1,
          patterns: [/mild/i, /relieved\s+by\s+rest/i],
        },
      ],
      management: {
        1: ['Sleep hygiene', 'Light activity'],
        2: ['Energy conservation strategies', 'Rule out anemia/hypothyroid'],
        3: ['Workup for reversible causes', 'Consider psychostimulant'],
      },
    },

    // ---------------- Hematologic ----------------
    {
      canonical: 'Neutropenia',
      detectors: [
        /\bneutropenia\b/i,
        /\blow\s+(?:neutrophil|anc)\b/i,
        /\bgranulocytopenia\b/i,
      ],
      defaultGrade: 2,
      rules: [
        {
          grade: 4,
          patterns: [
            /anc\s*(?:<|less\s+than)\s*500/i,
            /<\s*0\.5/i,
            /life[- ]threatening/i,
          ],
        },
        {
          grade: 3,
          patterns: [
            /febrile\s+neutropenia/i,
            /\banc\s*(?:<|less\s+than)\s*1[,.]?000/i,
            /\banc\s*500\s*[-–]\s*1[,.]?000/i,
          ],
        },
        {
          grade: 2,
          patterns: [/\banc\s*1[,.]?000\s*[-–]\s*1[,.]?500/i],
        },
        {
          grade: 1,
          patterns: [/\banc\s*1[,.]?500\s*[-–]\s*<?\s*lln/i, /mild/i],
        },
      ],
      management: {
        1: ['Recheck CBC at next cycle'],
        2: ['CBC weekly', 'Monitor for fever/infection'],
        3: [
          'Hold therapy until ANC recovery',
          'Consider G-CSF (filgrastim/pegfilgrastim)',
          'Patient education on neutropenic precautions',
        ],
        4: [
          'Hospital admission',
          'Broad-spectrum IV antibiotics if febrile',
          'G-CSF support',
        ],
      },
    },
    {
      canonical: 'Thrombocytopenia',
      detectors: [/\bthrombocytopenia\b/i, /\blow\s+platelet/i],
      defaultGrade: 2,
      rules: [
        {
          grade: 4,
          patterns: [/<\s*25/i, /life[- ]threatening/i, /spontaneous\s+bleeding/i],
        },
        { grade: 3, patterns: [/25\s*[-–]\s*50/i, /platelet\s*<\s*50/i] },
        { grade: 2, patterns: [/50\s*[-–]\s*75/i] },
        { grade: 1, patterns: [/75\s*[-–]\s*<?\s*lln/i, /mild/i] },
      ],
      management: {
        1: ['Recheck CBC at next cycle'],
        2: ['Monitor CBC', 'Avoid NSAIDs and antiplatelets'],
        3: ['Hold therapy', 'Bleeding precautions', 'Consider platelet transfusion if symptomatic'],
        4: ['Platelet transfusion', 'Admission'],
      },
    },
    {
      canonical: 'Anemia',
      detectors: [/\banemia\b/i, /\blow\s+(?:hgb|hemoglobin|hb)\b/i],
      defaultGrade: 1,
      rules: [
        {
          grade: 4,
          patterns: [/life[- ]threatening/i, /urgent\s+transfusion/i],
        },
        {
          grade: 3,
          patterns: [/hgb\s*<\s*8/i, /transfusion\s+indicated/i, /symptomatic\s+anemia/i],
        },
        { grade: 2, patterns: [/hgb\s*8\s*[-–]\s*10/i] },
        { grade: 1, patterns: [/hgb\s*10\s*[-–]\s*<?\s*lln/i, /mild/i] },
      ],
      management: {
        1: ['Iron studies if persistent'],
        2: ['Workup: iron, B12, folate, retic count'],
        3: ['Transfusion (typically PRBC for symptomatic)', 'Hold cytotoxic agent if appropriate'],
        4: ['Urgent transfusion', 'Admission'],
      },
    },

    // ---------------- Skin ----------------
    {
      canonical: 'Rash (maculopapular)',
      detectors: [/\brash\b/i, /\bmaculopapular\b/i, /\bdermatitis\b/i],
      defaultGrade: 1,
      rules: [
        {
          grade: 4,
          patterns: [/life[- ]threatening/i, /\bsjs\b/i, /\bten\b/i, /steven/i],
        },
        {
          grade: 3,
          patterns: [
            /covering\s*>\s*30/i,
            /severe/i,
            /associated\s+with\s+(?:fever|systemic)/i,
            /limiting\s+self[- ]?care\s+adl/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /covering\s*1[0-9]\s*[-–]\s*30/i,
            /moderate/i,
            /pruritus/i,
            /limiting\s+(?:instrumental\s+)?adl/i,
          ],
        },
        {
          grade: 1,
          patterns: [/covering\s*<\s*10/i, /mild/i, /asymptomatic/i],
        },
      ],
      management: {
        1: ['Topical emollient', 'Mild topical steroid if pruritic'],
        2: ['Topical corticosteroid', 'Oral antihistamine'],
        3: ['Hold therapy', 'Oral steroids', 'Dermatology consult'],
        4: ['Hospital admission', 'Permanent discontinuation'],
      },
    },
    {
      canonical: 'Palmar-plantar erythrodysesthesia (hand-foot syndrome)',
      detectors: [
        /\bhand[- ]foot\s+syndrome\b/i,
        /\bhfs\b/i,
        /\bppe\b/i,
        /\bpalmar[- ]plantar\b/i,
      ],
      defaultGrade: 1,
      rules: [
        {
          grade: 3,
          patterns: [
            /severe/i,
            /skin\s+changes\s+with\s+pain/i,
            /limiting\s+self[- ]?care\s+adl/i,
            /blister/i,
            /ulcerat/i,
          ],
        },
        {
          grade: 2,
          patterns: [
            /pain.*limiting/i,
            /moderate/i,
            /limiting\s+(?:instrumental\s+)?adl/i,
          ],
        },
        {
          grade: 1,
          patterns: [/mild/i, /numbness|tingling/i, /erythema|swelling/i],
        },
      ],
      management: {
        1: ['Topical urea cream', 'Avoid friction/heat'],
        2: ['Dose reduction consideration', 'Topical steroid'],
        3: ['Hold therapy until resolution to G1', 'Pain control'],
      },
    },

    // ---------------- Liver / metabolic (common in modern oncology) ----------------
    {
      canonical: 'AST/ALT elevation',
      detectors: [
        /\b(?:ast|alt|transaminase|transaminitis)\b/i,
        /\bhepatitis\b/i,
        /\blft\s*elevation/i,
      ],
      defaultGrade: 1,
      rules: [
        { grade: 4, patterns: [/>\s*20\s*x\s*uln/i, /life[- ]threatening/i] },
        { grade: 3, patterns: [/5\s*[-–]\s*20\s*x\s*uln/i] },
        { grade: 2, patterns: [/3\s*[-–]\s*5\s*x\s*uln/i] },
        { grade: 1, patterns: [/>\s*uln/i, /mild/i] },
      ],
      management: {
        1: ['Recheck LFTs in 1–2 weeks'],
        2: ['Hold offending agent', 'Repeat LFTs weekly'],
        3: ['Hold therapy', 'Steroids if immune-mediated', 'Hepatology consult'],
        4: ['Permanent discontinuation', 'Hepatology / hospitalization'],
      },
    },
  ],
};

// Versioned registry — add future schemas here, keyed by version string.
const SCHEMAS: Record<string, CtcaeSchema> = {
  'v5.0': SCHEMA_V5,
};

function getSchema(version: string = CTCAE_VERSION): CtcaeSchema {
  return SCHEMAS[version] || SCHEMA_V5;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractedToxicity {
  toxicity: string;
  severityText: string;
  /** True when the toxicity was only mentioned as counseling/anticipated
   *  ("counseled on … mucositis") — an expected AE, not a present finding. */
  expected?: boolean;
}

// Phrases that mean the term is explicitly denied/absent — the symptom is
// documented as NOT present, full stop. These are excluded from output
// entirely (see extractToxicities): a denial is not a lesser-confidence
// finding, it's the opposite of one, and must never surface with a grade.
const NEGATION_CONTEXT = [
  /\bno\s+(?:evidence\s+of\s+)?/i,
  /\bno\s+current\s+/i,
  /\bno\s+recent\s+/i,
  /\bno\s+ongoing\s+/i,
  /\bdenies\b/i,
  /\bdenied\b/i, // "Diarrhea denied" — term-then-negator order, not just "denies X"
  /\bwithout\s+/i,
  /\bnegative\s+for/i,
  /\brule\s+out/i,
  /\bnone\b/i, // "Nausea: None." / "Vomiting - none this cycle"
];

// Phrases that indicate the term is being discussed as a *potential* AE during
// counseling/education, OR a *historical/resolved* finding pulled forward
// from a previous encounter — neither should count as an active documented
// toxicity. Matches inside any of these contexts are surfaced as `expected`
// (see extractToxicities) rather than graded as a current finding.
const COUNSELING_CONTEXT = [
  // ── Counseling / risk discussion (anticipatory) ──
  /counsel(?:ed|ing)\s+(?:on|about|regarding)/i,
  /discussed\s+(?:risk|risks|potential|possible)/i,
  /educated\s+(?:on|about|regarding)/i,
  /informed\s+(?:about|of)/i,
  /reviewed\s+(?:potential|possible|risk)/i,
  /watch(?:ed)?\s+for/i,
  /monitor(?:ed|ing)?\s+for/i,
  /risk\s+of/i,
  /possible\s+(?:adverse|side)/i,
  /potential\s+(?:adverse|side|toxicit)/i,
  /immune[- ]related\s+adverse\s+events?/i,
  /\birae[s]?\b/i,
  /side\s+effects?\s+(?:include|may|can)/i,
  /may\s+(?:cause|develop|experience)/i,
  /can\s+(?:cause|develop)/i,

  // ── Prophylaxis / prevention (medication named for what it prevents,
  //    not for what the patient currently has — e.g. "continue ondansetron
  //    for nausea/vomiting prophylaxis"). Requires the "for ... prophylaxis"
  //    / "to prevent" construction rather than a bare "prophylactic" nearby,
  //    so a genuine breakthrough finding ("Grade 2 nausea despite
  //    prophylactic ondansetron") isn't swallowed by the word's mere presence.
  /\bfor\s+(?:[\w/-]+\s+){0,3}prophylaxis\b/i,
  /\bfor\s+(?:[\w/-]+\s+){0,3}prevention\b/i,
  /\bto\s+prevent\b/i,
  /\bprevention\s+of\b/i,

  // ── Historical / resolved / pulled-forward references ──
  /\bhistory\s+of\s+/i,
  /\bremote\s+history\s+of\s+/i,
  /\bpast\s+(?:history\s+of\s+|episode\s+of\s+)/i,
  /\bpreviously\s+(?:had|experienced|developed|reported)/i,
  /\bprior\s+(?:episode\s+of\s+|history\s+of\s+|cycle|admission)/i,
  /\bprevious\s+(?:episode\s+of\s+|cycle|visit|encounter|admission)/i,
  /\bat\s+(?:prior|last|previous)\s+(?:visit|encounter|appointment)/i,
  /\bsince\s+(?:resolved|improved|stopped)/i,
  /\bresolved\b/i,
  /\bnow\s+resolved/i,
  /\bno\s+longer\s+(?:has|experiencing|reports)/i,
  /\bs\/p\s+/i,                          // "s/p episode of vomiting last week"
  /\bstatus\s+post\s+/i,
  /\btolerating\s+(?:treatment|chemotherapy|therapy)\s+well/i,
  /\bcompleted\s+treatment\s+(?:with|for)/i,
  /\bat\s+(?:cycle\s+\d+|c\d+)\s+/i,    // "vomiting at cycle 2" — historical
  /\bduring\s+(?:cycle\s+\d+|c\d+|prior\s+chemotherapy|previous\s+chemo)/i,
  /\bimproved\s+since/i,
  /\bnow\s+(?:without|denies|free\s+of)/i,
  /\bfrom\s+(?:prior|previous|last)/i,
];

/**
 * Backward context: up to 200 chars, restricted to the current sentence (the
 * relevant qualifier — "previously had", "at last visit", "no nausea, " —
 * usually sits early in the sentence) so a prior sentence's qualifier can't
 * leak in. Comma-tolerant on purpose: a shared leading negator needs to reach
 * every item in a list ("no nausea, vomiting, or diarrhea" negates all three).
 */
function clauseBack(text: string, matchIdx: number): string {
  const back = text.slice(Math.max(0, matchIdx - 200), matchIdx);
  const sentenceStart = Math.max(
    back.lastIndexOf('. '),
    back.lastIndexOf('? '),
    back.lastIndexOf('! '),
    back.lastIndexOf('\n'),
    -1
  );
  return sentenceStart >= 0 ? back.slice(sentenceStart + 1) : back;
}

/**
 * Forward context, up to 120 chars. `tight` stops at the next comma/semicolon
 * as well as sentence-enders — used for negation, where a comma usually opens
 * a *new* clause about a different symptom ("mild nausea, no vomiting" must
 * not let that "no" negate "nausea"). Without `tight`, only sentence-enders
 * bound it — used for counseling-context, which needs comma-joined qualifiers
 * like "X, now resolved" / "X, since improved" to stay in view.
 */
function clauseForward(text: string, matchEnd: number, tight: boolean): string {
  const forwardRaw = text.slice(matchEnd, matchEnd + 120);
  const boundary = forwardRaw.search(tight ? /[.,;?!\n]/ : /[.?!\n]/);
  return boundary === -1 ? forwardRaw : forwardRaw.slice(0, boundary + 1);
}

/** True when the match is explicitly denied/absent ("no nausea", "denies vomiting"). */
function isNegated(text: string, matchIdx: number, matchLen: number): boolean {
  const haystack = clauseBack(text, matchIdx) + ' ' + clauseForward(text, matchIdx + matchLen, true);
  return NEGATION_CONTEXT.some((p) => p.test(haystack));
}

/**
 * True when the match falls inside a counseling/risk-discussion clause or a
 * historical/resolved reference rather than active documentation.
 */
function inCounselingContext(text: string, matchIdx: number, matchLen: number): boolean {
  const haystack = clauseBack(text, matchIdx) + ' ' + clauseForward(text, matchIdx + matchLen, false);
  return COUNSELING_CONTEXT.some((p) => p.test(haystack));
}

/**
 * Pull toxicity terms out of free-text. Returns one entry per detected toxicity
 * with a window of surrounding words as the severityText (used for grading).
 *
 * Explicitly denied mentions ("no nausea", "denies vomiting") are dropped
 * entirely — never graded, never surfaced as expected. Matches that fall
 * inside counseling/education or historical/resolved contexts (e.g.,
 * "counseled on immune-related adverse events including hepatitis") are
 * surfaced as `expected` rather than graded as a current finding. Together
 * these avoid hallucinating toxicities the patient does not actually have.
 */
export function extractToxicities(
  text: string,
  version: string = CTCAE_VERSION
): ExtractedToxicity[] {
  if (!text || !text.trim()) return [];
  const schema = getSchema(version);
  const seen = new Set<string>();
  const out: ExtractedToxicity[] = [];

  for (const def of schema.toxicities) {
    // First counseled-context match, kept as a fallback: if the toxicity is
    // ONLY ever mentioned as counseling ("counseled on … mucositis"), it's an
    // EXPECTED adverse event — report it flagged, don't grade it as present.
    let counseled: { idx: number; len: number } | null = null;
    for (const detector of def.detectors) {
      // Walk every match; accept only the first one outside a counseling context
      const re = new RegExp(detector.source, detector.flags.includes('g') ? detector.flags : detector.flags + 'g');
      let m: RegExpExecArray | null;
      let accepted = false;
      while ((m = re.exec(text)) !== null) {
        if (isNegated(text, m.index, m[0].length)) continue;
        if (inCounselingContext(text, m.index, m[0].length)) {
          if (!counseled) counseled = { idx: m.index, len: m[0].length };
          continue;
        }
        if (seen.has(def.canonical)) {
          accepted = true;
          break;
        }
        seen.add(def.canonical);
        const windowStart = Math.max(0, m.index - 200);
        const windowEnd = Math.min(text.length, m.index + m[0].length + 200);
        const severityText = text.slice(windowStart, windowEnd).replace(/\s+/g, ' ').trim();
        out.push({ toxicity: def.canonical, severityText });
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (!seen.has(def.canonical) && counseled) {
      seen.add(def.canonical);
      const windowStart = Math.max(0, counseled.idx - 200);
      const windowEnd = Math.min(text.length, counseled.idx + counseled.len + 200);
      const severityText = text.slice(windowStart, windowEnd).replace(/\s+/g, ' ').trim();
      out.push({ toxicity: def.canonical, severityText, expected: true });
    }
  }
  return out;
}

/**
 * Grade a single toxicity. Highest-matching grade wins; falls back to defaultGrade.
 */
export function gradeToxicity(
  toxicity: string,
  severityText: string,
  version: string = CTCAE_VERSION
): ToxicityFinding | null {
  const schema = getSchema(version);
  const def =
    schema.toxicities.find((t) => t.canonical.toLowerCase() === toxicity.toLowerCase()) ||
    schema.toxicities.find((t) => t.detectors.some((d) => d.test(toxicity)));
  if (!def) return null;

  let grade: CtcaeGrade = def.defaultGrade;
  // Evaluate rules from highest grade down
  const sortedRules = [...def.rules].sort((a, b) => b.grade - a.grade);
  for (const rule of sortedRules) {
    if (rule.patterns.some((p) => p.test(severityText))) {
      grade = rule.grade;
      break;
    }
  }

  return {
    toxicity: def.canonical,
    severityText,
    grade,
    management: def.management[grade] || [],
    ctcaeVersion: schema.version,
  };
}

/** Convenience: extract + grade in one pass. */
export function extractAndGradeToxicities(
  text: string,
  version: string = CTCAE_VERSION
): ToxicityFinding[] {
  return extractToxicities(text, version)
    .map((e) => {
      const f = gradeToxicity(e.toxicity, e.severityText, version);
      if (f && e.expected) f.expected = true;
      return f;
    })
    .filter((f): f is ToxicityFinding => f !== null);
}
