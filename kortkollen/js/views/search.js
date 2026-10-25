// Card search with set filter, recent searches and new sets.

import { h, mount, skeletonGrid, emptyState, openSheet, debounce, cardImage, sectionHead } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { searchCards, getSets } from '../api.js';
import { getState, addSearch, clearSearches, itemsFor, cardKey } from '../store.js';
import { cardPriceLabel } from '../format.js';
import { cardTile } from '../components/card-tile.js';
import { remember } from '../session.js';

const POPULAR = ['Charizard', 'Pikachu', 'Umbreon', 'Mew', 'Lugia', 'Rayquaza', 'Gengar', 'Eevee'];

/** Sheet listing every set, filterable. Calls onPick(set). */
export function pickSet(onPick) {
  const list = h('div', { class: 'set-list' }, h('div', { class: 'loading-line' }, 'Hämtar set…'));
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Filtrera set…', 'aria-label': 'Filtrera set' });
  let all = [];
  const draw = () => {
    const f = input.value.trim().toLowerCase();
    const shown = all.filter((s) => !f || s.name.toLowerCase().includes(f) || s.series.toLowerCase().includes(f) || (s.code ?? '').toLowerCase() === f);
    let series = null;
    mount(
      list,
      shown.length
        ? shown.map((s) => {
            const head = s.series !== series ? ((series = s.series), h('div', { class: 'set-list__series' }, s.series || 'Övrigt')) : null;
            return [
              head,
              h(
                'button',
                { class: 'set-row', onClick: () => onPick(s) },
                h('span', { class: 'set-row__symbol' }, s.symbol ? cardImage(s.symbol, '') : null),
                h('span', { class: 'set-row__name' }, s.name),
                h('span', { class: 'set-row__meta' }, [s.releaseDate?.slice(0, 4), s.printedTotal && `${s.printedTotal} kort`].filter(Boolean).join(' · ')),
              ),
            ];
          })
        : h('p', { class: 'muted pad' }, 'Inga set matchar.'),
    );
  };
  input.addEventListener('input', draw);
  getSets()
    .then((sets) => {
      all = sets;
      draw();
    })
    .catch(() => mount(list, h('p', { class: 'muted pad' }, 'Kunde inte hämta set. Kontrollera anslutningen.')));
  return openSheet({ title: 'Välj set', tall: true, content: h('div', {}, h('div', { class: 'sheet-search' }, input), list) });
}

