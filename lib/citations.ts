// Curated public guideline citation mapping by cancer type + stage.
// Used as a fallback when the backend RAG store has no indexed guideline docs.
// Sources are official NCCN/ESMO/ASCO landing pages and peer-reviewed guideline articles.

import type { Citation } from './api';

type StageBucket = 'early' | 'locally_advanced' | 'metastatic' | 'any';
type Resectability = 'resectable' | 'unresectable' | 'unknown';

interface GuidelineEntry {
  // Patterns to match against detected cancer_type / assessment / query text
  patterns: RegExp[];
  // Negative patterns — if any match, this entry is rejected
  exclude?: RegExp[];
  // Which stage buckets this entry applies to. Default: all.
  stages?: StageBucket[];
  // Resectability filter: only show this entry when resectability matches.
  // 'unknown' means the entry only shows when resectability cannot be determined.
  // Omit to show regardless of resectability.
  resectability?: Resectability[];
  citations: Citation[];
}

const ENTRIES: GuidelineEntry[] = [
  // ==================== NSCLC — STAGE I/II (early) ====================
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['early'],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Non-Small Cell Lung Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1450',
        section: 'Stage I–II: Surgery, Adjuvant Therapy',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Early and Locally Advanced NSCLC',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/lung-and-chest-tumours/early-and-locally-advanced-non-small-cell-lung-cancer-nsclc',
        section: 'Stage I–IIIA: Diagnosis, Treatment, Follow-up',
        year: 2023,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Adjuvant Systemic Therapy for Resected Stage I–IIIA NSCLC',
        url: 'https://ascopubs.org/doi/10.1200/JCO.21.02528',
        section: 'Adjuvant chemotherapy / osimertinib / atezolizumab',
        year: 2022,
      },
    ],
  },

  // ==================== NSCLC — STAGE III (shared, regardless of resectability) ====================
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['locally_advanced'],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Non-Small Cell Lung Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1450',
        section: 'Stage III (A/B/C): Multimodality therapy',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Early and Locally Advanced NSCLC',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/lung-and-chest-tumours/early-and-locally-advanced-non-small-cell-lung-cancer-nsclc',
        section: 'Stage III: Multimodality treatment',
        year: 2023,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Management of Stage III NSCLC',
        url: 'https://ascopubs.org/doi/10.1200/JCO.21.02528',
        section: 'Stage III — chemoradiation, surgery, immunotherapy',
        year: 2022,
      },
    ],
  },

  // ==================== NSCLC — STAGE III UNRESECTABLE (default: PACIFIC) ====================
  // Shown when unresectable Stage III is identified, EXCLUDING when EGFR-targeted
  // therapy is the focus (see EGFR-specific bucket below for LAURA).
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['locally_advanced'],
    resectability: ['unresectable', 'unknown'],
    citations: [
      {
        source: 'NEJM',
        title: 'PACIFIC Trial: Durvalumab after Chemoradiotherapy in Stage III NSCLC',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa1709937',
        section: 'Unresectable Stage III — consolidation durvalumab after concurrent CRT',
        year: 2017,
      },
    ],
  },

  // ==================== NSCLC — STAGE III UNRESECTABLE, EGFR+ (LAURA) ====================
  // Only shown when EGFR mutation OR osimertinib is explicitly mentioned. Excluded
  // when durvalumab is documented (because the patient is on the immunotherapy path).
  {
    patterns: [/\begfr\b/i, /\bosimertinib\b/i],
    exclude: [/\bdurvalumab\b/i, /pacific\s+regimen/i],
    stages: ['locally_advanced'],
    resectability: ['unresectable', 'unknown'],
    citations: [
      {
        source: 'NEJM',
        title: 'LAURA Trial: Osimertinib after CRT in EGFR-Mutated Stage III NSCLC',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2402614',
        section: 'Unresectable Stage III, EGFR-mutated — consolidation osimertinib',
        year: 2024,
      },
    ],
  },

  // ==================== NSCLC — STAGE III RESECTABLE ====================
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['locally_advanced'],
    resectability: ['resectable'],
    citations: [
      {
        source: 'NEJM',
        title: 'AEGEAN Trial: Perioperative Durvalumab for Resectable NSCLC',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2304875',
        section: 'Resectable Stage II–IIIB: neoadjuvant chemo-IO + adjuvant durvalumab',
        year: 2023,
      },
      {
        source: 'NEJM',
        title: 'CheckMate 816: Neoadjuvant Nivolumab + Chemotherapy in Resectable NSCLC',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2202170',
        section: 'Resectable Stage IB–IIIA: neoadjuvant nivolumab + platinum doublet',
        year: 2022,
      },
    ],
  },

  // ==================== NSCLC — STAGE IV (metastatic) ====================
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['metastatic'],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Non-Small Cell Lung Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1450',
        section: 'Stage IV / Metastatic: Systemic Therapy by Biomarker',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Metastatic NSCLC',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/lung-and-chest-tumours/metastatic-non-small-cell-lung-cancer',
        section: 'Diagnosis, Treatment, Follow-up',
        year: 2024,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Therapy for Stage IV NSCLC With Driver Alterations',
        url: 'https://ascopubs.org/doi/10.1200/JCO.23.00282',
        section: 'EGFR / ALK / ROS1 / BRAF / MET / RET / KRAS',
        year: 2023,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Therapy for Stage IV NSCLC Without Driver Alterations',
        url: 'https://ascopubs.org/doi/10.1200/JCO.22.02744',
        section: 'PD-L1-stratified immunotherapy / chemo-IO',
        year: 2023,
      },
    ],
  },

  // NSCLC — fallback if stage unknown
  {
    patterns: [/non[\s-]?small[\s-]?cell\s*lung/i, /\bnsclc\b/i],
    stages: ['any'],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Non-Small Cell Lung Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1450',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Lung & Chest Tumours',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/lung-and-chest-tumours',
        year: 2024,
      },
    ],
  },

  // ==================== SCLC (excluded from NSCLC matches) ====================
  {
    patterns: [/\bsclc\b/i, /small[\s-]?cell\s*lung/i],
    exclude: [/non[\s-]?small[\s-]?cell/i, /\bnsclc\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Small Cell Lung Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1462',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Small-Cell Lung Cancer',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/lung-and-chest-tumours/small-cell-lung-cancer',
        year: 2021,
      },
    ],
  },

  // ==================== Breast ====================
  {
    patterns: [/breast\s*cancer/i, /\bdcis\b/i, /her2\+?/i, /\btnbc\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Breast Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Early Breast Cancer',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/breast-cancer/early-breast-cancer',
        year: 2024,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Adjuvant Endocrine Therapy for Hormone Receptor-Positive Breast Cancer',
        url: 'https://ascopubs.org/doi/10.1200/JCO.21.02616',
        year: 2022,
      },
    ],
  },

  // ==================== Colorectal ====================
  {
    patterns: [/colon\s*cancer/i, /colorectal/i, /\bcrc\b/i, /rectal\s*cancer/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Colon Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1428',
        year: 2025,
      },
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Rectal Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1461',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Metastatic Colorectal Cancer',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/gastrointestinal-cancers/metastatic-colorectal-cancer',
        year: 2023,
      },
    ],
  },

  // ==================== Prostate ====================
  {
    patterns: [/prostate\s*cancer/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Prostate Cancer',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1459',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Prostate Cancer',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/genitourinary-cancers/prostate-cancer',
        year: 2024,
      },
      {
        source: 'ASCO',
        title: 'ASCO Guideline: Initial Management of Noncastrate Advanced Prostate Cancer',
        url: 'https://ascopubs.org/doi/10.1200/JCO.20.03256',
        year: 2021,
      },
    ],
  },

  // ==================== Pancreatic ====================
  {
    patterns: [/pancrea/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Pancreatic Adenocarcinoma',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1455',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Pancreatic Cancer',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/gastrointestinal-cancers/pancreatic-cancer',
        year: 2023,
      },
    ],
  },

  // ==================== Melanoma ====================
  {
    patterns: [/melanoma/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Melanoma: Cutaneous',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1492',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Cutaneous Melanoma',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/melanoma/cutaneous-melanoma',
        year: 2024,
      },
    ],
  },

  // ==================== Lymphomas ====================
  {
    patterns: [/lymphoma/i, /\bdlbcl\b/i, /\bhodgkin\b/i, /\bnhl\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: B-Cell Lymphomas',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Lymphomas',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies/lymphomas',
        year: 2024,
      },
    ],
  },

  // ==================== AML (Acute Myeloid Leukemia) ====================
  {
    patterns: [/acute\s+myeloid\s+leukemia/i, /\baml\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Acute Myeloid Leukemia',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1411',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Acute Myeloid Leukaemia in Adults',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies',
        year: 2020,
      },
    ],
  },

  // ==================== ALL (Acute Lymphoblastic Leukemia) ====================
  // Bare "all" abbreviation is intentionally NOT a pattern — too noisy in
  // dictated conversation. Spelled-out forms or prefixed variants only.
  {
    patterns: [/acute\s+lymphoblastic\s+leukemia/i, /\bb[- ]?all\b/i, /\bt[- ]?all\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Acute Lymphoblastic Leukemia',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1410',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Acute Lymphoblastic Leukaemia',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies/acute-lymphoblastic-leukaemia',
        year: 2024,
      },
    ],
  },

  // ==================== CLL ====================
  {
    patterns: [/chronic\s+lymphocytic\s+leukemia/i, /\bcll\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Chronic Lymphocytic Leukemia / Small Lymphocytic Lymphoma',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1478',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Chronic Lymphocytic Leukaemia',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies/chronic-lymphocytic-leukaemia',
        year: 2024,
      },
    ],
  },

  // ==================== CML ====================
  {
    patterns: [/chronic\s+myeloid\s+leukemia/i, /\bcml\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Chronic Myeloid Leukemia',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1427',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Chronic Myeloid Leukaemia',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies/chronic-myeloid-leukaemia',
        year: 2017,
      },
    ],
  },

  // ==================== MDS / MDS-MPN ====================
  // Important: many "leukemia"-adjacent encounters are MDS surveillance —
  // they must route here, not to AML/ALL.
  {
    patterns: [
      /myelodysplastic\s+syndrome/i,
      /\bmds\b/i,
      /\bmds[- /]mpn\b/i,
      /myelodysplastic[\/ ]myeloproliferative/i,
    ],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Myelodysplastic Syndromes',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1446',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Myelodysplastic Neoplasms',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies',
        year: 2023,
      },
    ],
  },

  // ==================== Multiple Myeloma ====================
  {
    patterns: [/multiple\s+myeloma/i, /plasma\s+cell\s+myeloma/i, /\bmgus\b/i, /smoldering\s+myeloma/i, /\bsmm\b/i],
    citations: [
      {
        source: 'NCCN',
        title: 'NCCN Clinical Practice Guidelines: Multiple Myeloma',
        url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1445',
        year: 2025,
      },
      {
        source: 'ESMO',
        title: 'ESMO Clinical Practice Guidelines: Multiple Myeloma',
        url: 'https://www.esmo.org/guidelines/guidelines-by-topic/haematological-malignancies/multiple-myeloma',
        year: 2024,
      },
    ],
  },
];

