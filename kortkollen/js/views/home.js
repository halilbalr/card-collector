// Start screen: collection value, quick actions, movers, sets and recents.

import { h, mount, sectionHead, toast, haptic, cardImage } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { getState, subscribe, collectionStats, rates, settings } from '../store.js';
import { convert, priceTrend, formatPct } from '../prices.js';
import { money, cardPrice, entryValue, gradeLabel, setLine } from '../format.js';
import { refreshPrices, isRefreshing } from '../actions.js';
import { areaChart } from '../components/chart.js';
import { cardTile } from '../components/card-tile.js';
import { remember } from '../session.js';
import { relativeDate } from '../ui.js';
import { DEMO } from '../demo.js';
import { demoNotice } from './more.js';

const openCard = (card) => {
  remember([card]);
  navigate(`/card/${card.provider}/${encodeURIComponent(card.id)}`);
};

export function logo(size = 30) {
  const wrap = document.createElement('span');
  wrap.className = 'brand__logo';
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd84d"/><stop offset=".55" stop-color="#ff7a59"/><stop offset="1" stop-color="#8b5cff"/></linearGradient></defs><rect x="14" y="6" width="36" height="52" rx="7" fill="url(#lg)" transform="rotate(-8 32 32)"/><rect x="18" y="10" width="28" height="44" rx="5" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="3" transform="rotate(-8 32 32)"/><circle cx="32" cy="32" r="7" fill="#fff"/><circle cx="32" cy="32" r="3" fill="#1b1f2e"/></svg>`;
  return wrap;
}

function valueHero(st) {
  const stats = collectionStats();
  const cur = settings().currency;
  const hist = st.history.map((p) => ({ d: p.d, v: convert(p.v, 'EUR', cur, rates()) ?? 0 }));
  const today = new Date().toISOString().slice(0, 10);
  const prev = [...hist].reverse().find((p) => p.d < today);
  const delta = prev && prev.v > 0 ? (stats.value - prev.v) / prev.v : null;
  const pnl = stats.profit;
  const points = hist.slice(-90).map((p) => p.v);
  if (points.length && hist[hist.length - 1]?.d === today) points[points.length - 1] = stats.value;
  else points.push(stats.value);

  const refreshBtn = h(
    'button',
    { class: `chip chip--glass ${isRefreshing() ? 'is-busy' : ''}`, onClick: () => doRefresh(refreshBtn) },
    icon('refresh', { size: 15 }),
    h('span', {}, isRefreshing() ? 'Uppdaterar…' : 'Uppdatera'),
  );

  return h(
    'section',
    { class: 'hero-card' },
    h(
      'div',
      { class: 'hero-card__top' },
      h('div', { class: 'hero-card__label' }, 'Samlingens värde'),
      refreshBtn,
    ),
    h('div', { class: 'hero-card__value', 'data-testid': 'collection-value' }, money(stats.value)),
    h(
      'div',
      { class: 'hero-card__meta' },
      delta != null
        ? h('span', { class: `delta ${delta >= 0 ? 'delta--up' : 'delta--down'}` }, icon(delta >= 0 ? 'up' : 'down', { size: 14 }), formatPct(delta))
        : null,
      h('span', { class: 'muted' }, st.lastRefresh ? `Priser uppdaterade ${relativeDate(st.lastRefresh)}` : 'Priser från när korten lades till'),
    ),
    points.length >= 2 ? areaChart(points, { height: 86, tone: points[points.length - 1] >= points[0] ? 'up' : 'down' }) : h('p', { class: 'hero-card__hint' }, 'Värdet loggas varje dag du öppnar appen – snart ser du en kurva här.'),
    h(
      'div',
      { class: 'hero-card__stats' },
      stat(String(stats.count), stats.count === 1 ? 'kort' : 'kort totalt'),
      stat(String(stats.unique), 'unika'),
      pnl != null ? stat(`${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}`, 'mot inköp', pnl >= 0 ? 'up' : 'down') : stat(String(st.wishlist.length), 'önskade'),
    ),
  );
}

const stat = (value, label, tone) => h('div', { class: `stat ${tone ? `stat--${tone}` : ''}` }, h('b', {}, value), h('span', {}, label));

