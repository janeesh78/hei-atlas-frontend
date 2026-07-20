// Outpatient hematology/oncology coding intelligence engine.
// Implements CMS 2021/2023 outpatient E/M Medical Decision Making (MDM) rules.
// Conservative by design — never fabricates documentation; emits gaps and
// compliance flags instead.

import type { OncologyNote, OutputFormat } from './api';
import type { ToxicityFinding } from './ctcae';

export const CODING_VERSION = '2024.04';

// ---------------------------------------------------------------------------
// Public types matching the requested JSON schema
// ---------------------------------------------------------------------------

export type MdmLevel = 'Straightforward' | 'Low' | 'Moderate' | 'High';
export type ComplexityLevel = 'Minimal' | 'Low' | 'Moderate' | 'High';
export type VisitType =
  | 'New patient outpatient'
  | 'Established patient outpatient'
  | 'Consultation'
  | 'Surveillance'
  | 'Active treatment'
  | 'Progression management'
  | 'Acute toxicity'
  | 'Goals of care / end-of-life';

export interface ComplexityItem {
  category: 'problem' | 'data' | 'risk';
  level: ComplexityLevel;
  description: string;
  /** Free-text excerpt from the note that supports this finding. */
  evidence: string;
  /** True when the engine inferred this rather than reading it explicitly. */
  inferred: boolean;
}

export interface IcdCode {
  code: string;
  description: string;
  /** 0..1 — based on directness of evidence. */
  confidence: number;
  evidence: string;
  primary: boolean;
}

export interface CptCode {
  code: string;
  description: string;
  rationale: string;
  /** Optional add-on flag (e.g., G2211 complex visit). */
  addOn?: boolean;
}

export interface DocumentationGap {
  area: string;
  description: string;
  /** Concrete (compliance-safe) suggestion the physician can add. */
  suggestion: string;
  /** Severity of the gap relative to defensibility. */
  severity: 'minor' | 'moderate' | 'critical';
}

export interface ComplianceFlag {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface CodingResult {
  visit_type: VisitType;
  mdm_level: MdmLevel;
  recommended_em_code: string;
  problem_complexity: ComplexityItem[];
  data_complexity: ComplexityItem[];
  risk_complexity: ComplexityItem[];
  icd10_codes: IcdCode[];
  cpt_codes: CptCode[];
  documentation_gaps: DocumentationGap[];
  compliance_flags: ComplianceFlag[];
  coding_rationale: string;
  confidence_score: number;
  /** Engine version + CMS rule baseline. */
  engine_version: string;
}

// ---------------------------------------------------------------------------
// Helper: case-insensitive search returning matched span as evidence
// ---------------------------------------------------------------------------

interface Hit {
  matched: boolean;
  evidence: string;
}

/**
 * Phrases that disqualify a match because the term is being negated, listed
 * as absent, or referenced historically. Checked in a small window before
 * (and immediately after) the candidate match, e.g. "Immunotherapy: None",
 * "denies chemotherapy", "no history of metastasis", "remote history of ALL".
 */
const NEGATION_BEFORE = [
  /:\s*$/,                        // structured label preceding "None"/"N/A"
  /\b(?:no|not|never|denies|denied|without)\s+$/i,
  /\b(?:none|n\/a|not\s+applicable|nil)\b[^.]{0,8}$/i,
  /\bhistory\s+of\s+$/i,
  /\bremote\s+history\s+of\s+$/i,
  /\bpast\s+history\s+of\s+$/i,
  /\bs\/p\s+$/i,
  /\bprior\s+$/i,
];
const NEGATION_AFTER = [
  /^\s*[:=]\s*(?:none|n\/a|not\s+applicable|nil|no)\b/i,
];

function isNegated(text: string, idx: number, matchLen: number): boolean {
  const before = text.slice(Math.max(0, idx - 50), idx);
  const after = text.slice(idx + matchLen, idx + matchLen + 30);
  if (NEGATION_BEFORE.some((p) => p.test(before))) return true;
  if (NEGATION_AFTER.some((p) => p.test(after))) return true;
  return false;
}

function probe(text: string, patterns: RegExp[]): Hit {
  for (const p of patterns) {
    // Walk every occurrence; accept only the first that isn't negated.
    const re = new RegExp(
      p.source,
      (p.flags.includes('g') ? p.flags : p.flags + 'g') +
        (p.flags.includes('i') ? '' : 'i')
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (isNegated(text, m.index, m[0].length)) continue;
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + m[0].length + 60);
      return {
        matched: true,
        evidence: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      };
    }
  }
  return { matched: false, evidence: '' };
}

// ---------------------------------------------------------------------------
// ICD-10 catalog: cancer-type → primary code
// ---------------------------------------------------------------------------

interface IcdRule {
  patterns: RegExp[];
  code: string;
  description: string;
}

