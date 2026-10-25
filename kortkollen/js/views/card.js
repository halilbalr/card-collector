// Card detail: holo hero, market price, graded values in slabs, grading
// estimate, links to real sales and the user's own copies.

import { h, mount, segmented, chips, openSheet, toast, haptic, sectionHead, emptyState, cardImage } from '../ui.js';
import { icon } from '../icons.js';
import { back, navigate } from '../router.js';
import { getCard, marketLinks } from '../api.js';
import { getState, subscribe, update, settings, cardKey, itemsFor, toggleWishlist, isWishlisted, addRecent, getEstimate, gradingCost, valueCtx, rates } from '../store.js';
import { COMPANIES, GRADE_GUIDE, estimateGrades, formatRatio, breakEvenGrade, expectedValue, gradingVerdict } from '../grading.js';
import { gradedTable, rawPrice, priceTrend, cardVariants, VARIANT_LABELS, ERA_LABELS, convert, formatPct, itemValue } from '../prices.js';
import { money, gradeLabel, setLine } from '../format.js';
import { holoCard } from '../components/holo.js';
import { slab, gradeNumber } from '../components/slab.js';
import { openItemSheet } from '../components/item-sheet.js';
import { session, remember } from '../session.js';

const SOURCE_LABEL = { cardmarket: 'Cardmarket trend', tcgplayer: 'TCGplayer market' };

/** Saved estimate, or a quick one from the latest scan of this card. */
function currentEstimate(key, fromScan) {
  const saved = getEstimate(key);
  if (saved) return { ...saved, kind: 'saved' };
  const scan = session.lastScan;
  if (fromScan && scan?.cardKey === key && scan.snapshot?.centering?.confidence > 0.4) {
    const c = scan.snapshot.centering;
    return { kind: 'scan', input: { front: c.worst }, result: estimateGrades({ front: c.worst }), centering: { lr: c.lr, tb: c.tb } };
  }
  return null;
}

