// Grading scales, centering standards and the grade estimator.
// Pure functions only (no DOM), so everything here is unit tested.

/**
 * Grade steps per grading company. `value` places every step on one shared
 * axis so "Pristine"/"Black Label" can sit just above a plain 10.
 * `centering` rows are [grade value, max worst-side % front, max worst-side % back].
 */
export const COMPANIES = {
  PSA: {
    id: 'PSA',
    name: 'PSA',
    full: 'Professional Sports Authenticator',
    grades: [
      { key: '10', value: 10, label: 'GEM MT', name: 'Gem Mint' },
      { key: '9', value: 9, label: 'MINT', name: 'Mint' },
      { key: '8', value: 8, label: 'NM-MT', name: 'Near Mint–Mint' },
      { key: '7', value: 7, label: 'NM', name: 'Near Mint' },
      { key: '6', value: 6, label: 'EX-MT', name: 'Excellent–Mint' },
      { key: '5', value: 5, label: 'EX', name: 'Excellent' },
      { key: '4', value: 4, label: 'VG-EX', name: 'Very Good–Excellent' },
      { key: '3', value: 3, label: 'VG', name: 'Very Good' },
      { key: '2', value: 2, label: 'GOOD', name: 'Good' },
      { key: '1', value: 1, label: 'PR', name: 'Poor' },
    ],
    centering: [
      [10, 55, 75], [9, 60, 90], [8, 65, 90], [7, 70, 90], [6, 80, 90],
      [5, 85, 90], [4, 85, 90], [3, 90, 90], [2, 90, 90], [1, 100, 100],
    ],
  },
  BGS: {
    id: 'BGS',
    name: 'BGS',
    full: 'Beckett Grading Services',
    grades: [
      { key: '10BL', value: 10.5, label: 'BLACK LABEL', name: 'Black Label 10', tier: 'black' },
      { key: '10', value: 10, label: 'PRISTINE', name: 'Pristine 10', tier: 'gold' },
      { key: '9.5', value: 9.5, label: 'GEM MINT', name: 'Gem Mint', tier: 'gold' },
      { key: '9', value: 9, label: 'MINT', name: 'Mint' },
      { key: '8.5', value: 8.5, label: 'NM-MT+', name: 'Near Mint–Mint+' },
      { key: '8', value: 8, label: 'NM-MT', name: 'Near Mint–Mint' },
      { key: '7', value: 7, label: 'NEAR MINT', name: 'Near Mint' },
      { key: '6', value: 6, label: 'EX-MT', name: 'Excellent–Mint' },
      { key: '5', value: 5, label: 'EXCELLENT', name: 'Excellent' },
      { key: '4', value: 4, label: 'VG-EX', name: 'Very Good–Excellent' },
      { key: '3', value: 3, label: 'VERY GOOD', name: 'Very Good' },
      { key: '2', value: 2, label: 'GOOD', name: 'Good' },
      { key: '1', value: 1, label: 'POOR', name: 'Poor' },
    ],
    centering: [
      [10.5, 51, 55], [10, 51, 60], [9.5, 55, 60], [9, 60, 80], [8.5, 65, 90],
      [8, 70, 95], [7, 75, 95], [6, 80, 100], [5, 85, 100], [4, 90, 100],
      [3, 95, 100], [2, 100, 100], [1, 100, 100],
    ],
  },
  CGC: {
    id: 'CGC',
    name: 'CGC',
    full: 'Certified Guaranty Company',
    grades: [
      { key: '10P', value: 10.3, label: 'PRISTINE', name: 'Pristine 10', tier: 'gold' },
      { key: '10', value: 10, label: 'GEM MINT', name: 'Gem Mint 10' },
      { key: '9.5', value: 9.5, label: 'MINT+', name: 'Mint+' },
      { key: '9', value: 9, label: 'MINT', name: 'Mint' },
      { key: '8.5', value: 8.5, label: 'NM/MINT+', name: 'Near Mint/Mint+' },
      { key: '8', value: 8, label: 'NM/MINT', name: 'Near Mint/Mint' },
      { key: '7', value: 7, label: 'NEAR MINT', name: 'Near Mint' },
      { key: '6', value: 6, label: 'EX/NM', name: 'Excellent/Near Mint' },
      { key: '5', value: 5, label: 'EXCELLENT', name: 'Excellent' },
      { key: '4', value: 4, label: 'VG/EX', name: 'Very Good/Excellent' },
      { key: '3', value: 3, label: 'VERY GOOD', name: 'Very Good' },
      { key: '2', value: 2, label: 'GOOD', name: 'Good' },
      { key: '1', value: 1, label: 'POOR', name: 'Poor' },
    ],
    centering: [
      [10.3, 51, 55], [10, 55, 75], [9.5, 57, 80], [9, 60, 90], [8.5, 62, 90],
      [8, 65, 90], [7, 70, 90], [6, 80, 90], [5, 85, 90], [4, 85, 90],
      [3, 90, 90], [2, 90, 100], [1, 100, 100],
    ],
  },
  SGC: {
    id: 'SGC',
    name: 'SGC',
    full: 'Sportscard Guaranty',
    grades: [
      { key: '10P', value: 10.3, label: 'PRISTINE', name: 'Pristine 10', tier: 'gold' },
      { key: '10', value: 10, label: 'GEM MINT', name: 'Gem Mint 10' },
      { key: '9.5', value: 9.5, label: 'MINT+', name: 'Mint+' },
      { key: '9', value: 9, label: 'MINT', name: 'Mint' },
      { key: '8.5', value: 8.5, label: 'NM-MT+', name: 'Near Mint–Mint+' },
      { key: '8', value: 8, label: 'NM-MT', name: 'Near Mint–Mint' },
      { key: '7', value: 7, label: 'NEAR MINT', name: 'Near Mint' },
      { key: '6', value: 6, label: 'EX-NM', name: 'Excellent–Near Mint' },
      { key: '5', value: 5, label: 'EXCELLENT', name: 'Excellent' },
      { key: '4', value: 4, label: 'VG-EX', name: 'Very Good–Excellent' },
      { key: '3', value: 3, label: 'VERY GOOD', name: 'Very Good' },
      { key: '2', value: 2, label: 'GOOD', name: 'Good' },
      { key: '1', value: 1, label: 'POOR', name: 'Poor' },
    ],
    centering: [
      [10.3, 51, 55], [10, 55, 70], [9.5, 57, 75], [9, 60, 80], [8.5, 62, 85],
      [8, 65, 90], [7, 70, 90], [6, 75, 90], [5, 80, 90], [4, 85, 90],
      [3, 90, 90], [2, 95, 100], [1, 100, 100],
    ],
  },
};