const PRIMARY_ICD: IcdRule[] = [
  // Lung
  { patterns: [/non[\s-]?small[\s-]?cell\s+lung/i, /\bnsclc\b/i], code: 'C34.90', description: 'Malignant neoplasm of unspecified part of unspecified bronchus or lung' },
  { patterns: [/\bsclc\b/i, /small[\s-]?cell\s+lung/i], code: 'C34.91', description: 'Malignant neoplasm of unspecified part of right bronchus or lung (SCLC)' },
  // Pancreas
  { patterns: [/\bpdac\b/i, /pancreatic\s+(?:ductal\s+)?adenocarcinoma/i, /pancreatic\s+(?:cancer|carcinoma)/i], code: 'C25.9', description: 'Malignant neoplasm of pancreas, unspecified' },
  // Colon / rectum
  { patterns: [/\bmcrc\b/i, /metastatic\s+colorectal/i, /colorectal\s+(?:cancer|carcinoma)/i, /colon\s+cancer/i], code: 'C18.9', description: 'Malignant neoplasm of colon, unspecified' },
  { patterns: [/rectal\s+(?:cancer|carcinoma)/i], code: 'C20', description: 'Malignant neoplasm of rectum' },
  // Breast
  { patterns: [/breast\s+(?:cancer|carcinoma)/i, /\btnbc\b/i, /\bidc\b/i, /\bilc\b/i], code: 'C50.919', description: 'Malignant neoplasm of unspecified site of unspecified female breast' },
  // Prostate
  { patterns: [/prostate\s+(?:cancer|carcinoma)/i, /\bcrpc\b/i], code: 'C61', description: 'Malignant neoplasm of prostate' },
  // GU
  { patterns: [/urothelial\s+(?:cancer|carcinoma)/i, /bladder\s+cancer/i], code: 'C67.9', description: 'Malignant neoplasm of bladder, unspecified' },
  { patterns: [/renal\s+cell\s+carcinoma/i, /\brcc\b/i, /kidney\s+cancer/i], code: 'C64.9', description: 'Malignant neoplasm of unspecified kidney' },
  // Skin
  { patterns: [/melanoma/i], code: 'C43.9', description: 'Malignant melanoma of skin, unspecified' },
  // Hematologic
  { patterns: [/diffuse\s+large\s+b[- ]cell\s+lymphoma/i, /\bdlbcl\b/i], code: 'C83.30', description: 'Diffuse large B-cell lymphoma, unspecified site' },
  { patterns: [/hodgkin\s+(?:lymphoma|disease)/i], code: 'C81.90', description: "Hodgkin lymphoma, unspecified, unspecified site" },
  { patterns: [/follicular\s+lymphoma/i], code: 'C82.90', description: 'Follicular lymphoma, unspecified, unspecified site' },
  // Plasma cell disorders — more-specific patterns FIRST so MGUS isn't
  // misclassified as active myeloma. The probe() function returns on the
  // first non-negated match per rule, and buildIcdCodes only assigns the
  // primary code from the first hit across all rules — so order matters.
  { patterns: [/\bmgus\b/i, /monoclonal\s+gammopathy\s+of\s+undetermined\s+significance/i, /monoclonal\s+gammopathy/i], code: 'D47.2', description: 'Monoclonal gammopathy of undetermined significance (MGUS)' },
  { patterns: [/smoldering\s+(?:multiple\s+)?myeloma/i, /\bsmm\b/i], code: 'C90.01', description: 'Multiple myeloma in remission (smoldering myeloma)' },
  { patterns: [/waldenstrom['']?s?\s+macroglobulinemia/i, /lymphoplasmacytic\s+lymphoma/i, /\blpl\b/i], code: 'C88.0', description: 'Waldenström macroglobulinemia / lymphoplasmacytic lymphoma' },
  { patterns: [/multiple\s+myeloma\b/i, /\bplasma\s+cell\s+myeloma\b/i], code: 'C90.00', description: 'Multiple myeloma not having achieved remission' },
  // Bare "MM" abbreviation removed — too ambiguous in dictated speech
  // ("mm-hmm", millimeters, etc). Require spelled-out form or "plasma cell myeloma".
  { patterns: [/acute\s+myeloid\s+leukemia/i, /\baml\b/i], code: 'C92.00', description: 'Acute myeloblastic leukemia, not having achieved remission' },
  // ALL — only the spelled-out form matches. The bare abbreviation "ALL"
  // is far too noisy in a transcribed conversation ("all right", "all over",
  // "all good") to use safely; we accept a small recall loss for huge
  // precision gains.
  { patterns: [/acute\s+lymphoblastic\s+leukemia/i, /\bb[- ]?all\b/i, /\bt[- ]?all\b/i], code: 'C91.00', description: 'Acute lymphoblastic leukemia not having achieved remission' },
  { patterns: [/chronic\s+lymphocytic\s+leukemia/i, /\bcll\b/i], code: 'C91.10', description: 'Chronic lymphocytic leukemia of B-cell type not having achieved remission' },
  { patterns: [/chronic\s+myeloid\s+leukemia/i, /\bcml\b/i], code: 'C92.10', description: 'Chronic myeloid leukemia, BCR/ABL-positive, not having achieved remission' },
  // GI / hepatobiliary
  { patterns: [/hepatocellular\s+carcinoma/i, /\bhcc\b/i], code: 'C22.0', description: 'Liver cell carcinoma' },
  // Gastroesophageal junction / cardia — checked before the generic gastric
  // and esophageal rules below so GEJ/Siewert II-III and cardia-sited
  // adenocarcinomas (e.g. MATTERHORN-regimen perioperative disease) map to
  // the specific cardia code instead of falling through to an unspecified one.
  { patterns: [/gastro[- ]?esophageal\s+junction/i, /esophagogastric\s+junction/i, /\bgej\b/i, /\bge\s+junction\b/i, /gastric\s+cardia/i, /cardia\s+adenocarcinoma/i], code: 'C16.0', description: 'Malignant neoplasm of cardia' },
  { patterns: [/gastric\s+(?:cancer|carcinoma|adenocarcinoma)/i, /adenocarcinoma\s+of\s+the\s+stomach/i, /stomach\s+(?:cancer|carcinoma)/i], code: 'C16.9', description: 'Malignant neoplasm of stomach, unspecified' },
  { patterns: [/esophageal\s+(?:cancer|carcinoma|adenocarcinoma)/i, /adenocarcinoma\s+of\s+the\s+esophagus/i], code: 'C15.9', description: 'Malignant neoplasm of esophagus, unspecified' },
  // Gyn
  { patterns: [/ovarian\s+(?:cancer|carcinoma)/i], code: 'C56.9', description: 'Malignant neoplasm of unspecified ovary' },
  { patterns: [/endometrial\s+(?:cancer|carcinoma)/i, /uterine\s+(?:cancer|carcinoma)/i], code: 'C54.1', description: 'Malignant neoplasm of endometrium' },
  { patterns: [/cervical\s+cancer/i], code: 'C53.9', description: 'Malignant neoplasm of cervix uteri, unspecified' },
  // Head & neck
  { patterns: [/head\s+and\s+neck\s+(?:cancer|squamous)/i, /\bhnscc\b/i], code: 'C76.0', description: 'Malignant neoplasm of head, face and neck' },
  { patterns: [/glioblastoma/i, /\bgbm\b/i], code: 'C71.9', description: 'Malignant neoplasm of brain, unspecified' },
];

// Secondary problem codes triggered by note content / toxicities
interface SecondaryRule {
  patterns: RegExp[];
  toxicityNames?: string[];
  code: string;
  description: string;
}