export function render(route) {
  const { provider, id } = route.params;
  const key = `${provider}:${id}`;
  const fromScan = route.query.scan === '1';
  const st = getState();
  let card =
    session.cards.get(key) ??
    st.items.find((i) => i.key === key)?.card ??
    st.wishlist.find((w) => w.key === key)?.card ??
    st.recent.find((r) => r.key === key)?.card ??
    null;
  let variant = null;
  let company = settings().gradingCompany ?? 'PSA';
  let showWear = true;
  let loadError = null;

  const el = h('div', { class: 'view view--card' });
  const heartBtn = h('button', { class: 'icon-btn', 'aria-label': 'Önskelista' });
  const top = h(
    'header',
    { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Tillbaka', onClick: () => back('/search') }, icon('back')),
    h('div', { class: 'topbar__title' }),
    h('div', { class: 'topbar__actions' }, h('button', { class: 'icon-btn', 'aria-label': 'Dela', onClick: () => share() }, icon('share')), heartBtn),
  );
  const body = h('div', { class: 'card-page' });
  const bottomBar = h('div', { class: 'bottom-bar' });
  el.append(top, body, bottomBar);

  heartBtn.addEventListener('click', () => {
    if (!card) return;
    const added = toggleWishlist(card, variant);
    haptic();
    toast(added ? 'Tillagt på önskelistan' : 'Borttaget från önskelistan', { type: added ? 'ok' : 'info' });
  });

  async function share() {
    if (!card) return;
    const price = money(priceNow());
    const text = `${card.name} – ${setLine(card)}\nMarknadsvärde: ${price}`;
    try {
      if (navigator.share) await navigator.share({ title: card.name, text, url: location.href });
      else {
        await navigator.clipboard.writeText(`${text}\n${location.href}`);
        toast('Kopierat till urklipp', { type: 'ok' });
      }
    } catch {
      /* user cancelled */
    }
  }

  const priceNow = () => {
    const p = rawPrice(card, { variant, source: settings().source });
    return p ? convert(p.amount, p.currency, settings().currency, rates()) : null;
  };

  // ------------------------------------------------------------ sections

  function hero() {
    const holo = holoCard(card, { variant });
    return h(
      'section',
      { class: 'card-hero' },
      h('div', { class: 'card-hero__bg', style: { backgroundImage: card.images?.small ? `url("${card.images.small}")` : 'none' } }),
      holo,
      h('h1', { class: 'card-hero__name' }, card.name),
      h('div', { class: 'card-hero__sub' }, setLine(card)),
      h(
        'div',
        { class: 'card-hero__chips' },
        card.rarity && h('span', { class: 'pill' }, icon('star', { size: 13 }), card.rarity),
        card.releaseDate && h('span', { class: 'pill' }, card.releaseDate.slice(0, 4)),
        card.setCode && h('span', { class: 'pill' }, card.setCode),
      ),
    );
  }

  function priceSection() {
    const variants = cardVariants(card);
    const raw = rawPrice(card, { variant, source: settings().source });
    const trend = priceTrend(card, variant);
    const tcg = card.prices?.tcgplayer?.variants?.[variant];
    const ctx = settings();
    const conv = (amount, from) => money(convert(amount, from, ctx.currency, rates()));
    const minis = [];
    if (trend) {
      if (trend.avg1) minis.push(['1 dag', conv(trend.avg1, 'EUR')]);
      if (trend.avg7) minis.push(['7 dagar', conv(trend.avg7, 'EUR')]);
      if (trend.avg30) minis.push(['30 dagar', conv(trend.avg30, 'EUR')]);
    }
    if (tcg && minis.length < 3) {
      if (tcg.low) minis.push(['TCG lägst', conv(tcg.low, 'USD')]);
      if (tcg.market) minis.push(['TCG market', conv(tcg.market, 'USD')]);
    }
    const updated = raw?.source === 'cardmarket' ? card.prices?.cardmarket?.updatedAt : card.prices?.tcgplayer?.updatedAt;
    return h(
      'section',
      { class: 'panel price-panel' },
      variants.length > 1 &&
        chips(
          variants.map((v) => ({ value: v, label: VARIANT_LABELS[v] ?? v })),
          variant,
          (v) => {
            variant = v;
            draw();
          },
          { cls: 'chips--scroll' },
        ),
      h('div', { class: 'price-panel__label' }, 'Marknadsvärde · ograderat (Near Mint)'),
      h(
        'div',
        { class: 'price-panel__value' },
        h('span', { 'data-testid': 'raw-price' }, raw ? money(priceNow()) : 'Pris saknas'),
        trend?.change7 != null && h('span', { class: `delta ${trend.change7 >= 0 ? 'delta--up' : 'delta--down'}` }, icon(trend.change7 >= 0 ? 'up' : 'down', { size: 14 }), formatPct(trend.change7)),
      ),
      h(
        'div',
        { class: 'price-panel__src muted' },
        raw ? `${SOURCE_LABEL[raw.source]} (${raw.currency})${updated ? ` · uppdaterat ${updated}` : ''}` : 'Ingen prisdata för den här varianten ännu.',
      ),
      minis.length > 0 && h('div', { class: 'minis' }, minis.slice(0, 3).map(([l, v]) => h('div', { class: 'mini' }, h('span', {}, l), h('b', {}, v)))),
    );
  }

  function estimateBanner(est) {
    if (!est) return null;
    const r = est.result[company] ?? est.result.PSA;
    const likely = r.likely;
    const [lo, hi] = r.range;
    const rangeTxt = lo === hi ? `${company} ${gradeNumber(lo)}` : `${company} ${gradeNumber(lo)}–${gradeNumber(hi)}`;
    return h(
      'button',
      { class: 'estimate-banner', onClick: () => navigate(`/grade/${provider}/${encodeURIComponent(id)}`) },
      h('span', { class: 'estimate-banner__icon' }, icon('target', { size: 20 })),
      h(
        'span',
        { class: 'estimate-banner__text' },
        h('small', {}, est.kind === 'scan' ? `Från din skanning · centrering ${formatRatio(est.centering?.lr)} · ${formatRatio(est.centering?.tb)}` : 'Din graderingskoll'),
        h('b', {}, `Troligen ${rangeTxt}`),
        h('small', { class: 'muted' }, `Mest sannolikt ${company} ${gradeNumber(likely.key)} (${Math.round(likely.p * 100)} %)${est.kind === 'scan' ? ' · tryck för att förfina' : ''}`),
      ),
      icon('chevronRight', { size: 18 }),
    );
  }

  function gradedSection(est) {
    const table = gradedTable(card, { variant, ...valueCtx() });
    const grades = table.companies[company];
    const dist = est ? Object.fromEntries((est.result[company]?.dist ?? []).map((d) => [d.key, d.p])) : null;
    const likelyKey = est?.result[company]?.likely?.key;
    const shown = grades.filter((g) => g.value >= 5 || (dist && dist[g.key] > 0.02));
    const carousel = h(
      'div',
      { class: 'slab-carousel', role: 'list' },
      shown.map((g) =>
        h(
          'button',
          { class: 'slab-item', role: 'listitem', onClick: () => gradeSheet(g, dist?.[g.key]), 'data-key': g.key },
          slab(card, company, g, { wear: showWear, highlight: g.key === likelyKey, subgrades: company === 'BGS' && est ? est.result.subgrades : null }),
          h('div', { class: 'slab-item__price' }, money(g.price)),
          dist ? h('div', { class: `slab-item__prob ${g.key === likelyKey ? 'is-likely' : ''}` }, `${Math.round((dist[g.key] ?? 0) * 100)} % chans`) : h('div', { class: 'slab-item__prob muted' }, g.name),
        ),
      ),
    );
    // Scroll to the most interesting slab once laid out.
    requestAnimationFrame(() => {
      const target = carousel.querySelector(`[data-key="${CSS.escape(likelyKey ?? grades[company === 'PSA' ? 0 : 2]?.key ?? '10')}"]`);
      if (target) carousel.scrollLeft = target.offsetLeft - (carousel.clientWidth - target.clientWidth) / 2;
    });

    const priceOf = (k) => grades.find((g) => g.key === k)?.price ?? null;
    const cost = gradingCost();
    const rawValue = table.rawDisplay;
    const be = rawValue != null ? breakEvenGrade(grades, priceOf, rawValue, cost) : null;
    let verdict = null;
    if (est && rawValue != null) {
      const ev = expectedValue(est.result[company].dist, priceOf, cost);
      const v = gradingVerdict({ rawValue, net: ev.net, cost });
      verdict = { ...v, ev };
    }

    return h(
      'section',
      { class: 'section' },
      sectionHead('Graderade värden', h('button', { class: `chip chip--small ${showWear ? 'is-active' : ''}`, onClick: () => ((showWear = !showWear), draw()) }, icon('eye', { size: 14 }), 'Slitage')),
      segmented(
        Object.keys(COMPANIES).map((c) => ({ value: c, label: c })),
        company,
        (v) => {
          company = v;
          update((s) => {
            s.settings.gradingCompany = v;
          });
          draw();
        },
        { cls: 'seg--block' },
      ),
      carousel,
      h(
        'div',
        { class: 'grade-table' },
        grades.map((g) =>
          h(
            'button',
            { class: `grade-row ${g.key === likelyKey ? 'is-likely' : ''}`, onClick: () => gradeSheet(g, dist?.[g.key]) },
            h('span', { class: 'grade-row__badge' }, gradeNumber(g.key)),
            h('span', { class: 'grade-row__name' }, g.name),
            dist && h('span', { class: 'grade-row__prob' }, `${Math.round((dist[g.key] ?? 0) * 100)} %`),
            h('span', { class: 'grade-row__price' }, money(g.price)),
          ),
        ),
      ),
      h(
        'div',
        { class: `verdict ${verdict ? `verdict--${verdict.level}` : ''}` },
        verdict
          ? [
              h('b', {}, verdict.level === 'good' ? 'Gradering lönar sig troligen' : verdict.level === 'maybe' ? 'Gradering kan löna sig – marginellt' : 'Gradering lönar sig troligen inte'),
              h('p', {}, `Förväntat värde efter gradering hos ${company}: ${money(verdict.ev.gross)} − ${money(cost)} i avgift = ${money(verdict.ev.net)}, mot ${money(rawValue)} ograderat (${verdict.gain >= 0 ? '+' : '−'}${money(Math.abs(verdict.gain))}).`),
            ]
          : [
              h('b', {}, be ? `Kortet behöver minst ${company} ${gradeNumber(be)} för att gradering ska löna sig` : 'Gradering lönar sig knappast för det här kortet'),
              h('p', {}, `Räknat med ${money(cost)} i graderingskostnad inkl. frakt (ändra under Mer). Gör en graderingskoll för att se hur troligt det är.`),
            ],
      ),
      h(
        'p',
        { class: 'fine-print' },
        icon('info', { size: 14 }),
        ` Uppskattning utifrån marknadsvärdet och typiska prispremier för ${ERA_LABELS[table.era].toLowerCase()}. Verkliga slutpriser varierar – kolla sålda exemplar nedan.`,
      ),
    );
  }

  function gradeSheet(g, p) {
    const guide = COMPANIES.PSA.grades.find((x) => x.value === Math.min(10, Math.floor(g.value)));
    const centering = COMPANIES[company].centering.find(([v]) => v <= g.value + 1e-9);
    openSheet({
      title: `${company} ${gradeNumber(g.key)} · ${g.name}`,
      content: h(
        'div',
        { class: 'grade-sheet' },
        h('div', { class: 'grade-sheet__slab' }, slab(card, company, g, { wear: true, size: 'lg' })),
        h('div', { class: 'grade-sheet__price' }, h('span', { class: 'muted' }, 'Uppskattat värde'), h('b', {}, money(g.price))),
        p != null && h('div', { class: 'grade-sheet__prob' }, `Din chans enligt graderingskollen: ${Math.round(p * 100)} %`),
        h('p', {}, GRADE_GUIDE[guide?.value ?? 10]),
        centering && h('p', { class: 'muted' }, `Krav på centrering hos ${company}: högst ${formatRatio(centering[1])} på framsidan och ${formatRatio(centering[2])} på baksidan.`),
        h('p', { class: 'fine-print' }, 'Bilden är en illustration av typiskt slitage för betyget, inte ett foto av ditt kort.'),
      ),
    });
  }

  function gradeCta(est) {
    return h(
      'section',
      { class: 'cta-card' },
      h('div', { class: 'cta-card__icon' }, icon('ruler', { size: 24 })),
      h(
        'div',
        { class: 'cta-card__text' },
        h('b', {}, est?.kind === 'saved' ? 'Gör om graderingskollen' : 'Vilket betyg kan ditt kort få?'),
        h('p', {}, 'Mät centreringen med kameran och gå igenom hörn, kanter och yta – på ett par minuter.'),
      ),
      h('button', { class: 'btn btn--primary', onClick: () => navigate(`/grade/${provider}/${encodeURIComponent(id)}`) }, est?.kind === 'saved' ? 'Gör om' : 'Starta'),
    );
  }

  function ownedSection() {
    const items = itemsFor(key);
    if (!items.length) return h('div', { class: 'section--owned' });
    const ctx = valueCtx();
    return h(
      'section',
      { class: 'section section--owned' },
      sectionHead(`I din samling (${items.reduce((a, i) => a + i.qty, 0)})`),
      h(
        'div',
        { class: 'list' },
        items.map((item) =>
          h(
            'button',
            { class: 'row', onClick: () => openItemSheet({ card, item }) },
            h('span', { class: 'grade-chip' }, gradeLabel(item)),
            h(
              'div',
              { class: 'row__main' },
              h('div', { class: 'row__title' }, `${item.qty} st · ${VARIANT_LABELS[item.variant] ?? item.variant}`),
              h('div', { class: 'row__sub' }, item.purchase?.amount != null ? `Köpt för ${money(convert(item.purchase.amount, item.purchase.currency, ctx.currency, ctx.rates))}/st` : `Tillagd ${item.addedAt.slice(0, 10)}`),
            ),
            h('div', { class: 'row__end' }, h('div', { class: 'row__value' }, money(itemValue(item, ctx))), icon('edit', { size: 16, cls: 'muted' })),
          ),
        ),
      ),
    );
  }

  function linksSection() {
    const g = (getEstimate(key)?.result?.[company]?.likely?.key) ?? '10';
    return h(
      'section',
      { class: 'section' },
      sectionHead('Kolla verkliga försäljningar'),
      h(
        'div',
        { class: 'list' },
        marketLinks(card, { company, grade: gradeNumber(g) }).map((l) =>
          h(
            'a',
            { class: 'row', href: l.url, target: '_blank', rel: 'noopener' },
            h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, l.label), h('div', { class: 'row__sub' }, l.sub)),
            icon('external', { size: 18, cls: 'muted' }),
          ),
        ),
      ),
    );
  }

  function factsSection() {
    const facts = [
      ['Set', `${card.setName}${card.series && card.series !== card.setName ? ` (${card.series})` : ''}`],
      ['Nummer', `${card.number}${card.printedTotal ? ` / ${card.printedTotal}` : ''}`],
      ['Sällsynthet', card.rarity],
      ['Illustratör', card.artist],
      ['Utgivning', card.releaseDate],
      ['Typ', [card.supertype, ...(card.subtypes ?? [])].filter(Boolean).join(' · ')],
      ['HP', card.hp],
    ].filter(([, v]) => v);
    return h(
      'section',
      { class: 'section' },
      sectionHead('Om kortet'),
      h(
        'dl',
        { class: 'facts' },
        facts.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      ),
      card.setId &&
        h('button', { class: 'btn btn--ghost btn--block', onClick: () => navigate(`/set/${card.provider}/${encodeURIComponent(card.setId)}`) }, icon('book'), `Visa hela ${card.setName}`),
    );
  }

  function drawBottom() {
    const owned = itemsFor(key).length;
    const wished = isWishlisted(key);
    mount(heartBtn, icon('heart', { fill: wished }));
    heartBtn.classList.toggle('is-on', wished);
    mount(
      bottomBar,
      h(
        'button',
        { class: 'btn btn--primary btn--lg grow', onClick: () => openItemSheet({ card, preset: { variant } }) },
        icon('plus'),
        owned ? 'Lägg till ett till' : 'Lägg till i samlingen',
      ),
    );
  }

  function draw() {
    if (!card) {
      mount(
        body,
        loadError
          ? emptyState({
              iconName: 'alert',
              title: 'Kunde inte hämta kortet',
              text: 'Kontrollera internetanslutningen och försök igen.',
              action: h('button', { class: 'btn btn--ghost', onClick: load }, icon('refresh'), 'Försök igen'),
            })
          : h('div', { class: 'card-skeleton' }, h('div', { class: 'skeleton skeleton--hero' }), h('div', { class: 'skeleton skeleton--line' }), h('div', { class: 'skeleton skeleton--block' })),
      );
      bottomBar.hidden = true;
      return;
    }
    if (!variant || !cardVariants(card).includes(variant)) variant = cardVariants(card)[0];
    top.querySelector('.topbar__title').textContent = card.name;
    const est = currentEstimate(key, fromScan);
    const y = window.scrollY;
    const oldHero = body.querySelector('.holo');
    oldHero?.destroy?.();
    mount(body, hero(), priceSection(), estimateBanner(est), gradedSection(est), gradeCta(est), ownedSection(), linksSection(), factsSection());
    bottomBar.hidden = false;
    drawBottom();
    window.scrollTo(0, y);
  }

  async function load() {
    loadError = null;
    if (!card) draw();
    try {
      const fresh = await getCard(provider, id);
      if (!el.isConnected && card) return;
      card = fresh;
      remember([card]);
      addRecent(card, { scanned: fromScan });
    } catch (err) {
      loadError = err;
    }
    draw();
  }

  draw();
  if (card) addRecent(card, { scanned: fromScan });
  load();

  // Show the title in the top bar once the name scrolls away.
  const onScroll = () => top.classList.toggle('is-scrolled', window.scrollY > 260);
  window.addEventListener('scroll', onScroll, { passive: true });
  const unsub = subscribe(() => card && el.isConnected && (drawBottom(), refreshOwned()));
  function refreshOwned() {
    body.querySelector('.section--owned')?.replaceWith(ownedSection());
  }

  return {
    el,
    title: card?.name ?? 'Kort',
    destroy() {
      window.removeEventListener('scroll', onScroll);
      body.querySelector('.holo')?.destroy?.();
      unsub();
    },
  };
}