export const COMPANY_IDS = Object.keys(COMPANIES);

/** What each PSA grade means, in plain Swedish. Shown in the grade sheet. */
export const GRADE_GUIDE = {
  10: 'Praktiskt taget perfekt. Fyra skarpa hörn, inga vita kanter, full glans och ren yta. Centrering inom 55/45 fram och 75/25 bak.',
  9: 'Superbt skick med en enda liten brist – t.ex. en mikroskopisk vit prick på en kant eller en liten tryckdefekt. Centrering inom 60/40 fram.',
  8: 'Ser perfekt ut på avstånd men har små brister vid närmare granskning: lätt vithet på ett par hörn eller kanter. Centrering inom 65/35.',
  7: 'Lätt slitage syns vid granskning – vithet på flera hörn, små repor eller printlinjer. Glansen finns kvar. Centrering inom 70/30.',
  6: 'Synligt slitage: lätt rundade hörn, märkbar kantvithet och lätta repor. Inga veck. Centrering inom 80/20.',
  5: 'Tydligare rundning av hörn, kantslitage och ytslitage. Mycket lätta veck kan förekomma. Centrering inom 85/15.',
  4: 'Rundade hörn, tydligt ytslitage och lätta veck. Centrering inom 85/15.',
  3: 'Kraftigt slitna hörn och kanter, glansen till stor del borta och synliga veck.',
  2: 'Mycket slitet med flera veck, repor och fläckar – men kortet är helt.',
  1: 'Extremt slitet: stora veck, bitar som saknas, fläckar eller skrivet på.',
};