export function render(route) {
  const state = {
    text: route.query.q ?? '',
    setId: route.query.set ?? '',
    setName: route.query.setName ?? '',
    page: 1,
    cards: [],
    total: 0,
    loading: false,
    error: null,
    token: 0,
  };

  const input = h('input', {
    class: 'search__input',
    type: 'search',
    inputmode: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    placeholder: 'Namn, t.ex. "Charizard 4/102"',
    'aria-label': 'Sök kort',
    value: state.text,
  });
  const clearBtn = h('button', { class: 'search__clear', type: 'button', 'aria-label': 'Rensa', onClick: () => ((input.value = ''), onInput(), input.focus()) }, icon('x', { size: 18 }));
  const form = h(
    'form',
    {
      class: 'search',
      role: 'search',
      onSubmit: (e) => {
        e.preventDefault();
        input.blur();
        addSearch(input.value);
        run(1);
      },
    },
    icon('search', { size: 20, cls: 'search__icon' }),
    input,
    clearBtn,
  );
  const filters = h('div', { class: 'filters' });
  const results = h('div', { class: 'results' });

  const syncUrl = () => {
    const p = new URLSearchParams();
    if (state.text) p.set('q', state.text);
    if (state.setId) p.set('set', state.setId), p.set('setName', state.setName);
    history.replaceState(null, '', `#/search${p.toString() ? `?${p}` : ''}`);
  };

  const drawFilters = () =>
    mount(
      filters,
      state.setId
        ? h(
            'button',
            { class: 'chip is-active', onClick: () => ((state.setId = ''), (state.setName = ''), drawFilters(), run(1)) },
            icon('book', { size: 15 }),
            state.setName || state.setId,
            icon('x', { size: 14 }),
          )
        : h(
            'button',
            {
              class: 'chip',
              onClick: () => {
                const sheet = pickSet((s) => {
                  sheet.close();
                  state.setId = s.id;
                  state.setName = s.name;
                  drawFilters();
                  run(1);
                });
              },
            },
            icon('book', { size: 15 }),
            'Alla set',
            icon('chevronDown', { size: 14 }),
          ),
    );

  const drawIdle = () => {
    const st = getState();
    const sets = h('div', { class: 'list' }, h('div', { class: 'loading-line' }, 'Hämtar nya set…'));
    getSets()
      .then((all) =>
        mount(
          sets,
          all.slice(0, 8).map((s) =>
            h(
              'button',
              { class: 'row', onClick: () => navigate(`/set/${s.provider}/${encodeURIComponent(s.id)}`) },
              h('div', { class: 'row__logo row__logo--wide' }, s.logo ? cardImage(s.logo, s.name) : icon('book')),
              h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, s.name), h('div', { class: 'row__sub' }, `${s.series} · ${s.releaseDate?.slice(0, 4) ?? ''}`)),
              icon('chevronRight', { size: 18, cls: 'muted' }),
            ),
          ),
        ),
      )
      .catch(() => mount(sets, h('p', { class: 'muted' }, 'Kunde inte hämta set just nu.')));
    mount(
      results,
      st.searches.length
        ? h(
            'section',
            { class: 'section' },
            sectionHead('Senaste sökningar', h('button', { class: 'link', onClick: () => (clearSearches(), drawIdle()) }, 'Rensa')),
            h('div', { class: 'chips chips--wrap' }, st.searches.map((s) => h('button', { class: 'chip', onClick: () => ((input.value = s), onInput(true)) }, icon('refresh', { size: 14 }), s))),
          )
        : null,
      h(
        'section',
        { class: 'section' },
        sectionHead('Populära'),
        h('div', { class: 'chips chips--wrap' }, POPULAR.map((s) => h('button', { class: 'chip', onClick: () => ((input.value = s), onInput(true)) }, s))),
      ),
      h('section', { class: 'section' }, sectionHead('Nyaste seten'), sets),
    );
  };

  const drawResults = () => {
    if (state.error) {
      mount(
        results,
        emptyState({
          iconName: 'alert',
          title: 'Sökningen misslyckades',
          text: 'Kortdatabasen svarar inte just nu. Kontrollera anslutningen och försök igen.',
          action: h('button', { class: 'btn btn--ghost', onClick: () => run(state.page) }, icon('refresh'), 'Försök igen'),
        }),
      );
      return;
    }
    if (state.loading && !state.cards.length) {
      mount(results, skeletonGrid(9));
      return;
    }
    if (!state.cards.length) {
      mount(
        results,
        emptyState({
          iconName: 'search',
          title: 'Inga kort hittades',
          text: 'Prova en annan stavning, bara Pokémonens namn, eller sök på nummer som "25/102".',
        }),
      );
      return;
    }
    const grid = h(
      'div',
      { class: 'grid' },
      state.cards.map((card) =>
        cardTile(card, {
          price: card.partial ? null : cardPriceLabel(card),
          owned: itemsFor(cardKey(card)).length > 0,
          onClick: () => {
            remember([card]);
            addSearch(input.value);
            navigate(`/card/${card.provider}/${encodeURIComponent(card.id)}`);
          },
        }),
      ),
    );
    mount(
      results,
      h('div', { class: 'results__count muted' }, `${state.total} ${state.total === 1 ? 'träff' : 'träffar'}`),
      grid,
      state.cards.length < state.total &&
        h(
          'button',
          { class: 'btn btn--ghost btn--block', disabled: state.loading, onClick: () => run(state.page + 1) },
          state.loading ? 'Hämtar…' : 'Visa fler',
        ),
    );
  };

  async function run(page) {
    state.text = input.value.trim();
    syncUrl();
    if (!state.text && !state.setId) {
      state.cards = [];
      drawIdle();
      return;
    }
    const token = ++state.token;
    state.loading = true;
    state.error = null;
    if (page === 1) state.cards = [];
    drawResults();
    try {
      const res = await searchCards({ text: state.text, setId: state.setId, page, pageSize: 30 });
      if (token !== state.token) return;
      remember(res.cards);
      state.cards = page === 1 ? res.cards : [...state.cards, ...res.cards];
      state.total = res.total;
      state.page = page;
    } catch (err) {
      if (token !== state.token) return;
      state.error = err;
    }
    state.loading = false;
    drawResults();
  }

  const debounced = debounce(() => run(1), 450);
  function onInput(now = false) {
    form.classList.toggle('has-value', !!input.value);
    if (now === true) {
      addSearch(input.value);
      run(1);
    } else debounced();
  }
  input.addEventListener('input', onInput);
  form.classList.toggle('has-value', !!input.value);

  const el = h(
    'div',
    { class: 'view view--search' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'Sök kort')),
    h('div', { class: 'sticky-search' }, form, filters),
    results,
  );
  drawFilters();
  if (state.text || state.setId) run(1);
  else drawIdle();
  if (!state.text && route.query.focus) setTimeout(() => input.focus(), 50);
  return { el, title: 'Sök' };
}
