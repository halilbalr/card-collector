// The collection (grid/list, filters, sorting, bulk actions) and the wishlist.

import { h, mount, segmented, openSheet, toast, emptyState, confirmDialog, cardImage, haptic, debounce } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { getState, subscribe, update, collectionStats, removeItems, restoreItems, updateWish, toggleWishlist, settings, valueCtx, rates } from '../store.js';
import { itemValue, convert, formatPct } from '../prices.js';
import { money, cardPrice, gradeLabel, setLine } from '../format.js';
import { cardTile } from '../components/card-tile.js';
import { openItemSheet } from '../components/item-sheet.js';
import { remember } from '../session.js';

const SORTS = [
  { value: 'value', label: 'Värde – högst först' },
  { value: 'added', label: 'Senast tillagda' },
  { value: 'name', label: 'Namn A–Ö' },
  { value: 'set', label: 'Set och nummer' },
  { value: 'profit', label: 'Störst vinst' },
];

const openCard = (card) => {
  remember([card]);
  navigate(`/card/${card.provider}/${encodeURIComponent(card.id)}`);
};

export function render(route) {
  const ui = {
    tab: route.query.tab === 'wish' ? 'wish' : 'owned',
    filter: route.query.binder ? `binder:${route.query.binder}` : 'all',
    text: '',
    selecting: false,
    selected: new Set(),
  };
  const el = h('div', { class: 'view view--library' });
  const content = h('div');
  const actionBar = h('div', { class: 'bottom-bar bottom-bar--select', hidden: true });

  const search = h('input', { class: 'search__input', type: 'search', placeholder: 'Filtrera', 'aria-label': 'Filtrera samlingen' });
  search.addEventListener(
    'input',
    debounce(() => {
      ui.text = search.value.trim().toLowerCase();
      drawContent();
    }, 200),
  );

  function header() {
    const st = getState();
    const stats = collectionStats();
    return h(
      'header',
      { class: 'page-head' },
      h('h1', { class: 'page-title' }, 'Samling'),
      h(
        'div',
        { class: 'page-head__sub' },
        h('b', {}, money(stats.value)),
        h('span', { class: 'muted' }, ` · ${stats.count} kort · ${stats.unique} unika`),
      ),
      segmented(
        [
          { value: 'owned', label: `Mina kort (${st.items.length})` },
          { value: 'wish', label: `Önskelista (${st.wishlist.length})` },
        ],
        ui.tab,
        (v) => {
          ui.tab = v;
          ui.selecting = false;
          ui.selected.clear();
          history.replaceState(null, '', `#/library${v === 'wish' ? '?tab=wish' : ''}`);
          draw();
        },
        { cls: 'seg--block' },
      ),
    );
  }

  // ------------------------------------------------------------ collection

  function filtered() {
    const st = getState();
    const ctx = valueCtx();
    let items = st.items.map((item) => ({ item, value: itemValue(item, ctx) }));
    if (ui.filter === 'graded') items = items.filter(({ item }) => item.grade && item.grade.company !== 'RAW');
    else if (ui.filter === 'raw') items = items.filter(({ item }) => !item.grade || item.grade.company === 'RAW');
    else if (ui.filter.startsWith('binder:')) items = items.filter(({ item }) => item.binderIds?.includes(ui.filter.slice(7)));
    if (ui.text) items = items.filter(({ item }) => `${item.card.name} ${item.card.setName} ${item.card.number}`.toLowerCase().includes(ui.text));
    const cost = (item) => (item.purchase?.amount != null ? (convert(item.purchase.amount, item.purchase.currency, ctx.currency, ctx.rates) ?? 0) * item.qty : null);
    const sort = settings().librarySort;
    const by = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      added: (a, b) => b.item.addedAt.localeCompare(a.item.addedAt),
      name: (a, b) => a.item.card.name.localeCompare(b.item.card.name, 'sv'),
      set: (a, b) =>
        (b.item.card.releaseDate ?? '').localeCompare(a.item.card.releaseDate ?? '') ||
        (parseInt(a.item.card.number, 10) || 0) - (parseInt(b.item.card.number, 10) || 0),
      profit: (a, b) => (b.value ?? 0) - (cost(b.item) ?? b.value ?? 0) - ((a.value ?? 0) - (cost(a.item) ?? a.value ?? 0)),
    }[sort] ?? (() => 0);
    return items.sort(by);
  }

  function filterChips() {
    const st = getState();
    const opts = [
      { value: 'all', label: 'Alla' },
      { value: 'graded', label: 'Graderade' },
      { value: 'raw', label: 'Ograderade' },
      ...st.binders.map((b) => ({ value: `binder:${b.id}`, label: `${b.emoji} ${b.name}` })),
    ];
    return h(
      'div',
      { class: 'chips chips--scroll' },
      opts.map((o) =>
        h(
          'button',
          {
            class: `chip ${ui.filter === o.value ? 'is-active' : ''}`,
            onClick: () => {
              ui.filter = o.value;
              draw();
            },
          },
          o.label,
        ),
      ),
    );
  }

  function toolbar() {
    const view = settings().libraryView;
    return h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'search search--compact' }, icon('search', { size: 18, cls: 'search__icon' }), search),
      h('button', { class: 'icon-btn icon-btn--soft', 'aria-label': 'Sortera', onClick: sortSheet }, icon('sort', { size: 20 })),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--soft',
          'aria-label': view === 'grid' ? 'Visa som lista' : 'Visa som rutnät',
          onClick: () => {
            update((s) => {
              s.settings.libraryView = view === 'grid' ? 'list' : 'grid';
            });
            drawContent();
          },
        },
        icon(view === 'grid' ? 'list' : 'grid', { size: 20 }),
      ),
      h(
        'button',
        {
          class: `icon-btn icon-btn--soft ${ui.selecting ? 'is-on' : ''}`,
          'aria-label': 'Välj flera',
          onClick: () => {
            ui.selecting = !ui.selecting;
            ui.selected.clear();
            draw();
          },
        },
        icon('select', { size: 20 }),
      ),
    );
  }

  function sortSheet() {
    const { close } = openSheet({
      title: 'Sortera',
      content: h(
        'div',
        { class: 'option-list' },
        SORTS.map((s) =>
          h(
            'button',
            {
              class: `option ${settings().librarySort === s.value ? 'is-active' : ''}`,
              onClick: () => {
                update((st) => {
                  st.settings.librarySort = s.value;
                });
                close();
                drawContent();
              },
            },
            h('span', { class: 'option__radio' }),
            h('span', { class: 'option__text' }, h('b', {}, s.label)),
          ),
        ),
      ),
    });
  }

  function toggleSelect(uid) {
    ui.selected.has(uid) ? ui.selected.delete(uid) : ui.selected.add(uid);
    haptic(6);
    drawContent();
  }

  function ownedList() {
    const st = getState();
    if (!st.items.length) {
      return emptyState({
        iconName: 'cards',
        title: 'Samlingen är tom',
        text: 'Skanna eller sök upp dina kort och lägg till dem här. Allt sparas på din telefon.',
        action: h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn btn--ghost', onClick: () => navigate('/search') }, icon('search'), 'Sök'),
          h('button', { class: 'btn btn--primary', onClick: () => navigate('/scan') }, icon('scan'), 'Skanna'),
        ),
      });
    }
    const rows = filtered();
    if (!rows.length) return emptyState({ iconName: 'search', title: 'Inga kort matchar', text: 'Ändra filtret eller sökningen.' });
    const ctx = valueCtx();
    if (settings().libraryView === 'list') {
      return h(
        'div',
        { class: 'list' },
        rows.map(({ item, value }) => {
          const cost = item.purchase?.amount != null ? (convert(item.purchase.amount, item.purchase.currency, ctx.currency, ctx.rates) ?? 0) * item.qty : null;
          const pnl = cost != null && value != null ? value - cost : null;
          return h(
            'div',
            { class: `row ${ui.selected.has(item.uid) ? 'is-selected' : ''}` },
            h(
              'button',
              { class: 'row__hit', 'aria-label': item.card.name, onClick: () => (ui.selecting ? toggleSelect(item.uid) : openCard(item.card)) },
              ui.selecting && h('span', { class: `checkbox ${ui.selected.has(item.uid) ? 'is-on' : ''}` }, icon('check', { size: 14, stroke: 3 })),
              h('div', { class: 'row__thumb' }, cardImage(item.card.images?.small, item.card.name)),
              h(
                'div',
                { class: 'row__main' },
                h('div', { class: 'row__title' }, item.card.name, item.qty > 1 && h('span', { class: 'muted' }, ` ×${item.qty}`)),
                h('div', { class: 'row__sub' }, setLine(item.card)),
                h('span', { class: 'grade-chip grade-chip--sm' }, gradeLabel(item)),
              ),
              h(
                'div',
                { class: 'row__end' },
                h('div', { class: 'row__value' }, money(value)),
                pnl != null && h('div', { class: `row__sub ${pnl >= 0 ? 'up' : 'down'}` }, `${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}`),
              ),
            ),
            !ui.selecting && h('button', { class: 'icon-btn', 'aria-label': 'Redigera', onClick: () => openItemSheet({ card: item.card, item }) }, icon('edit', { size: 18 })),
          );
        }),
      );
    }
    return h(
      'div',
      { class: 'grid' },
      rows.map(({ item, value }) =>
        cardTile(item.card, {
          price: money(value),
          badge: gradeLabel(item),
          qty: item.qty,
          selectable: ui.selecting,
          selected: ui.selected.has(item.uid),
          onClick: () => (ui.selecting ? toggleSelect(item.uid) : openCard(item.card)),
        }),
      ),
    );
  }

  function drawActionBar() {
    actionBar.hidden = !(ui.selecting && ui.tab === 'owned');
    if (actionBar.hidden) return;
    const n = ui.selected.size;
    const st = getState();
    mount(
      actionBar,
      h('button', { class: 'btn btn--ghost', onClick: () => ((ui.selecting = false), ui.selected.clear(), draw()) }, 'Klar'),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          disabled: !n || !st.binders.length,
          onClick: () => moveSheet(),
        },
        icon('folder'),
        'Pärm',
      ),
      h(
        'button',
        {
          class: 'btn btn--danger grow',
          disabled: !n,
          onClick: async () => {
            const ok = await confirmDialog({ title: `Ta bort ${n} kort?`, message: 'De tas bort ur samlingen. Du kan ångra direkt efteråt.', confirmLabel: 'Ta bort', danger: true });
            if (!ok) return;
            const removed = removeItems([...ui.selected]);
            ui.selected.clear();
            ui.selecting = false;
            toast(`${removed.length} kort borttagna`, { action: 'Ångra', onAction: () => restoreItems(removed) });
          },
        },
        icon('trash'),
        n ? `Ta bort (${n})` : 'Ta bort',
      ),
    );
  }

  function moveSheet() {
    const st = getState();
    const { close } = openSheet({
      title: 'Lägg i pärm',
      content: h(
        'div',
        { class: 'option-list' },
        st.binders.map((b) =>
          h(
            'button',
            {
              class: 'option',
              onClick: () => {
                update((s) => {
                  for (const item of s.items) if (ui.selected.has(item.uid) && !item.binderIds?.includes(b.id)) item.binderIds = [...(item.binderIds ?? []), b.id];
                });
                toast(`${ui.selected.size} kort lagda i ${b.name}`, { type: 'ok' });
                ui.selected.clear();
                ui.selecting = false;
                close();
                draw();
              },
            },
            h('span', { class: 'option__emoji' }, b.emoji),
            h('span', { class: 'option__text' }, h('b', {}, b.name)),
          ),
        ),
      ),
    });
  }

  // -------------------------------------------------------------- wishlist

  function targetSheet(w) {
    const cur = settings().currency;
    const input = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'T.ex. 500', value: w.target != null ? String(Math.round(w.target)) : '' });
    const { close } = openSheet({
      title: 'Målpris',
      content: h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, `Vi markerar ${w.card.name} när marknadspriset går under ditt målpris. Nu: ${money(cardPrice(w.card, w.variant))}.`),
        h('div', { class: 'input-wrap' }, input, h('span', { class: 'input-suffix' }, cur)),
        h(
          'div',
          { class: 'btn-row' },
          w.target != null && h('button', { class: 'btn btn--ghost', onClick: () => (updateWish(w.uid, { target: null }), close()) }, 'Ta bort målpris'),
          h(
            'button',
            {
              class: 'btn btn--primary grow',
              onClick: () => {
                const n = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
                updateWish(w.uid, { target: Number.isFinite(n) && n > 0 ? n : null });
                close();
              },
            },
            'Spara',
          ),
        ),
      ),
    });
    setTimeout(() => input.focus(), 250);
  }

  function wishList() {
    const st = getState();
    if (!st.wishlist.length) {
      return emptyState({
        iconName: 'heart',
        title: 'Önskelistan är tom',
        text: 'Tryck på hjärtat på ett kort för att spara det här och sätta ett målpris.',
        action: h('button', { class: 'btn btn--primary', onClick: () => navigate('/search') }, icon('search'), 'Hitta kort'),
      });
    }
    return h(
      'div',
      { class: 'list' },
      st.wishlist.map((w) => {
        const price = cardPrice(w.card, w.variant);
        const hit = w.target != null && price != null && price <= w.target;
        return h(
          'div',
          { class: `row ${hit ? 'row--hit' : ''}` },
          h(
            'button',
            { class: 'row__hit', onClick: () => openCard(w.card) },
            h('div', { class: 'row__thumb' }, cardImage(w.card.images?.small, w.card.name)),
            h(
              'div',
              { class: 'row__main' },
              h('div', { class: 'row__title' }, w.card.name),
              h('div', { class: 'row__sub' }, setLine(w.card)),
              hit ? h('span', { class: 'pill pill--good' }, icon('target', { size: 12 }), 'Under målpris') : null,
            ),
            h(
              'div',
              { class: 'row__end' },
              h('div', { class: 'row__value' }, money(price)),
              h('div', { class: 'row__sub' }, w.target != null ? `Mål ${money(w.target)}` : ''),
            ),
          ),
          h(
            'div',
            { class: 'row__actions' },
            h('button', { class: 'icon-btn', 'aria-label': 'Sätt målpris', onClick: () => targetSheet(w) }, icon('target', { size: 18 })),
            h(
              'button',
              {
                class: 'icon-btn',
                'aria-label': 'Jag har den – lägg till i samlingen',
                onClick: () => openItemSheet({ card: w.card, preset: { variant: w.variant }, onSaved: () => toggleWishlist(w.card) }),
              },
              icon('plus', { size: 18 }),
            ),
            h(
              'button',
              {
                class: 'icon-btn',
                'aria-label': 'Ta bort från önskelistan',
                onClick: () => {
                  toggleWishlist(w.card);
                  toast(`${w.card.name} borttaget`, { action: 'Ångra', onAction: () => toggleWishlist(w.card, w.variant) });
                },
              },
              icon('x', { size: 18 }),
            ),
          ),
        );
      }),
    );
  }

  function drawContent() {
    mount(content, ui.tab === 'owned' ? ownedList() : wishList());
    drawActionBar();
  }

  function draw() {
    const st = getState();
    mount(el, header(), ui.tab === 'owned' && st.items.length ? [toolbar(), filterChips()] : null, content, actionBar);
    drawContent();
  }

  draw();
  let queued = false;
  const unsub = subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!el.isConnected) return;
      const focused = document.activeElement === search;
      draw();
      if (focused) search.focus();
    });
  });
  return { el, title: 'Samling', destroy: unsub };
}
