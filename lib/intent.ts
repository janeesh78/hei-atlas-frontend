// Query classification + disease normalization for the Hei Atlas UI.
// Routes queries to the correct surface (trials vs notes vs guidelines) and
// expands oncology abbreviations so downstream search has a clean disease term.

export type Intent =
  | 'clinical_trial_search'
  | 'guideline_lookup'
  | 'note_generation'
  | 'general_query';

export interface Classification {
  intent: Intent;
  /** Human-readable normalized disease, e.g. "metastatic pancreatic ductal adenocarcinoma". */
  disease: string;
  /** Original query text. */
  query: string;
}

// ---------------------------------------------------------------------------
// Disease abbreviation map. Keys are lowercased, matched as whole words.
// Order matters: longer/more-specific keys are inserted first.
// ---------------------------------------------------------------------------
const ABBREVIATIONS: Array<[RegExp, string]> = [
  // Pancreatic
  [/\bm[\s-]?pdac\b/gi, 'metastatic pancreatic ductal adenocarcinoma'],
  [/\bpdac\b/gi, 'pancreatic ductal adenocarcinoma'],

  // Colorectal
  [/\bm[\s-]?crc\b/gi, 'metastatic colorectal cancer'],
  [/\bcrc\b/gi, 'colorectal cancer'],

  // Lung
  [/\bnsclc\b/gi, 'non-small cell lung cancer'],
  [/\bsclc\b/gi, 'small cell lung cancer'],

  // Breast
  [/\bm[\s-]?bc\b/gi, 'metastatic breast cancer'],
  [/\btnbc\b/gi, 'triple-negative breast cancer'],
  [/\bdcis\b/gi, 'ductal carcinoma in situ'],
  [/\blcis\b/gi, 'lobular carcinoma in situ'],

  // Genitourinary
  [/\bm[\s-]?crpc\b/gi, 'metastatic castration-resistant prostate cancer'],
  [/\bcrpc\b/gi, 'castration-resistant prostate cancer'],
  [/\bm[\s-]?rcc\b/gi, 'metastatic renal cell carcinoma'],
  [/\brcc\b/gi, 'renal cell carcinoma'],
  [/\bm[\s-]?uc\b/gi, 'metastatic urothelial carcinoma'],

  // Hematologic
  [/\bdlbcl\b/gi, 'diffuse large B-cell lymphoma'],
  [/\baml\b/gi, 'acute myeloid leukemia'],
  [/\ball\b/gi, 'acute lymphoblastic leukemia'],
  [/\bcll\b/gi, 'chronic lymphocytic leukemia'],
  [/\bcml\b/gi, 'chronic myeloid leukemia'],
  [/\bnhl\b/gi, "non-Hodgkin's lymphoma"],
  [/\bmds\b/gi, 'myelodysplastic syndrome'],
  [/\bmpn\b/gi, 'myeloproliferative neoplasm'],
  [/\bmgus\b/gi, 'monoclonal gammopathy of undetermined significance'],

  // GI
  [/\bgejc?\b/gi, 'gastroesophageal junction cancer'],
  [/\bhcc\b/gi, 'hepatocellular carcinoma'],
  [/\bicc\b/gi, 'intrahepatic cholangiocarcinoma'],
  [/\bgist\b/gi, 'gastrointestinal stromal tumor'],

  // GYN
  [/\bhgsoc\b/gi, 'high-grade serous ovarian carcinoma'],
  [/\bepoc\b/gi, 'epithelial ovarian cancer'],

  // Head & neck / other
  [/\bhnscc\b/gi, 'head and neck squamous cell carcinoma'],
  [/\bgbm\b/gi, 'glioblastoma multiforme'],
];

// Common cancer keywords (after expansion) used to extract a disease string
const CANCER_KEYWORDS = [
  'pancreatic',
  'lung',
  'breast',
  'colorectal',
  'colon',
  'rectal',
  'prostate',
  'renal',
  'urothelial',
  'bladder',
  'ovarian',
  'cervical',
  'endometrial',
  'leukemia',
  'lymphoma',
  'myeloma',
  'melanoma',
  'sarcoma',
  'glioblastoma',
  'glioma',
  'hepatocellular',
  'cholangiocarcinoma',
  'gastric',
  'esophageal',
  'gastroesophageal',
  'head and neck',
  'thyroid',
];