/** Self-assessment questions. Option values are subgrades on a 5–10 scale. */
export const CONDITION_QUESTIONS = [
  {
    id: 'corners',
    title: 'Hörn',
    hint: 'Titta på alla fyra hörn, gärna med ficklampa. Ser du vita prickar eller rundning?',
    options: [
      { value: 10, label: 'Knivskarpa', desc: 'Inga vita prickar alls, inte ens på nära håll' },
      { value: 9.5, label: 'Nästan perfekta', desc: 'En mikroskopisk prick syns bara på mycket nära håll' },
      { value: 8.5, label: 'Lätt slitage', desc: 'Små vita prickar på ett eller två hörn' },
      { value: 7, label: 'Synligt slitage', desc: 'Vithet på flera hörn' },
      { value: 5, label: 'Rundade', desc: 'Tydligt rundade eller trubbiga hörn' },
    ],
  },
  {
    id: 'edges',
    title: 'Kanter',
    hint: 'Vänd på kortet – vithet syns oftast på baksidans blå kant.',
    options: [
      { value: 10, label: 'Perfekta', desc: 'Inga hack eller vita märken någonstans' },
      { value: 9.5, label: 'Minimal vithet', desc: 'Enstaka mycket små prickar på baksidan' },
      { value: 8.5, label: 'Lätt vithet', desc: 'Några vita prickar eller korta streck' },
      { value: 7, label: 'Tydlig vithet', desc: 'Vita partier längs flera kanter' },
      { value: 5, label: 'Kraftigt slitna', desc: 'Hack, flisor eller mycket vithet' },
    ],
  },
  {
    id: 'surface',
    title: 'Yta',
    hint: 'Luta kortet mot en lampa och leta efter repor, märken, intryck och printlinjer.',
    options: [
      { value: 10, label: 'Felfri', desc: 'Full glans – inga repor, prickar eller märken' },
      { value: 9.5, label: 'Nästan felfri', desc: 'En mycket liten prick eller hårfin repa' },
      { value: 8.5, label: 'Lätta defekter', desc: 'Några lätta repor eller en printlinje' },
      { value: 7, label: 'Synliga defekter', desc: 'Flera repor, märken eller matta partier' },
      { value: 5, label: 'Slitage', desc: 'Tydliga repor, fläckar eller nötning' },
    ],
  },
];

/** Defects that put a hard ceiling on the grade regardless of everything else. */
export const DEFECT_FLAGS = [
  { id: 'crease', label: 'Litet veck eller böj', desc: 'Även ett hårfint veck syns för graderaren', cap: 5 },
  { id: 'heavyCrease', label: 'Tydligt veck', desc: 'Veck som syns tydligt från båda sidor', cap: 3 },
  { id: 'dent', label: 'Buckla eller intryck', desc: 'T.ex. märke efter nagel eller penna', cap: 6 },
  { id: 'stain', label: 'Fläck eller fuktskada', desc: 'Missfärgning, vågig yta eller vattenmärke', cap: 4 },
];

/** Back-centering answers (worst-side %). The back is hard to photograph straight. */
export const BACK_CENTERING = [
  { value: 60, label: 'Välcentrerad', desc: 'Ungefär lika breda blå kanter (upp till ca 60/40)' },
  { value: 75, label: 'Något förskjuten', desc: 'En kant är märkbart bredare (upp till ca 75/25)' },
  { value: 90, label: 'Tydligt förskjuten', desc: 'En kant är mycket smal (upp till ca 90/10)' },
  { value: 95, label: 'Mycket förskjuten', desc: 'Kanten nästan borta på ena sidan' },
];

/**
 * Worst-side percentage for two opposite border widths.
 * (12, 8) → 60, which reads as 60/40.
 * @param {number} a
 * @param {number} b
 * @returns {number|null}
 */
export function worstSide(a, b) {
  if (!(a >= 0) || !(b >= 0)) return null;
  const total = a + b;
  if (!(total > 0)) return null;
  return (Math.max(a, b) / total) * 100;
}

/**
 * Format a worst-side percentage as "60/40".
 * @param {number|null} pct
 * @returns {string}
 */
export function formatRatio(pct) {
  if (pct == null || !Number.isFinite(pct)) return '–';
  const big = Math.min(100, Math.max(50, Math.round(pct)));
  return `${big}/${100 - big}`;
}

