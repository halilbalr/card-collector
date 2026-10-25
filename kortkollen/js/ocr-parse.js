// Turns noisy OCR text from a card photo into search hints, and ranks the
// candidate cards that come back. Pure functions, unit tested.

// Characters OCR commonly confuses with digits.
const DIGIT_FIX = {
  O: '0', o: '0', Q: '0', D: '0', U: '0', C: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1', L: '1', J: '1', ']': '1', '[': '1',
  Z: '2', z: '2',
  E: '3',
  A: '4', h: '4',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

// Numbered sub-sets whose card numbers keep a letter prefix (TG05/TG30 …).
const NUMBER_PREFIXES = ['TG', 'GG', 'SV', 'RC', 'SH'];

const toDigits = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : DIGIT_FIX[ch] ?? '')).join('');

/** "025" → "25", "TG05" → "TG5", "SWSH050" → "SWSH50". Used for comparisons only. */
export function normalizeNumber(n) {
  return String(n ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^([A-Z]*)0+(\d)/, '$1$2');
}

/**
 * Find the collector number in OCR text, e.g. "SVI EN 198/198" → {number:'198', total:198, setCode:'SVI'}.
 * @param {string} text
 * @returns {{number:string,total:number|null,setCode:string|null,promo:boolean}|null}
 */
export function parseNumber(text) {
  if (!text) return null;
  const t = String(text).replace(/[⁄∕]/g, '/');
  const setCode = parseSetCode(t);

  const candidates = [];
  const re = /([A-Za-z0-9|!\][]{1,6})\s*[/\\]\s*([A-Za-z0-9|!\][]{2,6})/g;
  let m;
  while ((m = re.exec(t))) {
    // Letters glued in front ("EN198" from "SVI EN 198") are not part of the number.
    const left = /^(TG|GG|SV|RC|SH)/i.test(m[1]) ? m[1] : m[1].replace(/^[A-Za-z]{2,}(?=[0-9])/, '');
    const right = m[2];
    const prefix = NUMBER_PREFIXES.find((p) => left.toUpperCase().startsWith(p) && right.toUpperCase().startsWith(p));
    const leftDigits = toDigits(prefix ? left.slice(prefix.length) : left);
    const rightDigits = toDigits(prefix ? right.slice(prefix.length) : right);
    if (!leftDigits || leftDigits.length > 3 || rightDigits.length < 2 || rightDigits.length > 3) continue;
    const num = parseInt(leftDigits, 10);
    const total = parseInt(rightDigits, 10);
    if (!(total >= 10 && total <= 400) || !(num >= 0)) continue;
    // Secret rares go past the printed total, but not absurdly far.
    if (num > total + 160) continue;
    // Prefer clean matches: count how many characters had to be "fixed".
    const fixes = [...(left + right)].filter((ch) => !/\d/.test(ch)).length - (prefix ? prefix.length * 2 : 0);
    candidates.push({
      number: prefix ? `${prefix}${leftDigits.padStart(2, '0')}` : String(num),
      total: prefix ? null : total,
      fixes,
    });
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.fixes - b.fixes);
    const best = candidates[0];
    return { number: best.number, total: best.total, setCode, promo: false };
  }

  const promo = t.match(/\b(SWSH|SVP|SM|XY|BW|HGSS|DP|NP)\s*(?:EN\s*)?([0-9OIlSB]{2,3})\b/i);
  if (promo) {
    const digits = toDigits(promo[2]);
    const prefix = promo[1].toUpperCase();
    return {
      number: prefix === 'SVP' ? String(parseInt(digits, 10)) : `${prefix}${digits}`,
      total: null,
      setCode: prefix === 'SVP' ? 'SVP' : setCode,
      promo: true,
    };
  }
  return null;
}

/**
 * Three-letter set code printed on Scarlet & Violet era cards ("PAL EN 054/193").
 * @returns {string|null}
 */
export function parseSetCode(text) {
  const m = String(text ?? '').match(/\b([A-Z]{3})\s?E\s?N(?=\s|\d|$)/);
  return m ? m[1] : null;
}

const NAME_STOPWORDS = new Set([
  'basic', 'stage', 'hp', 'evolves', 'from', 'put', 'on', 'the', 'pokemon', 'pokémon',
  'trainer', 'item', 'supporter', 'stadium', 'energy', 'tool', 'ability', 'vstar', 'vmax',
  'gx', 'ex', 'break', 'lv', 'level', 'tera', 'mega', 'baby', 'restored', 'illus',
]);