async function doRefresh(btn) {
  if (isRefreshing()) return;
  haptic();
  btn.classList.add('is-busy');
  btn.querySelector('span').textContent = 'Uppdaterar…';
  try {
    const { updated, total } = await refreshPrices((done, all) => {
      btn.querySelector('span').textContent = `${done}/${all}`;
    });
    toast(total ? `Priser uppdaterade för ${updated} av ${total} kort` : 'Valutakurser uppdaterade', { type: 'ok' });
  } catch {
    toast('Kunde inte uppdatera – är du offline?', { type: 'error' });
  }
}

function quickActions(st) {
  return h(
    'div',
    { class: 'quick' },
    h(
      'button',
      { class: 'quick__main', onClick: () => navigate('/scan') },
      h('span', { class: 'quick__icon' }, icon('scan', { size: 26 })),
      h('span', { class: 'quick__text' }, h('b', {}, 'Skanna kort'), h('small', {}, 'Identifiera, värdera och lägg till')),
      icon('chevronRight', { size: 20 }),
    ),
    h(
      'div',
      { class: 'quick__row' },
      h('button', { class: 'quick__btn', onClick: () => navigate('/search') }, icon('search', { size: 20 }), 'Sök kort'),
      h(
        'button',
        { class: 'quick__btn', onClick: () => navigate('/library?tab=wish') },
        icon('heart', { size: 20 }),
        'Önskelista',
        st.wishlist.length ? h('span', { class: 'count' }, String(st.wishlist.length)) : null,
      ),
    ),
  );
}

function wishAlerts(st) {
  const hits = st.wishlist.filter((w) => {
    const p = cardPrice(w.card, w.variant);
    return w.target != null && p != null && p <= w.target;
  });
  if (!hits.length) return null;
  return h(
    'button',
    { class: 'banner banner--good', onClick: () => navigate('/library?tab=wish') },
    icon('target', { size: 20 }),
    h('span', {}, hits.length === 1 ? `${hits[0].card.name} är under ditt målpris!` : `${hits.length} önskade kort är under ditt målpris!`),
    icon('chevronRight', { size: 18 }),
  );
}

function topValuable(st) {
  const ranked = st.items
    .map((item) => ({ item, v: entryValue(item) }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);
  if (!ranked.length) return null;
  return h(
    'section',
    { class: 'section' },
    sectionHead('Mest värdefulla', h('button', { class: 'link', onClick: () => navigate('/library') }, 'Visa alla')),
    h(
      'div',
      { class: 'scroller' },
      ranked.map(({ item, v }) =>
        cardTile(item.card, { price: money(v), badge: gradeLabel(item), qty: item.qty, onClick: () => openCard(item.card) }),
      ),
    ),
  );
}

function movers(st) {
  const seen = new Set();
  const rows = [];
  for (const item of st.items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    const t = priceTrend(item.card, item.variant);
    if (t?.change7 == null || Math.abs(t.change7) < 0.01) continue;
    rows.push({ item, change: t.change7 });
  }
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  if (!rows.length) return null;
  return h(
    'section',
    { class: 'section' },
    sectionHead('Prisrörelser i din samling'),
    h('p', { class: 'section-sub' }, 'Snittpris senaste 7 dagarna jämfört med 30 dagar (Cardmarket).'),
    h(
      'div',
      { class: 'list' },
      rows.slice(0, 5).map(({ item, change }) =>
        h(
          'button',
          { class: 'row', onClick: () => openCard(item.card) },
          h('div', { class: 'row__thumb' }, cardImage(item.card.images?.small, item.card.name)),
          h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, item.card.name), h('div', { class: 'row__sub' }, setLine(item.card))),
          h(
            'div',
            { class: 'row__end' },
            h('div', { class: 'row__value' }, money(cardPrice(item.card, item.variant))),
            h('span', { class: `delta ${change >= 0 ? 'delta--up' : 'delta--down'}` }, formatPct(change)),
          ),
        ),
      ),
    ),
  );
}

/** Sets the user collects, with completion based on printed set size. */
export function setProgress(items) {
  const sets = new Map();
  for (const item of items) {
    const c = item.card;
    if (!c.setId) continue;
    const key = `${c.provider}:${c.setId}`;
    if (!sets.has(key)) sets.set(key, { provider: c.provider, id: c.setId, name: c.setName, logo: c.setLogo, symbol: c.setSymbol, total: c.printedTotal, numbers: new Set(), release: c.releaseDate });
    // Progress counts the main set only; secret rares sit above the printed total.
    const n = Number(c.number);
    if (!c.printedTotal || (Number.isInteger(n) && n <= c.printedTotal)) sets.get(key).numbers.add(String(n || c.number));
  }
  return [...sets.values()].map((s) => ({ ...s, owned: s.numbers.size, pct: s.total ? Math.min(1, s.numbers.size / s.total) : 0 }));
}

