// Grading assistant: centering (photo + editor or sliders) → condition
// questions → likely grade, value per grade and whether grading pays off.

import { h, mount, segmented, toast, haptic, emptyState, cardImage } from '../ui.js';
import { icon } from '../icons.js';
import { back, navigate } from '../router.js';
import { getCard } from '../api.js';
import { getState, settings, update, getEstimate, saveEstimate, gradingCost, valueCtx } from '../store.js';
import {
  COMPANIES,
  CONDITION_QUESTIONS,
  DEFECT_FLAGS,
  BACK_CENTERING,
  estimateGrades,
  formatRatio,
  expectedValue,
  gradingVerdict,
} from '../grading.js';
import { gradedTable } from '../prices.js';
import { money, setLine } from '../format.js';
import { locateCard, cardSnapshot, fileToCanvas } from '../scanner.js';
import { centeringEditor, ratioTone } from '../components/centering-editor.js';
import { slab, gradeNumber } from '../components/slab.js';
import { probabilityBars } from '../components/chart.js';
import { session, remember } from '../session.js';

export function render(route) {
  const { provider, id } = route.params;
  const key = `${provider}:${id}`;
  const st = getState();
  let card = session.cards.get(key) ?? st.items.find((i) => i.key === key)?.card ?? st.recent.find((r) => r.key === key)?.card ?? null;
  const saved = getEstimate(key);

  const input = {
    front: saved?.input?.front ?? null,
    back: saved?.input?.back ?? null,
    corners: saved?.input?.corners ?? null,
    edges: saved?.input?.edges ?? null,
    surface: saved?.input?.surface ?? null,
    flags: [...(saved?.input?.flags ?? [])],
  };
  let centering = saved?.centering ?? null; // { lr, tb }
  let snapshot = session.lastScan?.cardKey === key ? session.lastScan.snapshot : null;
  let mode = snapshot ? 'photo' : 'choose'; // choose | photo | manual
  let step = 0;
  let company = settings().gradingCompany ?? 'PSA';

  const el = h('div', { class: 'view view--grade' });
  const top = h(
    'header',
    { class: 'topbar topbar--solid' },
    h('button', { class: 'icon-btn', 'aria-label': 'Tillbaka', onClick: () => (step > 0 ? go(step - 1) : back(`/card/${provider}/${encodeURIComponent(id)}`)) }, icon('back')),
    h('div', { class: 'topbar__title is-visible' }, 'Graderingskoll'),
    h('div', { class: 'topbar__actions' }),
  );
  const progress = h('div', { class: 'stepper-bar' });
  const body = h('div', { class: 'grade-body' });
  const footer = h('div', { class: 'bottom-bar' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const galleryInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  el.append(top, progress, body, footer, fileInput, galleryInput);

  const STEP_NAMES = ['Centrering', 'Skick', 'Resultat'];

  function go(n) {
    step = n;
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function usePhoto(file) {
    if (!file) return;
    try {
      mount(body, h('div', { class: 'loading-block' }, h('div', { class: 'spinner' }), 'Mäter kortet…'));
      const canvas = await fileToCanvas(file);
      const located = locateCard(canvas, null);
      snapshot = cardSnapshot(canvas, located);
      mode = 'photo';
      if (located.centering?.confidence < 0.4) toast('Kunde inte hitta kanterna säkert – justera linjerna för hand', { duration: 5000 });
    } catch {
      toast('Kunde inte läsa bilden', { type: 'error' });
    }
    draw();
  }
  fileInput.addEventListener('change', () => (usePhoto(fileInput.files?.[0]), (fileInput.value = '')));
  galleryInput.addEventListener('change', () => (usePhoto(galleryInput.files?.[0]), (galleryInput.value = '')));

  // --------------------------------------------------------------- step 0

  function centeringStep() {
    const parts = [
      h('h1', { class: 'step-title' }, 'Hur centrerat är kortet?'),
      h('p', { class: 'step-text' }, 'Centrering är hur jämnt den färgade ramen är fördelad. Det är det enda graderare mäter exakt – och det sätter taket för betyget.'),
    ];
    if (mode === 'choose') {
      parts.push(
        h(
          'div',
          { class: 'choice-list' },
          h(
            'button',
            { class: 'choice', onClick: () => fileInput.click() },
            h('span', { class: 'choice__icon' }, icon('camera')),
            h('span', {}, h('b', {}, 'Fota framsidan'), h('small', {}, 'Rakt ovanifrån, på mörk bakgrund, utan blixt')),
          ),
          h(
            'button',
            { class: 'choice', onClick: () => galleryInput.click() },
            h('span', { class: 'choice__icon' }, icon('image')),
            h('span', {}, h('b', {}, 'Välj en bild'), h('small', {}, 'T.ex. en skanning eller ett tidigare foto')),
          ),
          h(
            'button',
            { class: 'choice', onClick: () => ((mode = 'manual'), draw()) },
            h('span', { class: 'choice__icon' }, icon('sliders')),
            h('span', {}, h('b', {}, 'Uppskatta själv'), h('small', {}, 'Dra reglagen efter vad du ser')),
          ),
        ),
      );
    } else if (mode === 'photo' && snapshot) {
      parts.push(
        h('p', { class: 'hint-box' }, icon('info', { size: 16 }), 'Streckade linjer = kortets kant. Heldragna = där ramen slutar. Dra dem på plats – luppen hjälper dig.'),
        centeringEditor(snapshot, (m) => {
          centering = { lr: m.lr, tb: m.tb };
          input.front = m.worst;
        }),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--ghost', onClick: () => fileInput.click() }, icon('camera'), 'Ny bild'), h('button', { class: 'btn btn--ghost', onClick: () => ((mode = 'manual'), draw()) }, icon('sliders'), 'Reglage')),
      );
    } else {
      parts.push(manualCentering());
    }
    parts.push(
      h('h2', { class: 'field-title' }, 'Baksidan'),
      h('p', { class: 'step-text small' }, 'Jämför de blå kanterna på baksidan.'),
      optionList(BACK_CENTERING, input.back, (v) => (input.back = v)),
    );
    return parts;
  }

  function manualCentering() {
    const lr = centering?.lr ?? 52;
    const tb = centering?.tb ?? 52;
    centering = { lr, tb };
    input.front = Math.max(lr, tb);
    const slider = (label, value, onInput) => {
      const out = h('b', { class: ratioTone(value) }, formatRatio(value));
      const range = h('input', { type: 'range', min: 50, max: 90, step: 1, value, class: 'range', 'aria-label': label });
      range.addEventListener('input', () => {
        const v = Number(range.value);
        out.textContent = formatRatio(v);
        out.className = ratioTone(v);
        onInput(v);
      });
      return h('div', { class: 'slider-field' }, h('div', { class: 'slider-field__head' }, h('span', {}, label), out), range);
    };
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'centering-demo' }, centeringDemo()),
      slider('Vänster / höger', lr, (v) => {
        centering.lr = v;
        input.front = Math.max(centering.lr, centering.tb);
      }),
      slider('Topp / botten', tb, (v) => {
        centering.tb = v;
        input.front = Math.max(centering.lr, centering.tb);
      }),
      h('button', { class: 'link', onClick: () => ((mode = 'choose'), draw()) }, 'Mät med en bild i stället'),
    );
  }

  function centeringDemo() {
    return h(
      'div',
      { class: 'demo-cards' },
      [
        ['50/50', 0.5],
        ['60/40', 0.6],
        ['70/30', 0.7],
      ].map(([label, f]) =>
        h(
          'div',
          { class: 'demo-card' },
          h('div', { class: 'demo-card__box' }, h('div', { class: 'demo-card__inner', style: { left: `${f * 16}%`, right: `${(1 - f) * 16}%` } })),
          h('span', {}, label),
        ),
      ),
    );
  }

  // --------------------------------------------------------------- step 1

  function optionList(options, value, onPick) {
    const list = h('div', { class: 'option-list', role: 'radiogroup' });
    const drawList = (current) =>
      mount(
        list,
        options.map((o) =>
          h(
            'button',
            {
              class: `option ${o.value === current ? 'is-active' : ''}`,
              role: 'radio',
              'aria-checked': String(o.value === current),
              onClick: () => {
                onPick(o.value);
                drawList(o.value);
                haptic(8);
              },
            },
            h('span', { class: 'option__radio' }),
            h('span', { class: 'option__text' }, h('b', {}, o.label), h('small', {}, o.desc)),
          ),
        ),
      );
    drawList(value);
    return list;
  }

  function conditionStep() {
    return [
      h('h1', { class: 'step-title' }, 'Hur ser kortet ut?'),
      h('p', { class: 'step-text' }, 'Var ärlig och kritisk – graderare tittar med lupp och starkt ljus. Den svagaste delen styr betyget mest.'),
      CONDITION_QUESTIONS.map((q) => [
        h('h2', { class: 'field-title' }, q.title),
        h('p', { class: 'step-text small' }, q.hint),
        optionList(q.options, input[q.id], (v) => (input[q.id] = v)),
      ]),
      h('h2', { class: 'field-title' }, 'Skador'),
      h('p', { class: 'step-text small' }, 'Markera allt som stämmer.'),
      h(
        'div',
        { class: 'flag-list' },
        DEFECT_FLAGS.map((f) => {
          const btn = h(
            'button',
            {
              class: `flag ${input.flags.includes(f.id) ? 'is-active' : ''}`,
              'aria-pressed': String(input.flags.includes(f.id)),
              onClick: () => {
                input.flags = input.flags.includes(f.id) ? input.flags.filter((x) => x !== f.id) : [...input.flags, f.id];
                btn.classList.toggle('is-active');
                btn.setAttribute('aria-pressed', String(input.flags.includes(f.id)));
              },
            },
            h('span', { class: 'flag__box' }, icon('check', { size: 14, stroke: 3 })),
            h('span', {}, h('b', {}, f.label), h('small', {}, f.desc)),
          );
          return btn;
        }),
      ),
    ];
  }

  // --------------------------------------------------------------- step 2

  function resultStep() {
    const result = estimateGrades(input);
    const r = result[company];
    const table = card ? gradedTable(card, valueCtx()) : null;
    const grades = table?.companies[company] ?? COMPANIES[company].grades;
    const priceOf = (k) => grades.find((g) => g.key === k)?.price ?? null;
    const likely = r.likely;
    const likelyGrade = COMPANIES[company].grades.find((g) => g.key === likely.key);
    const cost = gradingCost();
    const ev = expectedValue(r.dist, priceOf, cost);
    const rawValue = table?.rawDisplay ?? null;
    const verdict = rawValue != null ? gradingVerdict({ rawValue, net: ev.net, cost }) : null;
    const [lo, hi] = r.range;
    const rows = r.dist
      .filter((d) => d.p >= 0.005)
      .sort((a, b) => b.value - a.value)
      .map((d) => ({ label: `${company} ${gradeNumber(d.key)}${d.key === '10BL' ? ' BL' : d.key === '10P' ? ' P' : ''}`, value: d.p, sub: money(priceOf(d.key)), highlight: d.key === likely.key }));

    const saveBtn = h(
      'button',
      {
        class: 'btn btn--primary btn--lg grow',
        onClick: () => {
          saveEstimate(key, { input: { ...input }, result, centering });
          haptic([10, 40, 10]);
          toast('Bedömningen sparad på kortet', { type: 'ok' });
          navigate(`/card/${provider}/${encodeURIComponent(id)}`, { replace: true });
        },
      },
      icon('check'),
      'Spara bedömning',
    );
    mount(footer, h('button', { class: 'btn btn--ghost', onClick: () => go(0) }, icon('refresh'), 'Gör om'), saveBtn);

    return [
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
      h(
        'section',
        { class: 'result-hero' },
        card && h('div', { class: 'result-hero__slab' }, slab(card, company, likelyGrade, { wear: true, highlight: true, subgrades: company === 'BGS' ? result.subgrades : null })),
        h(
          'div',
          { class: 'result-hero__text' },
          h('span', { class: 'muted' }, 'Troligt betyg'),
          h('div', { class: 'result-hero__grade' }, `${company} ${gradeNumber(likely.key)}`),
          h('div', { class: 'result-hero__label' }, likelyGrade.name),
          h('div', { class: 'pill pill--soft' }, `${Math.round(likely.p * 100)} % sannolikhet`),
          h('p', { class: 'muted small' }, lo === hi ? 'Mycket säker bedömning' : `Troligen mellan ${company} ${gradeNumber(lo)} och ${gradeNumber(hi)}`),
          h('p', { class: 'muted small' }, `Säkerhet: ${result.confidence}`),
        ),
      ),
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Sannolikhet per betyg'), probabilityBars(rows)),
      card &&
        h(
          'section',
          { class: `verdict verdict--${verdict?.level ?? ''}` },
          h('b', {}, verdict ? (verdict.level === 'good' ? '✅ Gradering lönar sig troligen' : verdict.level === 'maybe' ? '🤔 Marginellt – kan löna sig' : '❌ Lönar sig troligen inte') : 'Prisdata saknas'),
          h(
            'dl',
            { class: 'facts facts--compact' },
            h('dt', {}, 'Ograderat värde'),
            h('dd', {}, money(rawValue)),
            h('dt', {}, `Förväntat som ${company}`),
            h('dd', {}, money(ev.gross)),
            h('dt', {}, 'Graderingskostnad'),
            h('dd', {}, `− ${money(cost)}`),
            h('dt', {}, 'Netto'),
            h('dd', {}, h('b', {}, money(ev.net))),
          ),
        ),
      h(
        'section',
        { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Underlag'),
        h(
          'dl',
          { class: 'facts facts--compact' },
          h('dt', {}, 'Centrering fram'),
          h('dd', {}, centering ? `${formatRatio(centering.lr)} · ${formatRatio(centering.tb)}` : 'Ej mätt'),
          h('dt', {}, 'Centrering bak'),
          h('dd', {}, input.back ? `upp till ${formatRatio(input.back)}` : 'Ej angett'),
          ...CONDITION_QUESTIONS.flatMap((q) => [h('dt', {}, q.title), h('dd', {}, q.options.find((o) => o.value === input[q.id])?.label ?? 'Ej angett')]),
          h('dt', {}, 'Skador'),
          h('dd', {}, input.flags.length ? input.flags.map((f) => DEFECT_FLAGS.find((d) => d.id === f)?.label).join(', ') : 'Inga'),
        ),
      ),
      h('p', { class: 'fine-print' }, icon('info', { size: 14 }), ' En bedömning utifrån det du angett – inte en garanti. Graderare ser saker som är svåra att se i en mobil, så räkna med att utfallet kan bli ett steg lägre.'),
    ];
  }

  // ----------------------------------------------------------------- draw

  function draw() {
    mount(
      progress,
      STEP_NAMES.map((n, i) => h('div', { class: `stepper-bar__step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}` }, h('span', {}, String(i + 1)), n)),
    );
    if (!card) {
      mount(body, h('div', { class: 'loading-block' }, h('div', { class: 'spinner' }), 'Hämtar kortet…'));
      mount(footer);
      return;
    }
    const head = h(
      'div',
      { class: 'grade-card' },
      h('div', { class: 'row__thumb' }, cardImage(card.images?.small, card.name)),
      h('div', {}, h('div', { class: 'row__title' }, card.name), h('div', { class: 'row__sub' }, setLine(card))),
    );
    if (step === 0) {
      mount(body, head, centeringStep());
      mount(footer, h('button', { class: 'btn btn--primary btn--lg grow', onClick: () => go(1) }, mode === 'choose' && input.front == null ? 'Hoppa över' : 'Nästa', icon('chevronRight')));
    } else if (step === 1) {
      mount(body, head, conditionStep());
      mount(footer, h('button', { class: 'btn btn--ghost', onClick: () => go(0) }, icon('back'), 'Tillbaka'), h('button', { class: 'btn btn--primary btn--lg grow', onClick: () => go(2) }, 'Visa resultat', icon('sparkles')));
    } else {
      mount(body, head, resultStep());
    }
  }

  draw();
  if (!card || card.partial) {
    getCard(provider, id)
      .then((c) => {
        card = c;
        remember([c]);
        if (el.isConnected) draw();
      })
      .catch(() => {
        if (!card) mount(body, emptyState({ iconName: 'alert', title: 'Kunde inte hämta kortet', text: 'Kontrollera anslutningen.' }));
      });
  }
  return { el, title: 'Graderingskoll' };
}