const SECONDARY_ICD: SecondaryRule[] = [
  // Treatment encounters
  { patterns: [/(?:on|active)\s+chemotherapy/i, /cytotoxic\s+(?:chemo|therapy)/i, /folfirinox/i, /folfox/i, /\bcarboplatin\b/i, /\bcisplatin\b/i, /\bpaclitaxel\b/i, /\bgemcitabine\b/i], code: 'Z51.11', description: 'Encounter for antineoplastic chemotherapy' },
  { patterns: [/\bimmunotherapy\b/i, /\bpembrolizumab\b/i, /\bnivolumab\b/i, /\bdurvalumab\b/i, /\batezolizumab\b/i, /\bipilimumab\b/i, /checkpoint\s+inhibitor/i], code: 'Z51.12', description: 'Encounter for antineoplastic immunotherapy' },
  // Mets sites
  { patterns: [/liver\s+metastas[ie]s/i, /hepatic\s+metastas[ie]s/i, /\bmets\s+to\s+liver/i], code: 'C78.7', description: 'Secondary malignant neoplasm of liver and intrahepatic bile duct' },
  { patterns: [/lung\s+metastas[ie]s/i, /pulmonary\s+metastas[ie]s/i], code: 'C78.0', description: 'Secondary malignant neoplasm of lung' },
  { patterns: [/bone\s+metastas[ie]s/i, /osseous\s+metastas[ie]s/i], code: 'C79.51', description: 'Secondary malignant neoplasm of bone' },
  { patterns: [/brain\s+metastas[ie]s/i, /\bcns\s+metastas[ie]s/i], code: 'C79.31', description: 'Secondary malignant neoplasm of brain' },
  { patterns: [/lymph\s+node\s+metastas[ie]s/i, /nodal\s+metastas[ie]s/i], code: 'C77.9', description: 'Secondary and unspecified malignant neoplasm of lymph node, unspecified' },
  // Hematologic toxicities
  { patterns: [/febrile\s+neutropenia/i], toxicityNames: [], code: 'D70.1', description: 'Agranulocytosis secondary to cancer chemotherapy' },
  { patterns: [/neutropenia/i, /\blow\s+anc\b/i], toxicityNames: ['Neutropenia'], code: 'D70.1', description: 'Agranulocytosis secondary to cancer chemotherapy' },
  { patterns: [/thrombocytopenia/i, /low\s+platelet/i], toxicityNames: ['Thrombocytopenia'], code: 'D69.59', description: 'Other secondary thrombocytopenia' },
  // Anemia attribution — order matters: more-specific patterns first.
  // D63.1 (CKD-related), D64.81 (chemo-induced), D64.9 (unspecified) are
  // resolved at code-build time via buildIcdCodes() below, not here. This
  // entry is kept as a generic "anemia present" marker and the specific
  // code is selected in buildIcdCodes based on context.
  { patterns: [/\banemia\b/i, /\blow\s+(?:hgb|hemoglobin|hb)\b/i], toxicityNames: ['Anemia'], code: 'ANEMIA_TBD', description: 'Anemia (cause resolved at code time)' },
  // Other toxicities
  { patterns: [/peripheral\s+neuropathy/i, /chemotherapy[- ]induced\s+peripheral\s+neuropathy/i], toxicityNames: ['Peripheral sensory neuropathy'], code: 'G62.0', description: 'Drug-induced polyneuropathy' },
  { patterns: [/nausea\s+and\s+vomiting/i, /chemotherapy[- ]induced\s+nausea/i], toxicityNames: ['Nausea', 'Vomiting'], code: 'R11.2', description: 'Nausea with vomiting, unspecified' },
  { patterns: [/\bdiarrhea\b/i], toxicityNames: ['Diarrhea'], code: 'K52.1', description: 'Toxic gastroenteritis and colitis' },
  { patterns: [/mucositis|stomatitis/i], toxicityNames: ['Mucositis (oral)'], code: 'K12.31', description: 'Oral mucositis (ulcerative) due to antineoplastic therapy' },
  { patterns: [/\bcancer\s+(?:related\s+)?fatigue\b/i, /malignan(?:cy|t)[- ]related\s+fatigue/i], toxicityNames: ['Fatigue'], code: 'R53.83', description: 'Other fatigue' },
  // Common comorbidities mentioned in oncology notes
  { patterns: [/\bdvt\b/i, /deep\s+vein\s+thrombosis/i], code: 'I82.40', description: 'Acute embolism and thrombosis of unspecified deep veins of lower extremity' },
  { patterns: [/pulmonary\s+embolism/i, /\bpe\b(?!\s+ratio)/i], code: 'I26.99', description: 'Other pulmonary embolism without acute cor pulmonale' },
  { patterns: [/cancer\s+pain/i, /chronic\s+pain/i], code: 'G89.3', description: 'Neoplasm related pain (acute) (chronic)' },
  { patterns: [/\bhypertension\b/i, /\bhtn\b/i], code: 'I10', description: 'Essential (primary) hypertension' },
  { patterns: [/\btype\s+2\s+diabetes/i, /\bt2dm\b/i, /\bdm2\b/i], code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
];

// ---------------------------------------------------------------------------
// Stage / metastatic detection (drives problem complexity)
// ---------------------------------------------------------------------------

/**
 * True if the cancer_type / corpus indicates the encounter is NOT an active
 * malignancy — non-malignant hematologic conditions under surveillance,
 * "no active malignancy", "remission", workup-only visits, etc.
 *
 * Used as a gate before classifying problem complexity as High malignancy —
 * surveillance / workup encounters should not score as life-threatening
 * malignant disease.
 */
function isNonMalignantContext(note: OncologyNote): boolean {
  const cancerType = (note.cancer_type || '').toLowerCase();
  const stage = (note.tnm_stage || '').toLowerCase();
  const haystack = cancerType + ' ' + stage;

  const negators = [
    /\bno\s+active\s+(?:malignancy|cancer|disease)\b/,
    /\bno\s+evidence\s+of\s+(?:malignancy|cancer|recurrence|disease)\b/,
    /\bnon[- ]?malignant\b/,
    /\bbenign\b/,
    /\bunder\s+surveillance\b/,
    /\bcomplete\s+remission\b/,
    /\bin\s+remission\b/,
    /\bsurvivorship\b/,
    /\bnot\s+applicable\b/,
    /\bpre[- ]?malignant\b/,
    /\bworkup\b/,
    /\bunder\s+(?:evaluation|workup)\b/,
    /\bpossible\s+(?:mds|myelodysplastic)\b/, // pre-diagnosis hematologic eval
  ];
  return negators.some((p) => p.test(haystack));
}

function detectMetastatic(text: string): boolean {
  // Affirmative metastatic phrases
  const affirmative: RegExp[] = [
    /\bmetastatic\b/i,
    /\bstage\s*(?:iv|4)\b/i,
    /\bm1\b/i,
    /\bmetastas[ie]s\b/i,
    /\bmcrc\b|\bmpdac\b|\bmnsclc\b|\bcrpc\b/i,
    /\bspread\s+to\b/i,
    /\bdistant\s+(?:metastas|spread)/i,
  ];

  // Negation phrases that should disqualify a match
  const negations: RegExp[] = [
    /\bno\s+(?:evidence\s+of\s+)?metastatic\b/i,
    /\bno\s+metastas[ie]s\b/i,
    /\bwithout\s+metastas[ie]s\b/i,
    /\bnon[- ]?metastatic\b/i,
    /\brule\s+out\s+metastatic\b/i,
    /\br\/o\s+metastatic\b/i,
    /\babsence\s+of\s+metastatic\b/i,
    /\bdenies\s+metastatic\b/i,
  ];

  if (negations.some((p) => p.test(text))) {
    // Strip negated spans before checking affirmative
    let stripped = text;
    for (const np of negations) {
      stripped = stripped.replace(new RegExp(np.source, np.flags + 'g'), ' ');
    }
    return affirmative.some((p) => p.test(stripped));
  }

  return affirmative.some((p) => p.test(text));
}

function detectActiveTreatment(text: string): boolean {
  return /(?:on|active|continues\s+on|started|cycle\s+\d+)\s+(?:chemotherapy|chemo|immunotherapy|targeted\s+therapy)/i.test(text)
    || /folfirinox|folfox|capecitabine|gemcitabine|carboplatin|cisplatin|paclitaxel|pembrolizumab|nivolumab|durvalumab|atezolizumab|osimertinib|olaparib/i.test(text);
}

/**
 * Affirmative progression detection — must avoid negation ("no progression",
 * "rule out progression", "without progression", "confirm no progression",
 * "free of progression"). The classifier was incorrectly tagging surveillance
 * visits as "Progression management" because of these phrases.
 */
function detectProgression(text: string): boolean {
  // Affirmative progression phrases — tightened to require clinical disease
  // context. Bare "recurrent" is not enough (matches "recurrent visits" /
  // "recurrent themes"); require it to be qualified by a disease term.
  const affirmativePatterns: RegExp[] = [
    /\bprogressed\s+(?:on|after|through|despite)\b/i,
    /\bdisease\s+progression\b/i,
    /\bevidence\s+of\s+progression\b/i,
    /\bprogressive\s+disease\b/i,
    /\bworsening\s+(?:disease|metastas|tumor)/i,
    /\bnew\s+(?:lesions?|metastas[ie]s|sites?\s+of\s+disease)\b/i,
    // "Recurrence" only counts when it's clearly disease recurrence
    /\brecurrent\s+(?:disease|tumor|cancer|malignancy|mass|lesions?|metastas|lymphoma|leukemia|myeloma|carcinoma)\b/i,
    /\brecurrence\s+of\s+(?:disease|tumor|cancer|malignancy|primary)\b/i,
    /\bdisease\s+recurrence\b/i,
    /\btumor\s+recurrence\b/i,
    /\binterval\s+growth\b/i,
    /\benlarging\s+(?:lesions?|nodes?|mass|tumor|metastas)/i,
    /\bradiographic\s+progression\b/i,
  ];

  // Historical / prior-context phrases — strip these before checking
  // affirmatives. A "history of recurrence" or "prior progression" describes
  // the past, not the current encounter.
  const historicalContexts: RegExp[] = [
    /\bhistory\s+of\s+(?:disease\s+)?(?:progression|recurrence|recurrent\s+disease)\b/i,
    /\bprior\s+(?:progression|recurrence)\b/i,
    /\bpast\s+(?:progression|recurrence)\b/i,
    /\bpreviously\s+(?:progressed|recurred)\b/i,
    /\bs\/p\s+(?:progression|recurrence)\b/i,
    /\bremote\s+(?:progression|recurrence)\b/i,
    /\bat\s+(?:prior|last|previous)\s+(?:visit|encounter|scan|imaging)/i,
  ];

  // Negation phrases — patient is NOT progressing
  const negationContexts: RegExp[] = [
    /\bno\s+(?:evidence\s+of\s+)?(?:disease\s+)?progression\b/i,
    /\bwithout\s+(?:evidence\s+of\s+)?progression\b/i,
    /\brule\s+out\s+progression\b/i,
    /\br\/o\s+progression\b/i,
    /\bconfirm\s+no\s+progression\b/i,
    /\bfree\s+of\s+progression\b/i,
    /\babsence\s+of\s+progression\b/i,
    /\bdenies\s+progression\b/i,
    /\bno\s+(?:evidence\s+of\s+)?recurrence\b/i,
    /\bno\s+(?:evidence\s+of\s+)?disease\s+recurrence\b/i,
    /\bwithout\s+recurrence\b/i,
    /\bfree\s+of\s+recurrence\b/i,
  ];

  // Strip every historical + negated span, then check affirmatives on what's left.
  let stripped = text;
  for (const p of [...historicalContexts, ...negationContexts]) {
    stripped = stripped.replace(new RegExp(p.source, p.flags + 'g'), ' ');
  }
  return affirmativePatterns.some((p) => p.test(stripped));
}

function detectHospitalizationDecision(text: string): boolean {
  return /\b(?:admit|admission|hospitaliz|inpatient)\b/i.test(text) || /\bER\s+(?:visit|referral)\b/i.test(text);
}

function detectGoalsOfCare(text: string): boolean {
  return /goals\s+of\s+care/i.test(text) || /\bhospice\b/i.test(text) || /\badvance\s+directive\b/i.test(text) ||
    /\bcomfort\s+care\b/i.test(text) || /\bend[- ]of[- ]life\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Build problem / data / risk complexity per CMS 2021/2023 outpatient MDM
// ---------------------------------------------------------------------------

function buildProblemComplexity(corpus: string, note: OncologyNote): ComplexityItem[] {
  const items: ComplexityItem[] = [];

  if (note.cancer_type) {
    const nonMalignant = isNonMalignantContext(note);
    const isMets = !nonMalignant && detectMetastatic(corpus + ' ' + (note.tnm_stage || ''));
    const isProgressing = !nonMalignant && detectProgression(corpus);

    if (nonMalignant) {
      // Workup / surveillance / remission / non-malignant hematologic eval.
      // Still meaningful complexity (history of cancer, pre-malignant condition,
      // diagnostic workup) but NOT an active life-threatening malignancy.
      items.push({
        category: 'problem',
        level: 'Moderate',
        description:
          'Non-malignant or surveillance encounter — diagnostic workup / monitoring without active cancer',
        evidence: (note.cancer_type || '').slice(0, 160) +
                  (note.tnm_stage ? ` · ${(note.tnm_stage || '').slice(0, 80)}` : ''),
        inferred: false,
      });
    } else if (isMets || isProgressing) {
      items.push({
        category: 'problem',
        level: 'High',
        description: `Active malignancy with ${
          isProgressing ? 'progression' : 'metastatic disease'
        } — chronic illness with severe progression and significant threat to life`,
        evidence: note.cancer_type + (note.tnm_stage ? ` · ${note.tnm_stage}` : ''),
        inferred: false,
      });
    } else {
      items.push({
        category: 'problem',
        level: 'Moderate',
        description: 'Active oncologic diagnosis — chronic illness with side effects of treatment',
        evidence: note.cancer_type + (note.tnm_stage ? ` · ${note.tnm_stage}` : ''),
        inferred: false,
      });
    }
  }

  // Toxicities count as additional acute illnesses with systemic symptoms (Moderate)
  // unless severe (febrile neutropenia, life-threatening) → High
  const fever = probe(corpus, [/febrile\s+neutropenia/i, /\bsepsis\b/i]);
  if (fever.matched) {
    items.push({
      category: 'problem',
      level: 'High',
      description: 'Febrile neutropenia / sepsis — acute illness posing threat to life',
      evidence: fever.evidence,
      inferred: false,
    });
  }

  return items;
}

function buildDataComplexity(corpus: string, note: OncologyNote): ComplexityItem[] {
  const items: ComplexityItem[] = [];
  const cats: string[] = [];

  // Category 1: review of prior external notes / tests / ordering
  const prior = probe(corpus, [
    /(?:reviewed|prior)\s+(?:outside|external|referring)\s+(?:notes?|records?)/i,
    /reviewed.*previous\s+(?:scan|imaging|labs?)/i,
    /compared\s+(?:with|to)\s+prior/i,
  ]);
  if (prior.matched) {
    cats.push('cat1-prior');
    items.push({
      category: 'data',
      level: 'Moderate',
      description: 'Review of external notes / prior tests',
      evidence: prior.evidence,
      inferred: false,
    });
  }

  const labsOrdered = probe(corpus, [
    /\bcbc\b/i, /\bcmp\b/i, /\blft\b/i, /\bldh\b/i,
    /labs?\s+(?:ordered|drawn|reviewed)/i,
    /\btumor\s+markers?\b/i,
  ]);
  if (labsOrdered.matched) {
    cats.push('cat1-labs');
    items.push({
      category: 'data',
      level: 'Moderate',
      description: 'Laboratory data reviewed',
      evidence: labsOrdered.evidence,
      inferred: false,
    });
  }

  const imaging = probe(corpus, [
    /\bct\s+(?:scan|chest|abdomen|pelvis)/i, /\bpet[- /]?ct\b/i, /\bmri\b/i,
    /\bx[- ]?ray\b/i, /imaging\s+reviewed/i,
  ]);
  if (imaging.matched) {
    items.push({
      category: 'data',
      level: 'Moderate',
      description: 'Imaging studies reviewed',
      evidence: imaging.evidence,
      inferred: false,
    });
    cats.push('cat2-imaging');
  }

  // Category 2: independent interpretation
  const independent = probe(corpus, [
    /independent(?:ly)?\s+(?:interpret|review)/i,
    /reviewed\s+images\s+(?:myself|personally)/i,
    /personally\s+reviewed/i,
  ]);
  if (independent.matched) {
    items.push({
      category: 'data',
      level: 'High',
      description: 'Independent interpretation of test by treating provider',
      evidence: independent.evidence,
      inferred: false,
    });
    cats.push('cat2-independent');
  }

  // Category 3: discussion with external physician
  const discussion = probe(corpus, [
    /discussed\s+with\s+(?:dr\.|surgeon|radiation|oncolog|pathologist|tumor\s+board)/i,
    /tumor\s+board/i, /multidisciplinary\s+(?:discussion|conference|review)/i,
  ]);
  if (discussion.matched) {
    items.push({
      category: 'data',
      level: 'High',
      description: 'Discussion with external physician / tumor board',
      evidence: discussion.evidence,
      inferred: false,
    });
    cats.push('cat3-discussion');
  }

  // Pathology / genomics
  const pathOrNgs = probe(corpus, [
    /\bpathology\s+reviewed/i, /\bngs\b/i, /next[- ]generation\s+sequencing/i,
    /molecular\s+(?:profile|testing)/i, /foundation\s*one/i, /\boncotype\b/i,
    /\begfr\b|\bkras\b|\balk\b|\bbrca\b|\bmsi\b|\btmb\b|\bpd[- ]?l1\b/i,
  ]);
  if (pathOrNgs.matched) {
    items.push({
      category: 'data',
      level: 'Moderate',
      description: 'Pathology / molecular testing reviewed',
      evidence: pathOrNgs.evidence,
      inferred: false,
    });
  }

  return items;
}

function buildRiskComplexity(
  corpus: string,
  note: OncologyNote,
  toxicities: ToxicityFinding[]
): ComplexityItem[] {
  const items: ComplexityItem[] = [];

  // High-risk: drug therapy requiring intensive monitoring for toxicity
  const activeTx = detectActiveTreatment(corpus);
  if (activeTx) {
    items.push({
      category: 'risk',
      level: 'High',
      description:
        'Drug therapy requiring intensive monitoring for toxicity (cytotoxic chemo / immunotherapy)',
      evidence: probe(corpus, [
        /chemotherapy/i, /immunotherapy/i, /folfirinox|folfox|carboplatin|cisplatin|paclitaxel|pembrolizumab|nivolumab|durvalumab/i,
      ]).evidence,
      inferred: false,
    });
  }

  // High: decision regarding hospitalization / escalation of care
  if (detectHospitalizationDecision(corpus)) {
    items.push({
      category: 'risk',
      level: 'High',
      description: 'Decision regarding hospitalization / escalation of care',
      evidence: probe(corpus, [/admit|admission|hospitaliz|inpatient|ER/i]).evidence,
      inferred: false,
    });
  }

  // High: goals of care / decision not to resuscitate
  if (detectGoalsOfCare(corpus)) {
    items.push({
      category: 'risk',
      level: 'High',
      description: 'Decision regarding limitation of care / hospice / advance directive',
      evidence: probe(corpus, [/goals\s+of\s+care|hospice|advance\s+directive|comfort\s+care/i]).evidence,
      inferred: false,
    });
  }

  // Moderate: prescription drug management (any Rx)
  const rxMgmt = probe(corpus, [
    /prescrib(?:e|ed|ing)/i,
    /\b(?:start|continue|hold|discontinue|dose\s+(?:reduce|adjust))\b/i,
    /\b(?:gabapentin|duloxetine|ondansetron|prochlorperazine|loperamide|filgrastim|pegfilgrastim|epoetin|denosumab|zoledronic|enoxaparin|apixaban)\b/i,
  ]);
  if (rxMgmt.matched && !activeTx) {
    items.push({
      category: 'risk',
      level: 'Moderate',
      description: 'Prescription drug management',
      evidence: rxMgmt.evidence,
      inferred: false,
    });
  }

  // Moderate: severe-grade toxicity managed
  const grade3plus = toxicities.filter((t) => t.grade >= 3);
  if (grade3plus.length > 0) {
    items.push({
      category: 'risk',
      level: 'High',
      description: `Management of CTCAE Grade ${Math.max(
        ...grade3plus.map((t) => t.grade)
      )} toxicit${grade3plus.length === 1 ? 'y' : 'ies'}`,
      evidence: grade3plus.map((t) => `${t.toxicity} (Grade ${t.grade})`).join('; '),
      inferred: false,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// MDM aggregator: outpatient E/M needs 2 of 3 elements at the chosen level
// ---------------------------------------------------------------------------

const LEVEL_RANK: Record<ComplexityLevel, number> = {
  Minimal: 1,
  Low: 2,
  Moderate: 3,
  High: 4,
};
const LEVEL_FROM_RANK: Record<number, ComplexityLevel> = {
  1: 'Minimal',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
};

function topLevel(items: ComplexityItem[]): ComplexityLevel {
  if (items.length === 0) return 'Minimal';
  const max = Math.max(...items.map((i) => LEVEL_RANK[i.level]));
  return LEVEL_FROM_RANK[max];
}

function determineMdm(p: ComplexityLevel, d: ComplexityLevel, r: ComplexityLevel): MdmLevel {
  // Need 2 of 3 at same level (or the second-highest level)
  const ranks = [p, d, r].map((l) => LEVEL_RANK[l]).sort((a, b) => b - a);
  const second = ranks[1];
  switch (second) {
    case 4:
      return 'High';
    case 3:
      return 'Moderate';
    case 2:
      return 'Low';
    default:
      return 'Straightforward';
  }
}

const MDM_TO_EM_ESTABLISHED: Record<MdmLevel, string> = {
  Straightforward: '99212',
  Low: '99213',
  Moderate: '99214',
  High: '99215',
};
const MDM_TO_EM_NEW: Record<MdmLevel, string> = {
  Straightforward: '99202',
  Low: '99203',
  Moderate: '99204',
  High: '99205',
};

// ---------------------------------------------------------------------------
// Visit-type classifier
// ---------------------------------------------------------------------------

function classifyVisitType(corpus: string, note?: OncologyNote): VisitType {
  if (detectGoalsOfCare(corpus)) return 'Goals of care / end-of-life';

  // Non-malignant / surveillance encounters take precedence over the active-
  // treatment / progression branches — even if cytotoxic agent names appear
  // historically in the corpus, an "under surveillance" visit is not active
  // progression management.
  if (note && isNonMalignantContext(note)) return 'Surveillance';

  // Short-term / interval follow-up signals — these are stronger than any
  // incidental progression keyword because a physician explicitly framed
  // this visit as routine follow-up. A short-term follow-up to reassess
  // response is NOT the same as "Progression management".
  const shortTermFollowUp =
    /\bshort[- ]?(?:term|interval)\s+follow[- ]?up\b/i.test(corpus) ||
    /\b(?:1|2|3|4|6|8|10|12)[- ]?(?:day|week|month)\s+follow[- ]?up\b/i.test(corpus) ||
    /\brepeat\s+(?:labs|imaging|scan|visit)\s+in\s+\d+/i.test(corpus) ||
    /\breturn\s+in\s+\d+\s+(?:day|week|month)/i.test(corpus) ||
    /\brecheck\s+in\s+\d+/i.test(corpus);
  if (shortTermFollowUp) return 'Surveillance';

  if (detectProgression(corpus)) return 'Progression management';
  if (/\bgrade\s+[3-4]\b|\bsevere\s+toxicit/i.test(corpus)) return 'Acute toxicity';
  if (detectActiveTreatment(corpus)) return 'Active treatment';
  if (/\bsurveillance\b|\bfollow[- ]?up\b|\bestablished\b|stable/i.test(corpus)) return 'Surveillance';
  if (/new\s+(?:patient|consult)/i.test(corpus)) return 'New patient outpatient';
  if (/\bconsult/i.test(corpus)) return 'Consultation';
  return 'Established patient outpatient';
}

// ---------------------------------------------------------------------------
// Documentation gap analyzer
// ---------------------------------------------------------------------------

function buildDocumentationGaps(
  corpus: string,
  note: OncologyNote,
  data: ComplexityItem[],
  risk: ComplexityItem[]
): DocumentationGap[] {
  const gaps: DocumentationGap[] = [];

  if (detectActiveTreatment(corpus)) {
    if (!risk.some((r) => /toxicity/i.test(r.description))) {
      gaps.push({
        area: 'Toxicity monitoring',
        description:
          'Active antineoplastic therapy noted but explicit toxicity monitoring discussion is not documented.',
        suggestion:
          'Add a brief statement such as "Reviewed for treatment-related toxicities; counseled patient on symptom monitoring and parameters for urgent contact."',
        severity: 'critical',
      });
    }
  }

  if (data.some((d) => /imaging/i.test(d.description)) && !data.some((d) => /independent/i.test(d.description))) {
    gaps.push({
      area: 'Independent interpretation',
      description:
        'Imaging is referenced but the note does not explicitly state independent interpretation by the treating provider.',
      suggestion:
        'If applicable, document: "Personally reviewed images independent of radiology report and concur with findings of [...]."',
      severity: 'moderate',
    });
  }

  // A cancer_type of "anemia"/"thrombocytopenia"/etc. is a benign cytopenia
  // workup, not an active malignancy — pathology/molecular review doesn't
  // apply, but peripheral smear review does.
  const cancerTypeIsCytopenia = /\b(?:anemia|thrombocytopenia|leukopenia|neutropenia)\b/i.test(
    note.cancer_type || ''
  );

  if (!data.some((d) => /pathology/i.test(d.description)) && note.cancer_type && !cancerTypeIsCytopenia) {
    gaps.push({
      area: 'Pathology / molecular review',
      description: 'Active oncologic diagnosis without documented pathology or molecular review.',
      suggestion:
        'When relevant to the encounter, add: "Reviewed pathology / molecular testing including [biomarkers]."',
      severity: 'minor',
    });
  }

  if (cancerTypeIsCytopenia && !data.some((d) => /smear/i.test(d.description))) {
    gaps.push({
      area: 'Peripheral smear review',
      description:
        'Diagnosis is a cytopenia (anemia / thrombocytopenia / leukopenia / neutropenia) without documented peripheral smear review.',
      suggestion: 'When relevant to the encounter, add: "Reviewed peripheral smear."',
      severity: 'minor',
    });
  }

  if (!/total\s+time|spent.*minutes|counseling.*time|\b\d+\s*minutes\b/i.test(corpus)) {
    gaps.push({
      area: 'Time documentation',
      description:
        'Total visit time and counseling/coordination time are not documented. Time-based billing requires explicit minute counts.',
      suggestion:
        'If billing on time, add: "Total time spent on this encounter: ___ minutes, of which ___ were counseling/coordination of care."',
      severity: 'minor',
    });
  }

  if (!note.history_present_illness?.trim()) {
    gaps.push({
      area: 'HPI',
      description: 'History of Present Illness is empty or not documented.',
      suggestion: 'Document interval history, treatment tolerance, and current symptoms.',
      severity: 'critical',
    });
  }

  if (!note.physical_examination?.trim()) {
    gaps.push({
      area: 'Physical examination',
      description: 'Physical examination is not documented.',
      suggestion: 'Document at minimum a focused oncologic examination relevant to the chief concern.',
      severity: 'moderate',
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Validation layer
// ---------------------------------------------------------------------------

function buildComplianceFlags(
  corpus: string,
  icds: IcdCode[],
  cpts: CptCode[],
  toxicities: ToxicityFinding[],
  mdm: MdmLevel
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];

  // Chemo encounter (Z51.11) without cytotoxic agent reference
  if (icds.some((i) => i.code === 'Z51.11') && !detectActiveTreatment(corpus)) {
    flags.push({
      type: 'Diagnosis–evidence linkage',
      message:
        'Z51.11 (encounter for antineoplastic chemotherapy) coded but no specific chemotherapy regimen referenced in the note.',
      severity: 'warning',
    });
  }

  // Toxicity ICD without active chemo
  if (toxicities.length > 0 && !detectActiveTreatment(corpus)) {
    flags.push({
      type: 'Diagnosis–evidence linkage',
      message:
        'Treatment toxicities extracted but no active antineoplastic therapy is referenced. Verify the toxicity attribution.',
      severity: 'warning',
    });
  }

  // High MDM without supportive risk language
  if (mdm === 'High' && !/intensive\s+monitoring|cytotoxic|hospitaliz|admission/i.test(corpus)) {
    flags.push({
      type: 'MDM support',
      message:
        'High MDM inferred from active treatment, but explicit risk language ("drug therapy requiring intensive monitoring", "decision regarding hospitalization") is absent. Consider strengthening risk documentation.',
      severity: 'warning',
    });
  }

  // Metastatic ICD without explicit metastatic evidence
  const metsCodes = icds.filter((i) => /^C7[78]\./.test(i.code));
  if (metsCodes.length > 0 && !detectMetastatic(corpus)) {
    flags.push({
      type: 'Diagnosis–evidence linkage',
      message:
        'Metastatic site codes (C77/C78/C79) suggested but explicit metastatic evidence is limited. Confirm staging documentation.',
      severity: 'info',
    });
  }

  // CPT add-on G2211 without complex chronic illness language
  if (cpts.some((c) => c.code === 'G2211') && !/(?:longitudinal|ongoing|complex\s+chronic)/i.test(corpus)) {
    flags.push({
      type: 'CPT add-on',
      message:
        'G2211 (complex office visit add-on) requires longitudinal management of a serious or complex chronic illness. Ensure the note reflects ongoing/longitudinal relationship.',
      severity: 'info',
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// ICD/CPT builders
// ---------------------------------------------------------------------------

function buildIcdCodes(
  corpus: string,
  note: OncologyNote,
  toxicities: ToxicityFinding[]
): IcdCode[] {
  const codes: IcdCode[] = [];
  const seen = new Set<string>();

  // Primary cancer code from note.cancer_type if available, then transcript
  const primarySearchText = [note.cancer_type, note.assessment, corpus].filter(Boolean).join(' ');
  for (const rule of PRIMARY_ICD) {
    const hit = probe(primarySearchText, rule.patterns);
    if (hit.matched && !seen.has(rule.code)) {
      codes.push({
        code: rule.code,
        description: rule.description,
        confidence: note.cancer_type && rule.patterns.some((p) => p.test(note.cancer_type || '')) ? 0.95 : 0.85,
        evidence: hit.evidence,
        primary: codes.length === 0,
      });
      seen.add(rule.code);
      break; // only the highest-confidence primary
    }
  }

  // Secondary codes
  for (const rule of SECONDARY_ICD) {
    if (seen.has(rule.code)) continue;

    let hit: Hit = { matched: false, evidence: '' };
    if (rule.toxicityNames && rule.toxicityNames.length) {
      const tox = toxicities.find((t) =>
        rule.toxicityNames!.some((n) => n.toLowerCase() === t.toxicity.toLowerCase())
      );
      if (tox) {
        hit = { matched: true, evidence: `${tox.toxicity} (Grade ${tox.grade})` };
      }
    }
    if (!hit.matched) hit = probe(corpus, rule.patterns);

    if (hit.matched) {
      // ── Anemia: resolve to the appropriate code based on cause context ──
      if (rule.code === 'ANEMIA_TBD') {
        const ckdNearby = /\b(?:ckd|chronic\s+kidney\s+disease|esrd|renal\s+(?:failure|insufficiency)|dialysis|gfr\s*<)/i.test(corpus);
        const chemoNearby = detectActiveTreatment(corpus);
        const irondef = /\biron\s+deficien/i.test(corpus);

        let resolved = { code: 'D64.9', description: 'Anemia, unspecified' };
        if (ckdNearby) {
          resolved = { code: 'D63.1', description: 'Anemia in chronic kidney disease' };
        } else if (chemoNearby) {
          resolved = { code: 'D64.81', description: 'Anemia due to antineoplastic chemotherapy' };
        } else if (irondef) {
          resolved = { code: 'D50.9', description: 'Iron deficiency anemia, unspecified' };
        }

        if (!seen.has(resolved.code)) {
          codes.push({
            code: resolved.code,
            description: resolved.description,
            confidence: 0.75,
            evidence: hit.evidence,
            primary: false,
          });
          seen.add(resolved.code);
        }
        continue;
      }

      codes.push({
        code: rule.code,
        description: rule.description,
        confidence: 0.8,
        evidence: hit.evidence,
        primary: false,
      });
      seen.add(rule.code);
    }
  }

  return codes;
}

/**
 * Decide new-patient vs established-patient E/M code series.
 *
 * CMS definition (key point): "new" vs "established" is purely about whether
 * the patient has received *any* professional service from this provider /
 * group in the past 3 years. It is INDEPENDENT of the note structure.
 *
 * - 99202–99205 (new):         No prior contact within 3 years
 * - 99212–99215 (established): Any prior contact within 3 years
 *
 * The selected output format alone can't tell us which applies — a
 * "Consultation" note structure is used for both first-time consults AND
 * for follow-up consults from referring providers. A "History and Physical"
 * is sometimes documented for established patients changing therapy lines.
 *
 * Decision rule:
 *   1. Follow Up Note / A&P-only → always established (those formats imply
 *      a return visit by definition).
 *   2. H&P / Consultation       → default to established. Override to new
 *      ONLY when the corpus contains an explicit new-patient signal.
 *
 * Defaulting to established is the audit-safer choice — billing a new-patient
 * code without documentation supporting first-time contact is a compliance
 * risk. Physicians can override the system's call manually if needed.
 */
function isNewPatientEncounter(format: OutputFormat | undefined, corpus: string): boolean {
  // Follow-up structured formats imply established by definition
  if (format === 'Follow Up Note' || format === 'Assessment and Plan Only') return false;

  // Established-patient signals — ONLY phrases that unambiguously assert
  // prior contact with THIS specific practice. Ambiguous phrases like:
  //   "continues on therapy"     ← could be non-cancer meds started elsewhere
  //   "follow-up visit"          ← often used for a scheduled FUTURE visit
  //   "follow-up appointment"    ← same
  //   "returning for X"          ← could be interpreted broadly
  // are deliberately EXCLUDED. They were misclassifying genuinely new
  // consultations as established because oncology plans almost always
  // contain a "return for follow-up in N weeks" line.
  const established: RegExp[] = [
    /\bestablished\s+patient\b/i,
    // "at / since our (last|prior|previous) visit" — asserts prior contact
    /\bsince\s+(?:our\s+)?(?:last|prior|previous)\s+(?:visit|encounter|appointment|discussion)\b/i,
    /\bat\s+(?:our\s+)?(?:last|prior|previous)\s+(?:visit|encounter|appointment)\b/i,
    /\bsince\s+(?:our\s+)?last\s+(?:evaluation|meeting)\b/i,
    // "seen (previously|prior) in / by our office / clinic / practice"
    /\bseen\s+(?:previously|prior)\s+(?:by|in)\s+(?:our|this|the)\s+(?:office|clinic|practice)/i,
    // "our (last|most recent) (visit|evaluation|encounter)"
    /\bour\s+(?:last|most\s+recent)\s+(?:visit|evaluation|encounter|discussion)\b/i,
    // "returned to (our|this) clinic today" — asserts prior contact
    /\breturned\s+to\s+(?:our|this|the)\s+(?:clinic|office|practice)\s+today\b/i,
    // "return visit" as a stand-alone noun phrase (not "return for X in N weeks")
    /\breturn\s+visit\b/i,
    /\breturn\s+consult(?:ation)?\b/i,
    // "interval history" from a prior encounter here
    /\binterval\s+(?:visit|encounter|history)\b/i,
    // "here (today) for follow-up" / "presents for follow-up" — describes THIS visit
    /\bhere\s+(?:today\s+)?for\s+follow[- ]?up\b/i,
    /\bpresents\s+(?:today\s+)?for\s+follow[- ]?up\b/i,
    // Cycle-N or C1D1 notation — implies treatment started with this practice
    /\bon\s+cycle\s+\d+\b/i,
    /\bcycle\s+\d+\s+day\s+\d+/i,
    /\bc\d+d\d+\b/i,
    // Continues on ONCOLOGY-specific therapy (must be clearly antineoplastic)
    /\bcontinues\s+(?:on|with)\s+(?:cycle\s+\d+|chemotherapy|immunotherapy|maintenance\s+(?:chemo|immuno|therapy)|his\s+(?:chemo|immuno|regimen)|her\s+(?:chemo|immuno|regimen))/i,
  ];
  if (established.some((p) => p.test(corpus))) return false;

  // New-patient signals — expanded to cover common new-consult dictation.
  const newPatient: RegExp[] = [
    /\bnew\s+patient\b/i,
    /\bnew\s+consult(?:ation)?\b/i,
    /\binitial\s+(?:consultation|consult|visit|evaluation|encounter|assessment)\b/i,
    /\bfirst[- ]?(?:time)?\s+(?:visit|consultation|consult|encounter|evaluation)\b/i,
    /\bfirst\s+visit\s+(?:to|with|in)\s+(?:our|this)\s+(?:office|clinic|practice)\b/i,
    /\bestablishing\s+care\b/i,
    /\b(?:newly|new(?:ly)?)\s+referred\b/i,
    /\breferred\s+(?:to|for)\s+(?:me|us|our|this|consultation|evaluation|management)\b/i,
    /\bpresents\s+for\s+(?:initial|new|consultation|evaluation)/i,
    /\bconsult(?:ation)?\s+(?:requested|requested\s+for|for\s+evaluation)/i,
    /\bnever\s+seen\s+(?:by|in)\s+(?:our|this)\s+(?:office|clinic|practice)\b/i,
    /\bno\s+prior\s+(?:records|visits|encounters)\s+(?:at|in)\s+(?:our|this)/i,
    /\bnewly\s+diagnosed\b.*\breferred/i,
    /\bfor\s+evaluation\s+and\s+management\s+of\b/i,
    /\bhere\s+today\s+(?:for|to\s+establish)/i,
  ];
  if (newPatient.some((p) => p.test(corpus))) return true;

  // Format-specific defaults:
  //   Consultation, H&P → NEW by default. These formats are typically used
  //     for a first encounter or referral; an established-patient
  //     consultation would normally surface at least one of the many
  //     established signals above (return for reassess, since last visit,
  //     continues on chemo, on cycle N, etc).
  //   Anything else → established (safer for billing).
  if (format === 'Consultation' || format === 'History and Physical') return true;
  return false;
}

function buildCptCodes(
  visitType: VisitType,
  mdm: MdmLevel,
  corpus: string,
  outputFormat?: OutputFormat,
  newPatientVisit?: boolean,
): CptCode[] {
  const cpts: CptCode[] = [];
  // Physician toggle wins if set; otherwise fall back to signal-based detection.
  const isNew =
    typeof newPatientVisit === 'boolean'
      ? newPatientVisit
      : isNewPatientEncounter(outputFormat, corpus);
  const emCode = isNew ? MDM_TO_EM_NEW[mdm] : MDM_TO_EM_ESTABLISHED[mdm];

  // Audit-trail rationale — makes the source of the decision explicit.
  const source =
    typeof newPatientVisit === 'boolean'
      ? `physician toggle set to "${newPatientVisit ? 'New patient' : 'Established'}"`
      : 'signal-based detection from note content';
  const seriesNote = isNew
    ? `New-patient series (99202–99205) selected — ${source}.`
    : `Established-patient series (99212–99215) selected — ${source}.`;
  const formatNote = outputFormat ? `Format: "${outputFormat}". ${seriesNote}` : seriesNote;

  cpts.push({
    code: emCode,
    description: `${
      isNew ? 'New patient' : 'Established patient'
    } outpatient E/M, ${mdm.toLowerCase()} MDM`,
    rationale: [
      `2 of 3 MDM elements at ${mdm} level support this code per CMS 2021/2023 outpatient E/M guidelines.`,
      formatNote,
    ]
      .filter(Boolean)
      .join(' '),
  });

  // G2211 add-on for ongoing complex chronic illness (oncology generally qualifies)
  if (mdm === 'Moderate' || mdm === 'High') {
    cpts.push({
      code: 'G2211',
      description:
        'Office/outpatient E/M visit complexity add-on for serious or complex chronic conditions',
      rationale:
        'Longitudinal management of a complex/serious chronic illness. Verify the note reflects ongoing care relationship.',
      addOn: true,
    });
  }

  // Infusion-related CPT cues
  if (/iv\s+(?:hydration|fluids)/i.test(corpus) || /\b(?:infusion|administered)\s+iv\b/i.test(corpus)) {
    if (/hydration/i.test(corpus)) {
      cpts.push({
        code: '96360',
        description: 'IV hydration, initial up to 1 hour',
        rationale: 'IV hydration referenced in the encounter.',
      });
    }
  }
  if (/chemotherapy.*infusion|infused\s+(?:carboplatin|cisplatin|paclitaxel|gemcitabine)/i.test(corpus)) {
    cpts.push({
      code: '96413',
      description: 'Chemotherapy administration, IV infusion technique, up to 1 hour, single agent',
      rationale: 'Cytotoxic chemotherapy administration referenced. Confirm exact agent and time before billing.',
    });
  }

  return cpts;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface AnalyzeNoteOptions {
  note: OncologyNote;
  transcript?: string;
  toxicities?: ToxicityFinding[];
  /** Selected output format — one input into the new-patient vs established series decision. */
  outputFormat?: OutputFormat;
  /**
   * Physician-provided new-patient/established status.
   *   true  → force new-patient series (99202–99205)
   *   false → force established series (99212–99215)
   *   undefined → fall back to signal-based detection
   *
   * This is the canonical control per CMS: "new" vs "established" is about
   * prior professional contact within 3 years, which the physician knows
   * with certainty and the LLM does not.
   */
  newPatientVisit?: boolean;
}

export function analyzeNoteForCoding(options: AnalyzeNoteOptions): CodingResult {
  const {
    note,
    transcript = '',
    toxicities = [],
    outputFormat,
    newPatientVisit,
  } = options;

  // Build a single corpus across all structured fields + free text.
  const corpus = [
    note.chief_complaint,
    note.history_present_illness,
    note.current_medications,
    note.physical_examination,
    note.lab_imaging_review,
    note.assessment,
    note.plan,
    note.follow_up,
    transcript,
  ]
    .filter(Boolean)
    .join('\n\n');

  const visitType = classifyVisitType(corpus, note);

  const problemItems = buildProblemComplexity(corpus, note);
  const dataItems = buildDataComplexity(corpus, note);
  const riskItems = buildRiskComplexity(corpus, note, toxicities);

  const pLevel = topLevel(problemItems);
  const dLevel = topLevel(dataItems);
  const rLevel = topLevel(riskItems);
  const mdm = determineMdm(pLevel, dLevel, rLevel);

  const icd10_codes = buildIcdCodes(corpus, note, toxicities);
  const cpt_codes = buildCptCodes(visitType, mdm, corpus, outputFormat, newPatientVisit);
  const documentation_gaps = buildDocumentationGaps(corpus, note, dataItems, riskItems);
  const compliance_flags = buildComplianceFlags(corpus, icd10_codes, cpt_codes, toxicities, mdm);

  const recommendedEm = cpt_codes[0]?.code || '99214';

  // Confidence: based on how many elements have direct evidence and how many gaps exist
  const evidenceWeight =
    (problemItems.length > 0 ? 0.25 : 0) +
    (dataItems.length > 0 ? 0.25 : 0) +
    (riskItems.length > 0 ? 0.3 : 0) +
    (icd10_codes.length > 0 ? 0.2 : 0);
  const gapPenalty = documentation_gaps.filter((g) => g.severity === 'critical').length * 0.15;
  const confidence = Math.max(0.2, Math.min(0.97, evidenceWeight - gapPenalty + 0.1));

  const coding_rationale = [
    `Visit classified as ${visitType}.`,
    `Problem complexity: ${pLevel}; Data complexity: ${dLevel}; Risk complexity: ${rLevel}.`,
    `Per CMS 2021/2023 outpatient E/M, MDM is determined by the second-highest of these three → ${mdm}.`,
    `Recommended E/M: ${recommendedEm}.`,
    documentation_gaps.length > 0
      ? `${documentation_gaps.length} documentation gap(s) identified — strengthen these to support audit defensibility.`
      : 'Documentation supports the recommended level.',
  ].join(' ');

  return {
    visit_type: visitType,
    mdm_level: mdm,
    recommended_em_code: recommendedEm,
    problem_complexity: problemItems,
    data_complexity: dataItems,
    risk_complexity: riskItems,
    icd10_codes,
    cpt_codes,
    documentation_gaps,
    compliance_flags,
    coding_rationale,
    confidence_score: Math.round(confidence * 100) / 100,
    engine_version: CODING_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Physician-readable summary helpers
// ---------------------------------------------------------------------------

export function buildCodingSummary(result: CodingResult): string {
  const lines: string[] = [];
  lines.push(`Visit type: ${result.visit_type}`);
  lines.push(`Recommended E/M: ${result.recommended_em_code} (${result.mdm_level} MDM)`);
  if (result.icd10_codes.length) {
    lines.push('Primary diagnosis: ' + result.icd10_codes[0].code + ' — ' + result.icd10_codes[0].description);
    if (result.icd10_codes.length > 1) {
      lines.push(
        'Secondary: ' +
          result.icd10_codes
            .slice(1)
            .map((c) => c.code)
            .join(', ')
      );
    }
  }
  if (result.cpt_codes.length > 1) {
    lines.push(
      'Additional CPT: ' +
        result.cpt_codes
          .slice(1)
          .map((c) => c.code)
          .join(', ')
    );
  }
  if (result.documentation_gaps.length) {
    lines.push(`Documentation gaps: ${result.documentation_gaps.length}`);
  }
  return lines.join('\n');
}