/**
 * Best guess at the card name from OCR text of the name strip.
 * @returns {string|null}
 */
export function parseName(text) {
  if (!text) return null;
  let best = null;
  let bestScore = 0;
  for (const line of String(text).split(/\n+/)) {
    const tokens = line
      .replace(/[^A-Za-zÀ-ÿ'.\- ]/g, ' ')
      .split(/\s+/)
      .map((tok) => tok.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ.]+$/g, ''))
      .filter((tok) => tok.length >= 3 && !NAME_STOPWORDS.has(tok.toLowerCase()))
      // OCR noise tends to be mixed case garbage like "iIlIl"; real names are not.
      .filter((tok) => /[aeiouyåäö]/i.test(tok));
    if (!tokens.length) continue;
    const letters = tokens.join('').length;
    if (letters > bestScore) {
      bestScore = letters;
      best = tokens.join(' ');
    }
  }
  return best;
}

/** Lowercase letters only, accents stripped. */
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Classic edit distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 0–1 similarity between OCR text and a card name. Looks for the best-matching
 * window inside the OCR text, since it usually carries extra noise.
 */
export function nameSimilarity(ocrText, cardName) {
  const a = normalizeName(ocrText);
  const b = normalizeName(String(cardName ?? '').replace(/\b(ex|gx|v|vmax|vstar|break|lv\.?\s?x|prime|legend|star)\b/gi, ''));
  if (!a || !b) return 0;
  if (a.includes(b)) return 1;
  let best = 0;
  const lens = [b.length - 1, b.length, b.length + 1].filter((l) => l > 0);
  for (const len of lens) {
    for (let i = 0; i + len <= Math.max(a.length, len); i++) {
      const window = a.slice(i, i + len);
      const sim = 1 - levenshtein(window, b) / Math.max(window.length, b.length);
      if (sim > best) best = sim;
    }
  }
  return Math.max(0, best);
}

/**
 * Score candidates against the OCR hints and sort best first.
 * Adds `score` (higher is better) and `confidence` (0–1) to each.
 */
export function rankCandidates(cards, hints = {}) {
  const wantNum = hints.number ? normalizeNumber(hints.number) : null;
  const scored = cards.map((card) => {
    let score = 0;
    let max = 0;
    if (wantNum) {
      max += 3;
      if (normalizeNumber(card.number) === wantNum) score += 3;
    }
    if (hints.total) {
      max += 2;
      if (card.printedTotal === hints.total || card.setTotal === hints.total) score += 2;
    }
    if (hints.setCode) {
      max += 1.5;
      if (card.setCode && card.setCode.toUpperCase() === hints.setCode) score += 1.5;
    }
    if (hints.name || hints.text) {
      max += 3;
      const sim = Math.max(nameSimilarity(hints.name, card.name), 0.9 * nameSimilarity(hints.text, card.name));
      score += 3 * sim;
    }
    if (typeof card.imageSimilarity === 'number') {
      max += 3;
      score += 3 * Math.max(0, card.imageSimilarity);
    }
    return { ...card, score, confidence: max ? score / max : 0 };
  });
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Split a free-text search like "charizard 4/102" or "pikachu 25" into parts.
 * @returns {{name:string, number:string|null, total:number|null}}
 */
export function parseSearchQuery(q) {
  let text = String(q ?? '').trim();
  let number = null;
  let total = null;
  const slash = text.match(/(?:^|\s)#?([A-Za-z]{0,2}\d{1,3})\s*\/\s*([A-Za-z]{0,2}\d{1,3})(?=\s|$)/);
  if (slash) {
    number = slash[1].replace(/^0+(\d)/, '$1');
    const t = parseInt(slash[2].replace(/\D/g, ''), 10);
    total = Number.isFinite(t) ? t : null;
    text = text.replace(slash[0], ' ');
  } else {
    const lone = text.match(/(?:^|\s)#?(\d{1,3})(?=\s|$)/);
    if (lone) {
      number = lone[1].replace(/^0+(\d)/, '$1');
      text = text.replace(lone[0], ' ');
    }
  }
  return { name: text.replace(/\s+/g, ' ').trim(), number, total };
}
