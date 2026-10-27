// Demo mode: a small built-in catalogue with example prices, used where the
// app cannot reach the card APIs (e.g. inside a sandboxed preview). Turned on
// by setting `window.KK_DEMO = true` before the app loads.

export const DEMO = globalThis.KK_DEMO === true;

const TYPE_COLORS = {
  Fire: ['#ff8a3d', '#c2331b'],
  Water: ['#4aa3ff', '#1d4fb8'],
  Grass: ['#6fd36b', '#2a7f3a'],
  Lightning: ['#ffe14d', '#d39b00'],
  Psychic: ['#d77bff', '#7a2fb8'],
  Darkness: ['#4b5470', '#161a2a'],
  Dragon: ['#c9a23c', '#5b4a1b'],
  Colorless: ['#d9d4c7', '#8c8676'],
  Trainer: ['#e8e2d0', '#9a8f6d'],
};

const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

/** Stylised example card art as an SVG data URI (no external images needed). */
function cardArt({ name, hp, type, number, printedTotal, code, border, rarity }) {
  const [a, b] = TYPE_COLORS[type] ?? TYPE_COLORS.Colorless;
  const special = /illustration|secret|hyper|rare holo v/i.test(rarity ?? '');
  const num = `${code ? `${code} EN ` : ''}${String(number).padStart(code ? 3 : 1, '0')}/${printedTotal}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 630 880">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="630" height="880" rx="30" fill="${border}"/>
<rect x="26" y="26" width="578" height="828" rx="12" fill="url(#g)"/>
<rect x="44" y="100" width="542" height="${special ? 740 : 360}" rx="6" fill="#11131c" opacity=".25"/>
<circle cx="315" cy="${special ? 420 : 280}" r="${special ? 190 : 120}" fill="url(#r)"/>
<circle cx="315" cy="${special ? 420 : 280}" r="${special ? 70 : 46}" fill="#fff" opacity=".9"/>
<path d="M${315 - (special ? 70 : 46)} ${special ? 420 : 280}h${special ? 140 : 92}" stroke="#1b1f2e" stroke-width="10"/>
<circle cx="315" cy="${special ? 420 : 280}" r="${special ? 24 : 16}" fill="#fff" stroke="#1b1f2e" stroke-width="8"/>
<text x="46" y="78" font-family="Arial, sans-serif" font-weight="700" font-size="40" fill="#14161f">${escapeXml(name)}</text>
${hp ? `<text x="584" y="78" text-anchor="end" font-family="Arial, sans-serif" font-weight="700" font-size="30" fill="#14161f">${hp} HP</text>` : ''}
${special ? '' : `<rect x="44" y="490" width="542" height="2" fill="#14161f" opacity=".3"/><text x="50" y="540" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#14161f">Exempelkort</text><text x="50" y="580" font-family="Arial, sans-serif" font-size="19" fill="#14161f" opacity=".75">Bilden är en platshållare i demoläget.</text>`}
<text x="46" y="828" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="#14161f">${escapeXml(num)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SETS = {
  base1: { id: 'base1', name: 'Base', series: 'Base', printedTotal: 102, total: 102, ptcgoCode: 'BS', releaseDate: '1999/01/09', border: '#f2c531' },
  neo1: { id: 'neo1', name: 'Neo Genesis', series: 'Neo', printedTotal: 111, total: 111, ptcgoCode: 'N1', releaseDate: '2000/12/16', border: '#f2c531' },
  swsh7: { id: 'swsh7', name: 'Evolving Skies', series: 'Sword & Shield', printedTotal: 203, total: 237, ptcgoCode: 'EVS', releaseDate: '2021/08/27', border: '#f2c531' },
  sv2: { id: 'sv2', name: 'Paldea Evolved', series: 'Scarlet & Violet', printedTotal: 193, total: 279, ptcgoCode: 'PAL', releaseDate: '2023/06/09', border: '#c9ccd3' },
  sv3pt5: { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', printedTotal: 165, total: 207, ptcgoCode: 'MEW', releaseDate: '2023/09/22', border: '#c9ccd3' },
};

// [set, number, name, type, hp, rarity, eur, usd, tcgVariant, reverseEur]
const ROWS = [
  ['base1', '4', 'Charizard', 'Fire', 120, 'Rare Holo', 380, 420, 'holofoil'],
  ['base1', '2', 'Blastoise', 'Water', 100, 'Rare Holo', 140, 160, 'holofoil'],
  ['base1', '15', 'Venusaur', 'Grass', 100, 'Rare Holo', 110, 125, 'holofoil'],
  ['base1', '58', 'Pikachu', 'Lightning', 40, 'Common', 4.5, 6, 'normal'],
  ['neo1', '9', 'Lugia', 'Psychic', 90, 'Rare Holo', 250, 280, 'holofoil'],
  ['swsh7', '215', 'Umbreon VMAX', 'Darkness', 310, 'Rare Secret', 950, 1150, 'holofoil'],
  ['swsh7', '218', 'Rayquaza VMAX', 'Dragon', 320, 'Rare Secret', 380, 450, 'holofoil'],
  ['swsh7', '189', 'Umbreon V', 'Darkness', 200, 'Rare Ultra', 280, 330, 'holofoil'],
  ['swsh7', '125', 'Sylveon VMAX', 'Psychic', 310, 'Rare Holo VMAX', 6, 8, 'holofoil'],
  ['sv2', '269', 'Iono', 'Trainer', null, 'Special Illustration Rare', 60, 72, 'holofoil'],
  ['sv3pt5', '199', 'Charizard ex', 'Fire', 330, 'Special Illustration Rare', 190, 238, 'holofoil'],
  ['sv3pt5', '205', 'Mew ex', 'Psychic', 180, 'Hyper Rare', 24, 30, 'holofoil'],
  ['sv3pt5', '151', 'Mew', 'Psychic', 70, 'Rare', 1.6, 2, 'normal', 3.2],
  ['sv3pt5', '25', 'Pikachu', 'Lightning', 60, 'Common', 0.3, 0.25, 'normal', 0.8],
  ['sv3pt5', '6', 'Charizard', 'Fire', 180, 'Rare', 3.5, 4, 'normal', 6],
  ['sv3pt5', '4', 'Charmander', 'Fire', 70, 'Common', 0.9, 1, 'normal', 2],
];

const CARDS = ROWS.map(([setId, number, name, type, hp, rarity, eur, usd, variant, rev]) => {
  const set = SETS[setId];
  const art = cardArt({ name, hp, type, number, printedTotal: set.printedTotal, code: setId.startsWith('sv') ? set.ptcgoCode : null, border: set.border, rarity });
  // Gentle, deterministic example movement for the 1/7/30-day averages.
  const wobble = (((number.length * 7 + name.length * 13) % 11) - 5) / 100;
  const prices = { [variant]: { low: usd * 0.85, mid: usd * 1.05, high: usd * 2, market: usd } };
  if (rev) prices.reverseHolofoil = { low: rev * 0.9, mid: rev * 1.2, high: rev * 3, market: rev * 1.1 };
  return {
    id: `${setId}-${number}`,
    name,
    number,
    rarity,
    hp: hp ? String(hp) : undefined,
    types: type === 'Trainer' ? [] : [type],
    supertype: type === 'Trainer' ? 'Trainer' : 'Pokémon',
    subtypes: type === 'Trainer' ? ['Supporter'] : [],
    set: { ...set, images: { symbol: null, logo: null } },
    images: { small: art, large: art },
    tcgplayer: { url: null, updatedAt: '2026/10/24', prices },
    cardmarket: {
      url: null,
      updatedAt: '2026/10/24',
      prices: {
        trendPrice: eur,
        averageSellPrice: eur * 0.98,
        lowPrice: eur * 0.8,
        avg1: eur * (1 + wobble),
        avg7: eur * (1 + wobble / 2),
        avg30: eur,
        ...(rev ? { reverseHoloTrend: rev, reverseHoloAvg30: rev, reverseHoloAvg7: rev, reverseHoloSell: rev } : {}),
      },
    },
  };
});

function queryCards(q) {
  let list = CARDS;
  const setId = q.match(/set\.id:(\S+)/);
  if (setId) list = list.filter((c) => c.set.id === setId[1]);
  const ids = [...q.matchAll(/(?:^|[\s(])id:"([^"]+)"/g)].map((m) => m[1]);
  if (ids.length) list = list.filter((c) => ids.includes(c.id));
  const name = q.match(/name:"\*?([^"*]+)\*?"/);
  if (name) list = list.filter((c) => c.name.toLowerCase().includes(name[1].toLowerCase()));
  const num = q.match(/number:"?([^"\s)]+)"?/);
  if (num) list = list.filter((c) => c.number === num[1].replace(/^0+(\d)/, '$1'));
  const code = q.match(/set\.ptcgoCode:(\S+)/);
  if (code) list = list.filter((c) => c.set.ptcgoCode === code[1]);
  const total = q.match(/set\.printedTotal:(\d+)/);
  if (total) list = list.filter((c) => c.set.printedTotal === Number(total[1]) || c.set.total === Number(total[1]));
  return list;
}

/**
 * Answer a Pokémon TCG API request from the built-in catalogue.
 * @returns {Promise<object>} same shape as the real API
 */
export async function demoPtcg(path, params = {}) {
  await new Promise((r) => setTimeout(r, 120));
  if (path === '/sets') {
    const data = Object.values(SETS)
      .map((s) => ({ ...s, images: { symbol: null, logo: null } }))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    return { data };
  }
  const one = path.match(/^\/cards\/(.+)$/);
  if (one) {
    const card = CARDS.find((c) => c.id === decodeURIComponent(one[1]));
    if (!card) throw Object.assign(new Error('HTTP 404'), { status: 404 });
    return { data: card };
  }
  const all = queryCards(String(params.q ?? ''));
  const page = Number(params.page ?? 1);
  const size = Number(params.pageSize ?? 250);
  return { data: all.slice((page - 1) * size, page * size), totalCount: all.length };
}

/** Fixed example exchange rates. */
export const DEMO_RATES = { base: 'EUR', date: '2026-10-24', rates: { EUR: 1, USD: 1.16, SEK: 10.95, NOK: 11.65, DKK: 7.46, GBP: 0.87 } };

/** Names in the catalogue, shown as search suggestions in demo mode. */
export const DEMO_NAMES = [...new Set(CARDS.map((c) => c.name.split(' ')[0]))];