// ---------------------------------------------------------------------------
// Intent keyword sets
// ---------------------------------------------------------------------------
const TRIAL_KEYWORDS = [
  'clinical trial',
  'clinical trials',
  'trial',
  'trials',
  'near me',
  'nearby',
  'recruiting',
  'enroll',
  'enrollment',
  'study',
  'studies',
  'nct',
];

const GUIDELINE_KEYWORDS = [
  'guideline',
  'guidelines',
  'nccn',
  'esmo',
  'asco',
  'recommendation',
  'recommendations',
  'standard of care',
  'first-line',
  'second-line',
];

const NOTE_KEYWORDS = [
  'generate note',
  'generate a note',
  'consult note',
  'consultation note',
  'h&p',
  'history and physical',
  'follow-up note',
  'follow up note',
  'soap note',
  'progress note',
  'document',
  'dictate',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Expand oncology abbreviations in a free-text query. */
export function normalizeDisease(query: string): string {
  let out = query;
  for (const [pattern, expansion] of ABBREVIATIONS) {
    out = out.replace(pattern, expansion);
  }
  // Collapse whitespace
  return out.replace(/\s+/g, ' ').trim();
}

/** Extract the most likely disease string from a (normalized) query. */
function extractDisease(normalized: string): string {
  const lower = normalized.toLowerCase();
  // Find the cancer keyword and pull a phrase around it
  for (const kw of CANCER_KEYWORDS) {
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;
    // Pull up to ~6 words around the keyword (look for modifiers like "metastatic", "stage III", "BRCA-mutated")
    const before = normalized.slice(0, idx).split(/\s+/).slice(-3).join(' ');
    const afterStart = idx + kw.length;
    // include keyword + up to two words after (e.g. "lung cancer", "ductal adenocarcinoma")
    const afterTokens = normalized.slice(afterStart).split(/\s+/).filter(Boolean).slice(0, 3);
    const tail = afterTokens.join(' ');
    return [before, kw, tail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  // Fallback: return whole normalized string trimmed of trial-keyword scaffolding
  return normalized
    .replace(/\b(find|search|show|look\s+for|get|please|me|a|an|the|for|near|nearby|trial|trials|clinical)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maximum length (chars) for a query to be considered for trial / guideline
 * intent matching. Above this we treat the input as a dictated patient
 * encounter and route to note generation regardless of what keywords appear
 * inside the conversation.
 *
 * Empirically: typed user queries are <200 chars; ambient transcripts are
 * thousands of chars. There is no realistic scenario where a user types a
 * 200+ character trial search — even verbose typed queries cap out around
 * 120 chars ("find me clinical trials for metastatic pancreatic adenocarcinoma
 * BRCA2 positive near Lexington Kentucky").
 *
 * Previous attempts to use an imperative-phrase escape hatch ("find me",
 * "show me", "i need") backfired: those phrases inevitably appear in
 * conversational ambient transcripts and caused encounters to be misrouted.
 */
const SHORT_QUERY_CHARS = 200;

/** Classify a query into an intent and pull out the disease term. */
export function classifyQuery(query: string): Classification {
  const normalized = normalizeDisease(query);
  const lower = normalized.toLowerCase();

  // Long input → always treat as a dictated encounter. Trial/guideline/note
  // keyword routing applies only to typed user queries (≤ 200 chars).
  if (query.length > SHORT_QUERY_CHARS) {
    return {
      intent: 'note_generation',
      disease: extractDisease(normalized),
      query,
    };
  }

  const hasTrial = TRIAL_KEYWORDS.some((kw) => lower.includes(kw));
  const hasNote = NOTE_KEYWORDS.some((kw) => lower.includes(kw));
  const hasGuideline = GUIDELINE_KEYWORDS.some((kw) => lower.includes(kw));

  let intent: Intent;
  if (hasTrial) intent = 'clinical_trial_search';
  else if (hasNote) intent = 'note_generation';
  else if (hasGuideline) intent = 'guideline_lookup';
  else intent = 'general_query';

  return {
    intent,
    disease: extractDisease(normalized),
    query,
  };
}