const GENERIC: Citation[] = [
  {
    source: 'NCCN',
    title: 'NCCN Clinical Practice Guidelines in Oncology',
    url: 'https://www.nccn.org/guidelines/category_1',
    section: 'Browse by tumor type',
    year: 2025,
  },
  {
    source: 'ESMO',
    title: 'ESMO Clinical Practice Guidelines',
    url: 'https://www.esmo.org/guidelines',
    year: 2024,
  },
  {
    source: 'ASCO',
    title: 'ASCO Clinical Practice Guidelines',
    url: 'https://www.asco.org/practice-patients/guidelines',
    year: 2024,
  },
];

/** Detect resectability from free text. */
function detectResectability(text: string): Resectability {
  const s = text.toLowerCase();
  // "unresectable" must be checked before "resectable" since the former contains the latter
  if (/\bun[\s-]?resectable\b/.test(s) || /\binoperable\b/.test(s) || /\bnot\s+(?:surgically\s+)?resectable\b/.test(s)) {
    return 'unresectable';
  }
  if (/\bresectable\b/.test(s) || /\boperable\b/.test(s) || /\bsurgical\s+candidate\b/.test(s)) {
    return 'resectable';
  }
  return 'unknown';
}

/** Detect TNM/AJCC stage bucket from free text. */
function detectStage(text: string): StageBucket {
  const s = text.toLowerCase();
  // Metastatic: stage IV / 4 / metastatic / m1
  if (/\bstage\s*(iv|4)\b/.test(s) || /\bmetastatic\b/.test(s) || /\bm1\b/.test(s)) {
    return 'metastatic';
  }
  // Locally advanced: stage III / 3 (with or without A/B/C)
  if (/\bstage\s*(iii|3)\s*[abc]?\b/.test(s) || /\blocally\s*advanced\b/.test(s)) {
    return 'locally_advanced';
  }
  // Early: stage I / II / 1 / 2
  if (/\bstage\s*(i{1,2}|1|2)\s*[abc]?\b/.test(s) || /\bearly[\s-]?stage\b/.test(s)) {
    return 'early';
  }
  return 'any';
}

