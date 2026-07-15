// Nearby clinical trials helper.
// Currently returns mock data so the UI can be exercised end-to-end.
// Designed to swap in a ClinicalTrials.gov / internal DB call later without
// touching the call sites — the public signature stays:
//   fetchNearbyTrials(query, lat, lng) => Promise<NearbyTrial[]>

export interface NearbyTrial {
  title: string;
  nct: string;
  institution: string;
  city: string;
  state: string;
  /** Straight-line miles from user. */
  distance_miles: number;
  status: 'Recruiting' | 'Active, not recruiting' | 'Enrolling by invitation' | 'Not yet recruiting';
  phase?: string;
  conditions?: string[];
  url: string;
  /** Anchor coordinates for the institution (used for distance + future map plotting). */
  lat: number;
  lng: number;
}

/** Curated mock catalog: real NCT IDs + real US cancer-center coordinates. */
const MOCK_CATALOG: Omit<NearbyTrial, 'distance_miles'>[] = [
  {
    title: 'Phase II PARP Inhibitor Study in BRCA-Mutated Metastatic Pancreatic Cancer',
    nct: 'NCT04673448',
    institution: 'University of Kentucky Markey Cancer Center',
    city: 'Lexington',
    state: 'KY',
    status: 'Recruiting',
    phase: 'Phase II',
    conditions: ['Pancreatic Adenocarcinoma', 'BRCA1/2'],
    url: 'https://clinicaltrials.gov/study/NCT04673448',
    lat: 38.0406,
    lng: -84.5037,
  },
  {
    title: 'KRAS G12C Inhibitor in Pretreated NSCLC',
    nct: 'NCT04185883',
    institution: 'Memorial Sloan Kettering Cancer Center',
    city: 'New York',
    state: 'NY',
    status: 'Recruiting',
    phase: 'Phase III',
    conditions: ['Non-Small Cell Lung Cancer', 'KRAS G12C'],
    url: 'https://clinicaltrials.gov/study/NCT04185883',
    lat: 40.7644,
    lng: -73.9555,
  },
  {
    title: 'Adjuvant Osimertinib in EGFR-Mutated Resected Stage IB–IIIA NSCLC',
    nct: 'NCT02511106',
    institution: 'Dana-Farber Cancer Institute',
    city: 'Boston',
    state: 'MA',
    status: 'Active, not recruiting',
    phase: 'Phase III',
    conditions: ['NSCLC', 'EGFR'],
    url: 'https://clinicaltrials.gov/study/NCT02511106',
    lat: 42.3373,
    lng: -71.1067,
  },
  {
    title: 'Consolidation Durvalumab After Chemoradiation in Stage III NSCLC',
    nct: 'NCT02125461',
    institution: 'MD Anderson Cancer Center',
    city: 'Houston',
    state: 'TX',
    status: 'Active, not recruiting',
    phase: 'Phase III',
    conditions: ['Stage III NSCLC'],
    url: 'https://clinicaltrials.gov/study/NCT02125461',
    lat: 29.7070,
    lng: -95.3975,
  },
  {
    title: 'Trastuzumab Deruxtecan in HER2-Low Metastatic Breast Cancer',
    nct: 'NCT03734029',
    institution: 'Stanford Cancer Institute',
    city: 'Stanford',
    state: 'CA',
    status: 'Recruiting',
    phase: 'Phase III',
    conditions: ['Breast Cancer', 'HER2-Low'],
    url: 'https://clinicaltrials.gov/study/NCT03734029',
    lat: 37.4275,
    lng: -122.1697,
  },
  {
    title: 'CAR-T Cell Therapy in Relapsed/Refractory Multiple Myeloma',
    nct: 'NCT03548207',
    institution: 'University of Pennsylvania Abramson Cancer Center',
    city: 'Philadelphia',
    state: 'PA',
    status: 'Recruiting',
    phase: 'Phase II',
    conditions: ['Multiple Myeloma'],
    url: 'https://clinicaltrials.gov/study/NCT03548207',
    lat: 39.9489,
    lng: -75.1953,
  },
  {
    title: 'Adjuvant Pembrolizumab in Resected High-Risk Stage II–IIIA Melanoma',
    nct: 'NCT03553836',
    institution: 'Mayo Clinic',
    city: 'Rochester',
    state: 'MN',
    status: 'Recruiting',
    phase: 'Phase III',
    conditions: ['Cutaneous Melanoma'],
    url: 'https://clinicaltrials.gov/study/NCT03553836',
    lat: 44.0225,
    lng: -92.4663,
  },
  {
    title: 'FOLFIRINOX Plus PARP Inhibitor in BRCA-Mutated Pancreatic Cancer',
    nct: 'NCT04150042',
    institution: 'Johns Hopkins Sidney Kimmel Comprehensive Cancer Center',
    city: 'Baltimore',
    state: 'MD',
    status: 'Recruiting',
    phase: 'Phase II',
    conditions: ['Pancreatic Cancer', 'BRCA1/2', 'PARP'],
    url: 'https://clinicaltrials.gov/study/NCT04150042',
    lat: 39.2992,
    lng: -76.5933,
  },
  {
    title: 'Enfortumab Vedotin + Pembrolizumab in Advanced Urothelial Cancer',
    nct: 'NCT04223856',
    institution: 'University of California San Francisco',
    city: 'San Francisco',
    state: 'CA',
    status: 'Active, not recruiting',
    phase: 'Phase III',
    conditions: ['Urothelial Carcinoma', 'Bladder Cancer'],
    url: 'https://clinicaltrials.gov/study/NCT04223856',
    lat: 37.7634,
    lng: -122.4577,
  },
  {
    title: 'CDK4/6 Inhibitor in HR+/HER2- Early-Stage Breast Cancer',
    nct: 'NCT03701334',
    institution: 'Cleveland Clinic Taussig Cancer Institute',
    city: 'Cleveland',
    state: 'OH',
    status: 'Recruiting',
    phase: 'Phase III',
    conditions: ['Breast Cancer', 'HR+/HER2-'],
    url: 'https://clinicaltrials.gov/study/NCT03701334',
    lat: 41.5039,
    lng: -81.6219,
  },
];

