// One set: every card, what you own, what is missing and what it would cost.

import { h, mount, segmented, skeletonGrid, emptyState, cardImage } from '../ui.js';
import { icon } from '../icons.js';
import { back, navigate } from '../router.js';
import { getSetCards } from '../api.js';
import { getState } from '../store.js';
import { money, cardPrice } from '../format.js';
import { normalizeNumber } from '../ocr-parse.js';
import { cardTile } from '../components/card-tile.js';
import { remember } from '../session.js';

export function render(route) {
  const { provider, id } = route.params;
  let filter = 'all';
  let data = null;
  let error = null;

  const el = h('div', { class: 'view view--set' });
  const top = h(
    'header',
    { class: 'topbar topbar--solid' },
    h('button', { class: 'icon-btn', 'aria-label': 'Tillbaka', onClick: () => back('/search') }, icon('back')),
    h('div', { class: 'topbar__title is-visible' }, 'Set'),
    h('div', { class: 'topbar__actions' }),
  );
  const body = h('div');
  el.append(top, body);

  function owned() {
    const set = new Set();
    for (const item of getState().items) if (item.card.setId === id && item.card.provider === provider) set.add(normalizeNumber(item.card.number));
    return set;
  }

  function draw() {
    if (error) {
      mount(body, emptyState({ iconName: 'alert', title: 'Kunde inte hämta setet', text: 'Kontrollera anslutningen och försök igen.', action: h('button', { class: 'btn btn--ghost', onClick: load }, icon('refresh'), 'Försök igen') }));
      return;
    }
    if (!data) {
      mount(body, h('div', { class: 'skeleton skeleton--banner' }), skeletonGrid(9));
      return;
    }
    const { set, cards } = data;
    const have = owned();
    const main = cards.filter((c) => !set?.printedTotal || (parseInt(c.number, 10) <= set.printedTotal && /^\d+$/.test(String(c.number))));
    const ownedMain = main.filter((c) => have.has(normalizeNumber(c.number))).length;
    const total = set?.printedTotal ?? main.length;
    const pct = total ? Math.min(1, ownedMain / total) : 0;
    const missing = main.filter((c) => !have.has(normalizeNumber(c.number)));
    const missingCost = missing.reduce((a, c) => a + (cardPrice(c) ?? 0), 0);
    const shown = cards.filter((c) => {
      const isOwned = have.has(normalizeNumber(c.number));
      return filter === 'all' || (filter === 'owned' ? isOwned : !isOwned);
    });
    top.querySelector('.topbar__title').textContent = set?.name ?? 'Set';
    mount(
      body,
      h(
        'section',
        { class: 'set-hero' },
        set?.logo && h('div', { class: 'set-hero__logo' }, cardImage(set.logo, set.name)),
        h('h1', { class: 'set-hero__name' }, set?.name ?? id),
        h('div', { class: 'muted' }, [set?.series, set?.releaseDate?.slice(0, 4), `${cards.length} kort inkl. hemliga`].filter(Boolean).join(' · ')),
        h('div', { class: 'set-hero__progress' }, h('div', { class: 'progress progress--lg' }, h('span', { style: { width: `${Math.max(1, pct * 100)}%` } })), h('b', {}, `${ownedMain} / ${total}`)),
        missing.length > 0 && h('div', { class: 'muted small' }, `Saknas ${missing.length} kort i huvudsetet · ca ${money(missingCost)} att komplettera`),
      ),
      segmented(
        [
          { value: 'all', label: 'Alla' },
          { value: 'owned', label: 'Har' },
          { value: 'missing', label: 'Saknas' },
        ],
        filter,
        (v) => {
          filter = v;
          draw();
        },
        { cls: 'seg--block' },
      ),
      shown.length
        ? h(
            'div',
            { class: 'grid' },
            shown.map((c) => {
              const isOwned = have.has(normalizeNumber(c.number));
              return cardTile(c, {
                price: c.partial ? null : money(cardPrice(c)),
                owned: isOwned,
                dim: !isOwned,
                sub: `#${c.number}${c.rarity ? ` · ${c.rarity}` : ''}`,
                onClick: () => {
                  remember([c]);
                  navigate(`/card/${c.provider}/${encodeURIComponent(c.id)}`);
                },
              });
            }),
          )
        : emptyState({ iconName: 'cards', title: filter === 'owned' ? 'Inga kort från setet ännu' : 'Komplett!', text: filter === 'owned' ? 'Skanna eller sök för att lägga till.' : 'Du har alla kort i det här setet. 🎉' }),
    );
  }

  async function load() {
    error = null;
    draw();
    try {
      data = await getSetCards(provider, id);
      remember(data.cards);
    } catch (err) {
      error = err;
    }
    if (el.isConnected || !data) draw();
  }
  load();
  return { el, title: 'Set' };
}