/** Match curated guideline citations against a cancer type / free-text. Stage-aware. */
/**
 * Phrases that disqualify a candidate match because the diagnosis is being
 * negated, listed as absent, or referenced historically.
 */
const CITATION_NEGATION_BEFORE = [
  /:\s*$/,
  /\b(?:no|not|never|denies|denied|without|negative\s+for|absent)\s+$/i,
  /\bhistory\s+of\s+$/i,
  /\bremote\s+history\s+of\s+$/i,
  /\bpast\s+history\s+of\s+$/i,
  /\bs\/p\s+$/i,
  /\brule\s+out\s+$/i,
  /\br\/o\s+$/i,
  /\bworkup\s+(?:for|to\s+rule\s+out)\s+$/i,
  /\bprogression\s+to\s+$/i,    // "MDS without progression to AML"
  /\bevolution\s+to\s+$/i,
];
const CITATION_NEGATION_AFTER = [
  /^\s*[:=]\s*(?:none|n\/a|not\s+applicable|nil|no)\b/i,
];

function patternMatchesAffirmatively(haystack: string, p: RegExp): boolean {
  const re = new RegExp(
    p.source,
    (p.flags.includes('g') ? p.flags : p.flags + 'g') +
      (p.flags.includes('i') ? '' : 'i'),
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    const before = haystack.slice(Math.max(0, m.index - 50), m.index);
    const after = haystack.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (CITATION_NEGATION_BEFORE.some((np) => np.test(before))) continue;
    if (CITATION_NEGATION_AFTER.some((np) => np.test(after))) continue;
    return true;
  }
  return false;
}

