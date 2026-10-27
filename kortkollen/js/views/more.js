// Settings, binders, backup, install help and about.

import { h, mount, openSheet, toast, confirmDialog, chips } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { getState, update, settings, exportJSON, exportCSV, importJSON, resetAll, addBinder, renameBinder, deleteBinder, collectionStats } from '../store.js';
import { CURRENCIES, convert } from '../prices.js';
import { COMPANIES } from '../grading.js';
import { applyApiSettings, refreshRates } from '../actions.js';
import { money } from '../format.js';
import { session } from '../session.js';
import { newBinderChip } from '../components/item-sheet.js';
import { DEMO } from '../demo.js';

async function download(name, text, type) {
  // Inside a sandboxed preview, plain download links do nothing; use the host's save dialog.
  const downloads = await window.claude?.use?.('downloads');
  if (downloads) {
    try {
      await downloads.save({ filename: name, data: text });
      toast('Filen sparad', { type: 'ok' });
    } catch {
      toast('Filen sparades inte', { type: 'error' });
    }
    return;
  }
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Filen sparad', { type: 'ok' });
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Sheet explaining how to install the app on the home screen. */
export function installHelp() {
  if (session.installPrompt) {
    session.installPrompt.prompt();
    session.installPrompt.userChoice.finally(() => (session.installPrompt = null));
    return;
  }
  const step = (n, text) => h('li', { class: 'install-step' }, h('span', { class: 'install-step__n' }, String(n)), h('span', {}, text));
  openSheet({
    title: 'Installera Kortkollen',
    content: h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted' }, 'Kortkollen är en webbapp – du lägger den på hemskärmen direkt från webbläsaren. Ingen App Store behövs, och den fungerar offline.'),
      isIos()
        ? h('ol', { class: 'install-steps' }, step(1, 'Öppna sidan i Safari.'), step(2, 'Tryck på Dela-knappen (fyrkanten med pilen uppåt).'), step(3, 'Välj "Lägg till på hemskärmen" och tryck Lägg till.'))
        : h('ol', { class: 'install-steps' }, step(1, 'Öppna sidan i Chrome.'), step(2, 'Tryck på menyn ⋮ uppe till höger.'), step(3, 'Välj "Installera app" eller "Lägg till på startskärmen".')),
    ),
  });
}

/** Explains what the demo build can and cannot do. */
export function demoNotice() {
  return h(
    'div',
    { class: 'banner banner--demo' },
    icon('info', { size: 20 }),
    h(
      'span',
      {},
      h('b', {}, 'Demoläge. '),
      'Här visas ett litet urval exempelkort med exempelpriser, eftersom förhandsvisningen inte når kortdatabasen. Publicera appen på GitHub Pages för alla kort och riktiga priser.',
    ),
  );
}