/** Haversine distance in miles between two coordinates. */
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Common oncology terms that appear in nearly every trial — exclude from scoring
// so a generic word like "cancer" doesn't make every trial look relevant.
const STOPWORDS = new Set<string>([
  'cancer',
  'cancers',
  'tumor',
  'tumour',
  'tumors',
  'tumours',
  'carcinoma',
  'malignancy',
  'malignant',
  'neoplasm',
  'oncology',
  'patient',
  'patients',
  'metastatic',
  'metastasis',
  'metastases',
  'advanced',
  'recurrent',
  'refractory',
  'relapsed',
  'progression',
  'stage',
  'grade',
  'treatment',
  'therapy',
  'systemic',
  'adjuvant',
  'neoadjuvant',
  'first',
  'second',
  'third',
  'line',
  'study',
  'phase',
  'trial',
  'trials',
  'with',
  'and',
  'the',
  'positive',
  'negative',
  'mutation',
  'mutations',
  'mutated',
  'wild',
  'type',
  'biomarker',
  'biomarkers',
  'unresectable',
  'resectable',
  'newly',
  'diagnosed',
  'high',
  'risk',
]);

/**
 * Score how relevant a catalog entry is to the user's free-text query.
 * Only counts *specific* tokens (not stopwords) to avoid false positives
 * where a generic word like "cancer" matches every oncology trial.
 */
function relevance(query: string, t: Omit<NearbyTrial, 'distance_miles'>): number {
  if (!query.trim()) return 0;
  const haystack = [t.title, t.conditions?.join(' ') || '', t.phase || '']
    .join(' ')
    .toLowerCase();

  // Only consider tokens >= 3 chars that are NOT in the stopword list
  const queryTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  if (queryTokens.length === 0) return 0;

  let score = 0;
  for (const tok of queryTokens) {
    if (haystack.includes(tok)) score += 1;
  }
  return score;
}

export interface NearbyTrialsResult {
  trials: NearbyTrial[];
  /** True when no trials matched the initial radius and we expanded to all relevant trials. */
  expandedRadius: boolean;
  /** Disease string used for relevance scoring. */
  diseaseUsed: string;
}

export interface FetchNearbyTrialsOptions {
  /** Free-text query, used for fallback scoring. */
  query: string;
  /** Normalized disease term — preferred for relevance scoring. */
  disease?: string;
  /** User latitude. If omitted, uses geographic center of US for distance ranking. */
  latitude?: number;
  /** User longitude. */
  longitude?: number;
  maxResults?: number;
  /** Initial search radius in miles. Defaults to 200. */
  radiusMiles?: number;
}

// Geographic center of the contiguous US — used as a fallback when no geolocation
const US_CENTER = { lat: 39.5, lng: -98.5 };

/**
 * Fetch nearby clinical trials.
 *
 * Currently returns mock data. To swap in a real source later:
 *   1. Replace the body with a fetch to ClinicalTrials.gov / internal DB
 *   2. Geocode each trial's locations or use ones with known coordinates
 *   3. Keep the same return shape — call sites won't need to change
 */
export async function fetchNearbyTrials(
  opts: FetchNearbyTrialsOptions
): Promise<NearbyTrialsResult> {
  const {
    query,
    disease,
    latitude,
    longitude,
    maxResults = 8,
    radiusMiles = 200,
  } = opts;

  // Network-feel delay so loading spinner is visible
  await new Promise((r) => setTimeout(r, 500));

  const lat = latitude ?? US_CENTER.lat;
  const lng = longitude ?? US_CENTER.lng;
  // Prefer the parsed/normalized disease over raw query for relevance scoring
  const scoringText = (disease && disease.trim()) || query;

  const scored = MOCK_CATALOG.map((t) => ({
    trial: t,
    distance: haversineMiles(lat, lng, t.lat, t.lng),
    rel: relevance(scoringText, t),
  }));

  // Disease-relevant trials only
  const relevant = scored.filter((s) => s.rel > 0);

  // Step 1: try inside the radius
  let pool = relevant.filter((s) => s.distance <= radiusMiles);
  let expanded = false;

  // Step 2: if empty, expand to all relevant trials regardless of distance
  if (pool.length === 0 && relevant.length > 0) {
    pool = relevant;
    expanded = true;
  }

  // Step 3: if no disease relevance at all and user provided no specific term,
  // show all trials sorted by distance (so the screen never goes blank).
  if (pool.length === 0) {
    pool = scored;
    expanded = true;
  }

  pool.sort((a, b) => {
    if (b.rel !== a.rel) return b.rel - a.rel;
    return a.distance - b.distance;
  });

  return {
    trials: pool.slice(0, maxResults).map(({ trial, distance }) => ({
      ...trial,
      distance_miles: Math.round(distance),
    })),
    expandedRadius: expanded,
    diseaseUsed: scoringText,
  };
}