/**
 * True if the **primary diagnosis** (cancer_type field) describes a
 * non-malignant / surveillance / workup condition. Cancer-organization
 * guidelines (NCCN, ESMO, ASCO) are suppressed only in this case.
 *
 * Important: we DELIBERATELY only check the primary dx, not the whole
 * haystack. Phrases like "no evidence of recurrence" or "complete remission"
 * routinely appear in active-cancer surveillance encounters (e.g., a breast
 * cancer patient on follow-up imaging with NED). Those encounters are still
 * billed/managed as cancer and should retain NCCN/ESMO/ASCO citations.
 *
 * The primary dx is non-malignant only if it explicitly names a benign /
 * pre-malignant condition (MGUS, MDS, monoclonal gammopathy, "no active
 * malignancy") OR contains an unambiguous negator AND doesn't co-mention
 * a clear active malignancy keyword.
 */
function isNonMalignantPrimary(primaryDx: string | undefined | null): boolean {
  if (!primaryDx) return false;
  const s = primaryDx.toLowerCase();

  // Conditions that are inherently non-malignant when named as the primary dx
  const nonMalignantConditions = [
    /\bmgus\b/,
    /\bmonoclonal\s+gammopathy\s+of\s+undetermined\s+significance\b/,
    /\bmds\b/,
    /\bmyelodysplastic\b/,
    /iron\s+deficien/,
    /\bdvt\b/,
    /\bvte\b/,
    /pulmonary\s+embolism/,
  ];
  if (nonMalignantConditions.some((p) => p.test(s))) return true;

  // Explicit negators in the primary dx itself
  const hardNegators = [
    /\bno\s+active\s+(?:malignancy|cancer|disease)\b/,
    /\bnon[- ]?malignant\b/,
    /\bbenign\b/,
    /\bpre[- ]?malignant\b/,
    /\bnot\s+applicable\b/,
  ];
  if (hardNegators.some((p) => p.test(s))) return true;

  // Soft signals — only treat as non-malignant if the primary dx does NOT
  // also name an active cancer term.
  const softNegators = [
    /\bunder\s+surveillance\b/,
    /\bcomplete\s+remission\b/,
    /\bin\s+remission\b/,
    /\bsurvivorship\b/,
    /\bno\s+evidence\s+of\s+(?:malignancy|cancer|recurrence|disease)\b/,
  ];
  const activeCancerTerm =
    /(?:carcinoma|adenocarcinoma|sarcoma|melanoma|leukemia|lymphoma|cancer|tumor|malignan|metastatic|nsclc|sclc|hcc|crc|gbm|myeloma)/i;
  if (softNegators.some((p) => p.test(s)) && !activeCancerTerm.test(s)) {
    return true;
  }

  return false;
}