/**
 * Highest grade value the centering allows for a company.
 * @param {string} companyId
 * @param {number|null} front worst-side % on the front (null = unknown)
 * @param {number|null} back worst-side % on the back (null = unknown)
 * @returns {number}
 */
export function centeringCap(companyId, front, back) {
  const table = COMPANIES[companyId]?.centering ?? COMPANIES.PSA.centering;
  for (const [grade, maxFront, maxBack] of table) {
    const okFront = front == null || front <= maxFront + 1e-9;
    const okBack = back == null || back <= maxBack + 1e-9;
    if (okFront && okBack) return grade;
  }
  return 1;
}

/**
 * Centering expressed as a BGS-style subgrade (10 … 2).
 * @param {number|null} front
 * @param {number|null} back
 * @returns {number}
 */
export function centeringSubgrade(front, back) {
  return Math.min(10, centeringCap('BGS', front, back));
}

/**
 * Probability of landing on each step, as a discretised normal distribution
 * around `center`, clipped at `cap`. `weights` damps rare top labels.
 * @param {{key:string,value:number}[]} steps
 * @param {number} center
 * @param {number} sigma
 * @param {number} cap
 * @param {Record<string, number>} [weights]
 * @returns {{key:string,value:number,p:number}[]}
 */
export function gradeDistribution(steps, center, sigma, cap, weights = {}) {
  const raw = steps.map((s) => {
    if (s.value > cap + 1e-9) return 0;
    const z = (s.value - center) / sigma;
    return Math.exp(-0.5 * z * z) * (weights[s.key] ?? 1);
  });
  let sum = raw.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) {
    // Everything was clipped: all mass on the highest step still allowed.
    const idx = steps.findIndex((s) => s.value <= cap + 1e-9);
    raw.fill(0);
    raw[idx === -1 ? steps.length - 1 : idx] = 1;
    sum = 1;
  }
  return steps.map((s, i) => ({ key: s.key, value: s.value, p: raw[i] / sum }));
}

/** Most likely step of a distribution. */
export function mostLikely(dist) {
  return dist.reduce((best, d) => (d.p > best.p ? d : best), dist[0]);
}

/**
 * The narrowest contiguous run of steps around the most likely one that
 * covers at least `mass` of the probability. Returns [low key, high key].
 */
export function likelyRange(dist, mass = 0.8) {
  const sorted = [...dist].sort((a, b) => b.value - a.value);
  let lo = sorted.indexOf(mostLikely(sorted));
  let hi = lo;
  let acc = sorted[lo].p;
  while (acc < mass && (lo > 0 || hi < sorted.length - 1)) {
    const up = lo > 0 ? sorted[lo - 1].p : -1;
    const down = hi < sorted.length - 1 ? sorted[hi + 1].p : -1;
    if (up >= down) acc += sorted[--lo].p;
    else acc += sorted[++hi].p;
  }
  return [sorted[hi].key, sorted[lo].key];
}

const DEFAULT_SUB = 9.5;

/**
 * BGS-style overall from four subgrades: the average rounded to the nearest
 * half grade, never more than one grade above the weakest subgrade.
 */
export function bgsOverall(subs) {
  const lo = Math.min(...subs);
  const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
  if (subs.every((s) => s >= 10)) return 10.5;
  if (lo >= 9.5 && avg >= 9.75) return 10;
  return Math.min(Math.round(avg * 2) / 2, 9.5, lo + 1);
}

/**
 * Estimate the likely grade at every company.
 *
 * @param {object} input
 * @param {number|null} [input.front]   worst-side % front, e.g. 58 (null = not measured)
 * @param {number|null} [input.back]    worst-side % back
 * @param {number} [input.corners]      subgrade 5–10 (see CONDITION_QUESTIONS)
 * @param {number} [input.edges]
 * @param {number} [input.surface]
 * @param {string[]} [input.flags]      ids from DEFECT_FLAGS
 * @returns {Record<string, {center:number, cap:number, dist:object[], likely:object, range:string[]}> & {confidence:string, subgrades:object}}
 */