function sets(st) {
  const list = setProgress(st.items).sort((a, b) => b.pct - a.pct || b.owned - a.owned);
  if (!list.length) return null;
  return h(
    'section',
    { class: 'section' },
    sectionHead('Dina set'),
    h(
      'div',
      { class: 'list' },
      list.slice(0, 6).map((s) =>
        h(
          'button',
          { class: 'row', onClick: () => navigate(`/set/${s.provider}/${encodeURIComponent(s.id)}`) },
          h('div', { class: 'row__logo' }, s.symbol ? cardImage(s.symbol, '') : icon('book', { size: 18 })),
          h(
            'div',
            { class: 'row__main' },
            h('div', { class: 'row__title' }, s.name),
            h('div', { class: 'progress' }, h('span', { style: { width: `${Math.max(2, s.pct * 100)}%` } })),
          ),
          h('div', { class: 'row__end' }, h('div', { class: 'row__value' }, `${s.owned}${s.total ? ` / ${s.total}` : ''}`), h('div', { class: 'row__sub' }, s.total ? `${Math.round(s.pct * 100)} %` : '')),
        ),
      ),
    ),
  );
}

function recent(st) {
  if (!st.recent.length) return null;
  return h(
    'section',
    { class: 'section' },
    sectionHead('Senast visade'),
    h(
      'div',
      { class: 'scroller' },
      st.recent.slice(0, 12).map((r) => cardTile(r.card, { price: money(cardPrice(r.card)), badge: r.scanned ? 'Skannad' : null, onClick: () => openCard(r.card) })),
    ),
  );
}

function welcome() {
  const feature = (iconName, title, text) =>
    h('div', { class: 'feature' }, h('span', { class: 'feature__icon' }, icon(iconName, { size: 20 })), h('div', {}, h('b', {}, title), h('p', {}, text)));
  return h(
    'section',
    { class: 'welcome' },
    h('div', { class: 'welcome__glow', 'aria-hidden': 'true' }),
    h('h1', { class: 'welcome__title' }, 'Skanna. Värdera. ', h('span', { class: 'gradient-text' }, 'Samla.')),
    h('p', { class: 'welcome__text' }, 'Rikta kameran mot ett Pokémonkort och se direkt vad det är värt – ograderat och som PSA 10, 9, 8 och mer.'),
    h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: () => navigate('/scan') }, icon('scan'), 'Skanna ditt första kort'),
    h('button', { class: 'btn btn--ghost btn--block', onClick: () => navigate('/search') }, icon('search'), 'Eller sök efter ett kort'),
    h(
      'div',
      { class: 'features' },
      feature('award', 'Graderade värden', 'Se hur kortet ser ut i PSA-, BGS-, CGC- och SGC-slabbar och vad varje betyg kan vara värt.'),
      feature('ruler', 'Graderingskoll', 'Mät centreringen med kameran och få ett troligt betyg – och om det lönar sig att gradera.'),
      feature('cards', 'Din samling', 'Följ värdet över tid, sortera i pärmar och få koll på hur långt du har kvar på varje set.'),
    ),
  );
}

export function render() {
  const el = h('div', { class: 'view view--home' });
  const draw = () => {
    const st = getState();
    const head = h(
      'header',
      { class: 'home-head' },
      h('div', { class: 'brand' }, logo(), h('span', { class: 'brand__name' }, 'Kortkollen')),
      h('button', { class: 'icon-btn', 'aria-label': 'Inställningar', onClick: () => navigate('/more') }, icon('sliders')),
    );
    if (!st.items.length) {
      mount(el, head, DEMO && demoNotice(), welcome(), wishAlerts(st), recent(st));
      return;
    }
    mount(el, head, DEMO && demoNotice(), valueHero(st), quickActions(st), wishAlerts(st), topValuable(st), movers(st), sets(st), recent(st));
  };
  draw();
  let queued = false;
  const unsub = subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (el.isConnected) draw();
    });
  });
  return { el, destroy: unsub };
}