/** Non-cancer-organization alternative citations keyed by condition. */
function nonMalignantAlternatives(haystack: string): Citation[] {
  const s = haystack.toLowerCase();
  const out: Citation[] = [];

  // MGUS / SMM — IMWG consensus, ASH guidelines, and IMF patient/clinician resource
  if (/\bmgus\b/.test(s) || /monoclonal\s+gammopathy/.test(s) || /smoldering\s+myeloma/.test(s) || /\bsmm\b/.test(s)) {
    out.push({
      source: 'IMWG',
      title:
        'International Myeloma Working Group consensus criteria — diagnosis, risk stratification & follow-up of MGUS / SMM',
      url: 'https://www.thelancet.com/journals/lanonc/article/PIIS1470-2045(14)70442-5/fulltext',
      section: 'Surveillance interval risk-stratified by Mayo criteria',
      year: 2014,
    });
    out.push({
      source: 'ASH',
      title: 'ASH Clinical Practice Guidelines: Monoclonal Gammopathies (MGUS / SMM)',
      url: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines',
      year: 2024,
    });
    out.push({
      source: 'IMF',
      title: 'International Myeloma Foundation — What are MGUS, SMM, and MM?',
      url: 'https://www.myeloma.org/what-are-mgus-smm-mm',
      section: 'Diagnostic criteria, progression risk & monitoring',
      year: 2024,
    });
  }

  // MDS — IWG-MDS / ASH for surveillance / lower-risk monitoring
  if (/\bmds\b/.test(s) || /myelodysplastic/.test(s)) {
    out.push({
      source: 'IWG',
      title: 'International Working Group response criteria & risk stratification in MDS (IPSS-R / IPSS-M)',
      url: 'https://www.bloodjournal.org/content/120/12/2454',
      section: 'IPSS-R / IPSS-M for surveillance interval',
      year: 2022,
    });
    out.push({
      source: 'ASH',
      title: 'ASH Clinical Practice Guidelines: Myelodysplastic Syndromes',
      url: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines',
      year: 2024,
    });
  }

  // Iron deficiency anemia — non-cancer
  if (/iron\s+deficien/.test(s)) {
    out.push({
      source: 'ASH',
      title: 'ASH Clinical Practice Guidelines: Iron Deficiency Anemia',
      url: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines',
      year: 2024,
    });
  }

  // DVT / PE — CHEST / ASH thrombosis
  if (/\bdvt\b/.test(s) || /deep\s+vein\s+thrombosis/.test(s) || /pulmonary\s+embolism/.test(s) || /\bvte\b/.test(s)) {
    out.push({
      source: 'CHEST',
      title: 'CHEST Guideline & Expert Panel Report: Antithrombotic Therapy for VTE Disease',
      url: 'https://journal.chestnet.org/article/S0012-3692(21)01506-3/fulltext',
      year: 2021,
    });
    out.push({
      source: 'ASH',
      title: 'ASH Clinical Practice Guidelines: Venous Thromboembolism — Treatment',
      url: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines',
      year: 2020,
    });
  }

  return out;
}