export function render() {
  const el = h('div', { class: 'view view--more' });

  const group = (title, ...rows) => h('section', { class: 'settings-group' }, title && h('h2', { class: 'settings-group__title' }, title), h('div', { class: 'settings-card' }, rows));
  const row = ({ iconName, label, value, onClick, danger, href }) =>
    h(
      href ? 'a' : 'button',
      { class: `setting ${danger ? 'setting--danger' : ''}`, onClick, href, target: href ? '_blank' : null, rel: href ? 'noopener' : null },
      h('span', { class: 'setting__icon' }, icon(iconName, { size: 19 })),
      h('span', { class: 'setting__label' }, label),
      value != null && h('span', { class: 'setting__value' }, value),
      icon(href ? 'external' : 'chevronRight', { size: 17, cls: 'setting__chev' }),
    );

  function pickSheet(title, options, current, onPick, note) {
    const { close } = openSheet({
      title,
      content: h(
        'div',
        { class: 'option-list' },
        note && h('p', { class: 'muted' }, note),
        options.map((o) =>
          h(
            'button',
            { class: `option ${o.value === current ? 'is-active' : ''}`, onClick: () => (onPick(o.value), close(), draw()) },
            h('span', { class: 'option__radio' }),
            h('span', { class: 'option__text' }, h('b', {}, o.label), o.desc && h('small', {}, o.desc)),
          ),
        ),
      ),
    });
  }

  function costSheet() {
    const s = settings();
    const cur = s.currency;
    const now = convert(s.gradingCost.amount, s.gradingCost.currency, cur, getState().rates ?? undefined) ?? s.gradingCost.amount;
    const input = h('input', { class: 'input', inputmode: 'decimal', value: String(Math.round(now)) });
    const { close } = openSheet({
      title: 'Graderingskostnad',
      content: h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, 'Total kostnad per kort: avgift hos graderingsföretaget, frakt tur och retur, försäkring och eventuell tull/moms. Används för att räkna ut om gradering lönar sig.'),
        h('div', { class: 'input-wrap' }, input, h('span', { class: 'input-suffix' }, cur)),
        h(
          'button',
          {
            class: 'btn btn--primary btn--block',
            onClick: () => {
              const n = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
              if (!(n >= 0)) return toast('Ange ett belopp', { type: 'error' });
              update((st) => {
                st.settings.gradingCost = { amount: n, currency: cur };
              });
              close();
              draw();
            },
          },
          'Spara',
        ),
      ),
    });
  }

  function apiSheet() {
    const s = settings();
    const input = h('input', { class: 'input', placeholder: 'Valfri API-nyckel', value: s.apiKey, autocomplete: 'off', spellcheck: false });
    let provider = s.provider;
    const { close } = openSheet({
      title: 'Kortdatabas',
      content: h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, 'Kortdata och priser hämtas gratis från Pokémon TCG API, med TCGdex som reserv om den inte svarar.'),
        h('label', { class: 'field-label' }, 'Källa'),
        chips(
          [
            { value: 'auto', label: 'Automatisk' },
            { value: 'ptcg', label: 'Pokémon TCG API' },
            { value: 'tcgdex', label: 'TCGdex' },
          ],
          provider,
          (v) => (provider = v),
        ),
        h('label', { class: 'field-label' }, 'API-nyckel för pokemontcg.io'),
        input,
        h('p', { class: 'field-hint' }, 'Utan nyckel: ca 1 000 anrop per dag. En gratis nyckel från dev.pokemontcg.io höjer gränsen. Nyckeln sparas bara på den här enheten.'),
        h(
          'button',
          {
            class: 'btn btn--primary btn--block',
            onClick: () => {
              update((st) => {
                st.settings.apiKey = input.value.trim();
                st.settings.provider = provider;
              });
              applyApiSettings();
              close();
              draw();
              toast('Sparat', { type: 'ok' });
            },
          },
          'Spara',
        ),
      ),
    });
  }

  function bindersSheet() {
    const list = h('div', { class: 'list' });
    const drawList = () =>
      mount(
        list,
        getState().binders.map((b) => {
          const count = getState().items.filter((i) => i.binderIds?.includes(b.id)).length;
          return h(
            'div',
            { class: 'row' },
            h('span', { class: 'option__emoji' }, b.emoji),
            h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, b.name), h('div', { class: 'row__sub' }, `${count} kort`)),
            h(
              'button',
              {
                class: 'icon-btn',
                'aria-label': 'Byt namn',
                onClick: () => {
                  const name = prompt('Nytt namn', b.name);
                  if (name?.trim()) renameBinder(b.id, name), drawList();
                },
              },
              icon('edit', { size: 17 }),
            ),
            h(
              'button',
              {
                class: 'icon-btn',
                'aria-label': 'Ta bort pärm',
                onClick: async () => {
                  if (await confirmDialog({ title: `Ta bort ${b.name}?`, message: 'Korten ligger kvar i samlingen.', confirmLabel: 'Ta bort', danger: true })) {
                    deleteBinder(b.id);
                    drawList();
                  }
                },
              },
              icon('trash', { size: 17 }),
            ),
          );
        }),
        h('div', { class: 'pad-y' }, newBinderChip((name) => (addBinder(name), drawList()))),
      );
    drawList();
    openSheet({ title: 'Pärmar', content: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Sortera korten som i riktiga pärmar – t.ex. "Till salu", "Graderas" eller "Favoriter".'), list), onClose: draw });
  }

  function importFile() {
    const input = h('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { items, wishlist } = importJSON(await file.text(), { merge: true });
        toast(`Importerade ${items} kort och ${wishlist} önskningar`, { type: 'ok' });
        draw();
      } catch (err) {
        toast(err.message || 'Kunde inte läsa filen', { type: 'error' });
      }
    });
    input.click();
  }

  function draw() {
    const s = settings();
    const st = getState();
    const stats = collectionStats();
    const rates = st.rates;
    const cost = convert(s.gradingCost.amount, s.gradingCost.currency, s.currency, rates ?? undefined);
    mount(
      el,
      h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'Mer')),
      DEMO && demoNotice(),
      !DEMO &&
        !isStandalone() &&
        h(
          'button',
          { class: 'install-card', onClick: installHelp },
          h('span', { class: 'install-card__icon' }, icon('phone', { size: 24 })),
          h('span', {}, h('b', {}, 'Lägg appen på hemskärmen'), h('small', {}, 'Fungerar som en vanlig app – utan App Store')),
          icon('chevronRight', { size: 18 }),
        ),
      group(
        'Priser',
        row({
          iconName: 'coins',
          label: 'Valuta',
          value: s.currency,
          onClick: () =>
            pickSheet('Valuta', Object.entries(CURRENCIES).map(([k, v]) => ({ value: k, label: `${k} – ${v.label}` })), s.currency, (v) => {
              update((x) => {
                x.settings.currency = v;
              });
              refreshRates();
            }),
        }),
        row({
          iconName: 'layers',
          label: 'Priskälla',
          value: s.source === 'cardmarket' ? 'Cardmarket' : 'TCGplayer',
          onClick: () =>
            pickSheet(
              'Priskälla',
              [
                { value: 'cardmarket', label: 'Cardmarket (Europa)', desc: 'Trendpris i euro – bäst för svenska köpare och säljare' },
                { value: 'tcgplayer', label: 'TCGplayer (USA)', desc: 'Marknadspris i dollar' },
              ],
              s.source,
              (v) =>
                update((x) => {
                  x.settings.source = v;
                }),
              'Om ett kort saknar pris hos den valda källan används den andra.',
            ),
        }),
        row({ iconName: 'wallet', label: 'Graderingskostnad', value: `${money(cost)}/kort`, onClick: costSheet }),
        row({
          iconName: 'award',
          label: 'Standardföretag',
          value: s.gradingCompany,
          onClick: () =>
            pickSheet('Graderingsföretag', Object.values(COMPANIES).map((c) => ({ value: c.id, label: c.name, desc: c.full })), s.gradingCompany, (v) =>
              update((x) => {
                x.settings.gradingCompany = v;
              }),
            ),
        }),
      ),
      group(
        'Samling',
        row({ iconName: 'folder', label: 'Pärmar', value: String(st.binders.length), onClick: bindersSheet }),
        row({ iconName: 'download', label: 'Säkerhetskopiera (JSON)', onClick: () => download(`kortkollen-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), 'application/json') }),
        row({ iconName: 'upload', label: 'Återställ från säkerhetskopia', onClick: importFile }),
        row({ iconName: 'list', label: 'Exportera till Excel (CSV)', onClick: () => download(`kortkollen-${new Date().toISOString().slice(0, 10)}.csv`, exportCSV(), 'text/csv;charset=utf-8') }),
      ),
      group(
        'Utseende och data',
        row({
          iconName: 'moon',
          label: 'Tema',
          value: { auto: 'Automatiskt', dark: 'Mörkt', light: 'Ljust' }[s.theme],
          onClick: () =>
            pickSheet(
              'Tema',
              [
                { value: 'auto', label: 'Automatiskt', desc: 'Följer telefonens inställning' },
                { value: 'dark', label: 'Mörkt' },
                { value: 'light', label: 'Ljust' },
              ],
              s.theme,
              (v) =>
                update((x) => {
                  x.settings.theme = v;
                }),
            ),
        }),
        row({ iconName: 'layers', label: 'Kortdatabas', value: { auto: 'Automatisk', ptcg: 'Pokémon TCG API', tcgdex: 'TCGdex' }[s.provider], onClick: apiSheet }),
        row({
          iconName: 'trash',
          label: 'Radera all data',
          danger: true,
          onClick: async () => {
            if (await confirmDialog({ title: 'Radera allt?', message: `Samlingen (${stats.count} kort), önskelistan och inställningarna raderas från den här enheten. Gör en säkerhetskopia först om du vill spara något.`, confirmLabel: 'Radera allt', danger: true })) {
              resetAll();
              toast('All data raderad');
              navigate('/');
            }
          },
        }),
      ),
      group(
        'Om',
        h(
          'div',
          { class: 'about' },
          h('p', {}, h('b', {}, 'Kortkollen'), ' – skanna, värdera och samla Pokémonkort. Allt du sparar ligger bara på din enhet.'),
          h('p', { class: 'muted small' }, 'Kortdata och priser: Pokémon TCG API (pokemontcg.io) och TCGdex. Valutakurser: Europeiska centralbanken via Frankfurter. Graderade priser är uppskattningar baserade på marknadsvärde och typiska premier – inte faktiska försäljningar.'),
          h('p', { class: 'muted small' }, 'Kortkollen är inte associerad med Nintendo, The Pokémon Company, PSA, Beckett, CGC eller SGC. Pokémon och kortbilder © respektive ägare.'),
          rates && h('p', { class: 'muted small' }, `Valutakurser från ${rates.date}${rates.fallback ? ' (ungefärliga)' : ''}.`),
        ),
      ),
    );
  }

  draw();
  return { el, title: 'Mer' };
}