export function estimateGrades(input = {}) {
  const answered = ['corners', 'edges', 'surface'].filter((k) => input[k] != null).length;
  const corners = input.corners ?? DEFAULT_SUB;
  const edges = input.edges ?? DEFAULT_SUB;
  const surface = input.surface ?? DEFAULT_SUB;
  const front = input.front ?? null;
  const back = input.back ?? null;
  const flags = input.flags ?? [];

  const flagCap = Math.min(
    10.5,
    ...flags.map((id) => DEFECT_FLAGS.find((f) => f.id === id)?.cap ?? 10.5),
  );

  const subs = [corners, edges, surface];
  const lo = Math.min(...subs);
  const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
  // Graders let the weakest area dominate.
  const condition = 0.65 * lo + 0.35 * avg;

  // Wider spread when we know less.
  let sigma = 0.45 + (3 - answered) * 0.18 + (front == null ? 0.25 : 0);
  sigma = Math.min(sigma, 1.4);

  const centSub = centeringSubgrade(front ?? 52, back);
  const allTen = subs.every((s) => s >= 10) && centSub >= 10;
  const out = {};

  for (const id of COMPANY_IDS) {
    const company = COMPANIES[id];
    const cap = Math.min(centeringCap(id, front, back), flagCap);
    let center;
    let weights = {};
    if (id === 'BGS') {
      center = Math.min(bgsOverall([centSub, ...subs]), cap) - 0.15;
      weights = { '10BL': allTen ? 0.5 : 0.03, 10: lo >= 9.5 ? 0.6 : 0.15 };
    } else if (id === 'PSA') {
      center = Math.min(condition, cap) - 0.25;
      weights = { 10: 0.85 };
    } else {
      center = Math.min(condition, cap) - 0.2;
      weights = { '10P': allTen ? 0.5 : 0.12 };
    }
    const dist = gradeDistribution(company.grades, center, sigma, cap, weights);
    out[id] = { center, cap, dist, likely: mostLikely(dist), range: likelyRange(dist) };
  }

  out.subgrades = { centering: centSub, corners, edges, surface };
  out.confidence = answered === 3 && front != null ? 'hög' : answered >= 2 || front != null ? 'medel' : 'låg';
  return out;
}

/**
 * Expected value of grading given a distribution and a price per grade key.
 * @param {{key:string,p:number}[]} dist
 * @param {(key:string)=>number|null} priceOf
 * @param {number} [cost] grading cost incl. shipping, same currency as priceOf
 * @returns {{gross:number, net:number}}
 */
export function expectedValue(dist, priceOf, cost = 0) {
  let gross = 0;
  for (const d of dist) gross += d.p * (priceOf(d.key) ?? 0);
  return { gross, net: gross - cost };
}

/**
 * Is grading worth it? Compares the expected net value with selling raw.
 * @returns {{level:'good'|'maybe'|'bad', gain:number}}
 */
export function gradingVerdict({ rawValue, net, cost }) {
  const gain = net - (rawValue ?? 0);
  if (gain > Math.max((rawValue ?? 0) * 0.15, cost * 0.5)) return { level: 'good', gain };
  if (gain > 0) return { level: 'maybe', gain };
  return { level: 'bad', gain };
}

/**
 * Lowest grade at which grading at least pays for itself.
 * @returns {string|null} grade key, or null if not even the top grade does
 */
export function breakEvenGrade(steps, priceOf, rawValue, cost) {
  const ascending = [...steps].sort((a, b) => a.value - b.value);
  for (const s of ascending) {
    const price = priceOf(s.key);
    if (price != null && price - cost >= (rawValue ?? 0)) return s.key;
  }
  return null;
}

/**
 * How worn a card looks at a given grade value, for the illustrated slabs.
 * Every field runs 0 (pristine) … 1 (heavily worn).
 */
export function wearForGrade(value) {
  const v = Math.max(1, Math.min(10.5, value));
  const t = (10 - Math.min(v, 10)) / 9; // 0 at 10, 1 at 1
  return {
    corners: v >= 9.5 ? 0 : Math.min(1, 0.12 + t * 1.1),
    edges: v >= 9 ? 0 : Math.min(1, 0.08 + t * 1.05),
    scratches: v >= 8 ? 0 : Math.min(1, t * 1.2),
    crease: v <= 3 ? 2 : v <= 5 ? 1 : 0,
    dull: v <= 4 ? Math.min(0.35, (5 - v) * 0.09) : 0,
  };
}