const CANCER_ORG_SOURCES = new Set(['NCCN', 'ESMO', 'ASCO']);

export function matchCitations(...inputs: (string | null | undefined)[]): Citation[] {
  const haystack = inputs.filter(Boolean).join(' ');
  if (!haystack.trim()) return GENERIC;

  const stage = detectStage(haystack);
  const resect = detectResectability(haystack);

  // Non-malignant decision is made purely from the primary dx (first input,
  // conventionally note.cancer_type). This prevents surveillance-style
  // phrasing in HPI/Assessment from misclassifying an active-cancer encounter.
  const primaryDx = (inputs[0] || '').toString();
  const nonMalignant = isNonMalignantPrimary(primaryDx);

  // Filter entries: at least one affirmative (non-negated) pattern match,
  // no exclude pattern matches, stage + resectability must apply.
  const matched = ENTRIES.filter((entry) => {
    if (!entry.patterns.some((p) => patternMatchesAffirmatively(haystack, p))) return false;
    if (entry.exclude?.some((p) => p.test(haystack))) return false;
    if (entry.resectability && !entry.resectability.includes(resect)) return false;
    if (!entry.stages || entry.stages.includes('any')) return true;
    return entry.stages.includes(stage);
  });

  // Dedupe by source+url
  const seen = new Set<string>();
  let out: Citation[] = [];
  for (const entry of matched) {
    for (const c of entry.citations) {
      const key = `${c.source}::${c.url || c.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
  }

  // Non-malignant encounter: strip cancer-org (NCCN/ESMO/ASCO) citations
  // and substitute condition-specific non-cancer guidelines (IMWG, IWG,
  // ASH, CHEST). This keeps the panel useful without misleading the user
  // into citing oncology guidelines for benign / surveillance cases.
  if (nonMalignant) {
    out = out.filter((c) => !CANCER_ORG_SOURCES.has(c.source.toUpperCase()));
    const alts = nonMalignantAlternatives(haystack);
    for (const c of alts) {
      const key = `${c.source}::${c.url || c.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
  }

  if (out.length === 0) {
    // Last-resort fallback. For non-malignant: a generic hematology pointer
    // instead of the cancer-org generic set.
    return nonMalignant
      ? [
          {
            source: 'ASH',
            title: 'ASH Clinical Practice Guidelines',
            url: 'https://www.hematology.org/education/clinicians/guidelines-and-quality-care/clinical-practice-guidelines',
            year: 2024,
          },
        ]
      : GENERIC;
  }

  return out;
}
