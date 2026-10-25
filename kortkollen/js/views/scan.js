// Full-screen scanner: live camera with a card guide, photo upload fallback,
// analysis progress and a result sheet with the best matches.

import { h, mount, openSheet, toast, haptic, cardImage } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, back } from '../router.js';
import { Camera, analyzePhoto, fileToCanvas } from '../scanner.js';
import { loadOcr, onOcrProgress } from '../ocr.js';
import { getState, update, addItem, addRecent, removeItems, cardKey } from '../store.js';
import { cardPriceLabel, setLine } from '../format.js';
import { formatRatio, centeringCap } from '../grading.js';
import { remember, session } from '../session.js';

const STEPS = {
  locate: 'Hittar kortet…',
  read: 'Läser namn och nummer…',
  lookup: 'Söker i kortdatabasen…',
  compare: 'Jämför med kortbilder…',
};

const OCR_STATUS = {
  'loading tesseract core': 'Laddar textigenkänning',
  'initializing tesseract': 'Startar textigenkänning',
  'loading language traineddata': 'Laddar språkdata',
  'initializing api': 'Startar textigenkänning',
};

export function render() {
  const video = h('video', { class: 'scan__video', playsinline: true, muted: true, autoplay: true });
  const camera = new Camera(video);
  const guide = h(
    'div',
    { class: 'scan__guide', 'aria-hidden': 'true' },
    h('span', { class: 'corner tl' }),
    h('span', { class: 'corner tr' }),
    h('span', { class: 'corner bl' }),
    h('span', { class: 'corner br' }),
    h('span', { class: 'scan__beam' }),
  );
  const tip = h('div', { class: 'scan__tip' }, 'Lägg kortet på en mörk yta och fyll ramen');
  const freeze = h('div', { class: 'scan__freeze', hidden: true });
  const status = h('div', { class: 'scan__status', hidden: true });
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const torchBtn = h('button', { class: 'scan__round', 'aria-label': 'Ficklampa', hidden: true }, icon('zap'));
  const quick = getState().settings.quickAdd;
  const quickBtn = h(
    'button',
    { class: `scan__pill ${quick ? 'is-on' : ''}`, 'aria-pressed': String(quick), title: 'Lägg till säkra träffar direkt i samlingen' },
    icon('bolt', { size: 16 }),
    h('span', {}, 'Snabbläge'),
  );
  const shutter = h('button', { class: 'scan__shutter', 'aria-label': 'Ta bild och skanna' }, h('span'));
  const fallback = h('div', { class: 'scan__fallback', hidden: true });

  let busy = false;
  let torch = false;
  let destroyed = false;

  const el = h(
    'div',
    { class: 'view view--scan' },
    video,
    h('div', { class: 'scan__frame' }, guide, tip),
    freeze,
    status,
    fallback,
    h(
      'header',
      { class: 'scan__top' },
      h('button', { class: 'scan__round', 'aria-label': 'Stäng', onClick: () => back('/') }, icon('x')),
      h('div', { class: 'scan__title' }, 'Skanna kort'),
      torchBtn,
    ),
    h(
      'footer',
      { class: 'scan__bottom' },
      h('button', { class: 'scan__round scan__round--lg', 'aria-label': 'Välj bild', onClick: () => fileInput.click() }, icon('image')),
      shutter,
      quickBtn,
    ),
    fileInput,
  );

  quickBtn.addEventListener('click', () => {
    const on = !getState().settings.quickAdd;
    update((s) => {
      s.settings.quickAdd = on;
    });
    quickBtn.classList.toggle('is-on', on);
    quickBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Snabbläge på – säkra träffar läggs till direkt' : 'Snabbläge av');
  });

  torchBtn.addEventListener('click', async () => {
    torch = !torch;
    try {
      await camera.setTorch(torch);
      torchBtn.classList.toggle('is-on', torch);
    } catch {
      torchBtn.hidden = true;
    }
  });

  const showFallback = (reason) => {
    el.classList.add('no-camera');
    mount(
      fallback,
      h('div', { class: 'scan__fallback-icon' }, icon('camera', { size: 34 })),
      h('h2', {}, 'Kameran är inte tillgänglig'),
      h('p', {}, reason),
      h('button', { class: 'btn btn--primary btn--block', onClick: () => fileInput.click() }, icon('camera'), 'Fota eller välj bild'),
      h('button', { class: 'btn btn--ghost btn--block', onClick: () => navigate('/search') }, icon('search'), 'Sök manuellt'),
    );
    fallback.hidden = false;
  };

  async function startCamera() {
    if (!Camera.supported) {
      showFallback(window.isSecureContext ? 'Din webbläsare saknar kamerastöd.' : 'Kameran kräver att appen öppnas via https.');
      return;
    }
    try {
      await camera.start();
      if (destroyed) return camera.stop();
      el.classList.add('is-live');
      torchBtn.hidden = !camera.torchSupported;
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      showFallback(
        denied
          ? 'Du har nekat kameraåtkomst. Tillåt kameran för den här sidan i webbläsarens inställningar – eller fota med kameraappen.'
          : 'Kunde inte starta kameran. Du kan fortfarande fota kortet med kameraappen.',
      );
    }
  }

  // Warm up OCR so the first scan is quick; show progress the first time.
  const offProgress = onOcrProgress((m) => {
    const label = OCR_STATUS[m.status];
    if (label && !busy) tip.textContent = `${label}… ${Math.round((m.progress ?? 0) * 100)} %`;
    if (m.status === 'initialized api' || (m.status === 'initializing api' && m.progress === 1)) tip.textContent = 'Lägg kortet på en mörk yta och fyll ramen';
  });
  loadOcr()
    .then(() => !busy && (tip.textContent = 'Lägg kortet på en mörk yta och fyll ramen'))
    .catch(() => (tip.textContent = 'Textigenkänningen kunde inte laddas – kontrollera internet'));

  function setStatus(step) {
    status.hidden = false;
    mount(
      status,
      h('div', { class: 'spinner' }),
      h('div', { class: 'scan__status-text' }, STEPS[step] ?? 'Analyserar…'),
      h(
        'div',
        { class: 'scan__steps' },
        Object.keys(STEPS).map((k) => h('span', { class: `dot ${k === step ? 'is-active' : ''}` })),
      ),
    );
  }

  function unfreeze() {
    busy = false;
    freeze.hidden = true;
    status.hidden = true;
    el.classList.remove('is-busy');
  }

  async function process(canvas, hint) {
    busy = true;
    el.classList.add('is-busy');
    haptic(15);
    freeze.hidden = false;
    mount(freeze, h('img', { src: canvas.toDataURL('image/jpeg', 0.7), alt: '' }));
    try {
      const result = await analyzePhoto(canvas, { hint, onStep: setStatus });
      status.hidden = true;
      const best = result.candidates[0];
      session.lastScan = { snapshot: result.snapshot, cardKey: best ? cardKey(best) : null, at: Date.now(), hints: result.hints };
      remember(result.candidates);
      if (best && getState().settings.quickAdd && best.confidence >= 0.8) {
        quickAdd(best);
        unfreeze();
        return;
      }
      showResult(result);
    } catch (err) {
      console.error(err);
      status.hidden = true;
      showResult({ candidates: [], hints: {}, error: err });
    }
  }

  function quickAdd(card) {
    const item = addItem({ card });
    addRecent(card, { scanned: true });
    haptic([10, 40, 10]);
    toast(`${card.name} (${card.setName} #${card.number}) tillagt`, {
      type: 'ok',
      action: 'Ångra',
      onAction: () => removeItems([item.uid]),
    });
  }

  function showResult({ candidates, hints, located, snapshot, error }) {
    const best = candidates[0];
    const sure = best && best.confidence >= 0.55;
    const centering = snapshot?.centering;
    const warnings = [];
    if (located?.quality) {
      if (located.quality.sharpness < 6) warnings.push('Bilden ser suddig ut – håll stilla och låt kameran fokusera.');
      if (located.quality.glare > 0.04) warnings.push('Reflexer i bilden – vinkla kortet bort från lampan.');
    }
    if (best && !(centering?.confidence > 0.4)) warnings.push('Kortets kanter syntes inte helt – håll hela kortet inom ramen för att mäta centreringen.');
    const open = (card) => {
      addRecent(card, { scanned: true });
      sheet.close();
      navigate(`/card/${card.provider}/${encodeURIComponent(card.id)}?scan=1`);
    };
    const add = (card) => {
      const item = addItem({ card });
      addRecent(card, { scanned: true });
      haptic([10, 40, 10]);
      sheet.close();
      toast(`${card.name} tillagt i samlingen`, { type: 'ok', action: 'Ångra', onAction: () => removeItems([item.uid]) });
    };
    const searchText = [hints?.name, hints?.number && (hints.total ? `${hints.number}/${hints.total}` : hints.number)].filter(Boolean).join(' ');

    const content = () => {
      if (!best) {
        return h(
          'div',
          { class: 'scan-result scan-result--none' },
          h('div', { class: 'scan-result__icon' }, icon('alert', { size: 28 })),
          h('h2', {}, error ? 'Något gick fel' : 'Kunde inte känna igen kortet'),
          h('p', { class: 'muted' }, error?.message && !/HTTP/.test(error.message) ? error.message : 'Se till att hela kortet syns i ramen, i bra ljus och utan reflexer.'),
          searchText && h('p', { class: 'scan-result__read' }, 'Läste: ', h('b', {}, searchText)),
          warnings.map((w) => h('p', { class: 'warn' }, icon('alert', { size: 16 }), w)),
          h('button', { class: 'btn btn--primary btn--block', onClick: () => sheet.close() }, icon('camera'), 'Försök igen'),
          h('button', { class: 'btn btn--ghost btn--block', onClick: () => (sheet.close(), navigate(`/search?q=${encodeURIComponent(searchText)}`)) }, icon('search'), 'Sök manuellt'),
        );
      }
      const others = candidates.slice(1, 6);
      return h(
        'div',
        { class: 'scan-result' },
        h(
          'div',
          { class: 'scan-result__best' },
          h('div', { class: 'scan-result__img' }, cardImage(best.images?.small, best.name)),
          h(
            'div',
            { class: 'scan-result__info' },
            h('span', { class: `pill ${sure ? 'pill--good' : 'pill--warn'}` }, sure ? 'Träff' : 'Osäker träff'),
            h('h2', { class: 'scan-result__name' }, best.name),
            h('div', { class: 'muted' }, setLine(best)),
            best.rarity && h('div', { class: 'muted small' }, best.rarity),
            h('div', { class: 'scan-result__price' }, cardPriceLabel(best)),
            centering?.worst != null &&
              centering.confidence > 0.4 &&
              h(
                'div',
                { class: 'scan-result__centering' },
                icon('ruler', { size: 15 }),
                `Centrering ${formatRatio(centering.lr)} · ${formatRatio(centering.tb)}`,
                h('span', { class: 'muted' }, ` → max PSA ${centeringCap('PSA', centering.worst, null)}`),
              ),
          ),
        ),
        warnings.map((w) => h('p', { class: 'warn' }, icon('alert', { size: 16 }), w)),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn btn--ghost', onClick: () => add(best) }, icon('plus'), 'Lägg till'),
          h('button', { class: 'btn btn--primary', onClick: () => open(best) }, 'Visa värden', icon('chevronRight')),
        ),
        others.length
          ? h(
              'details',
              { class: 'scan-result__others', open: !sure },
              h('summary', {}, 'Inte rätt kort? Fler förslag'),
              h(
                'div',
                { class: 'list' },
                others.map((c) =>
                  h(
                    'button',
                    { class: 'row', onClick: () => open(c) },
                    h('div', { class: 'row__thumb' }, cardImage(c.images?.small, c.name)),
                    h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, c.name), h('div', { class: 'row__sub' }, setLine(c))),
                    h('div', { class: 'row__end' }, h('div', { class: 'row__value' }, cardPriceLabel(c))),
                  ),
                ),
              ),
            )
          : null,
        h('button', { class: 'link link--center', onClick: () => (sheet.close(), navigate(`/search?q=${encodeURIComponent(searchText || best.name)}`)) }, 'Sök manuellt i stället'),
      );
    };
    haptic(best ? [10, 30, 10] : 40);
    const sheet = openSheet({ title: best ? 'Resultat' : null, content, onClose: unfreeze, cls: 'sheet--scan' });
  }

  shutter.addEventListener('click', () => {
    if (busy || !el.classList.contains('is-live') || !video.videoWidth) return;
    const { canvas, hint } = camera.capture(guide.getBoundingClientRect());
    process(canvas, hint);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || busy) return;
    try {
      const canvas = await fileToCanvas(file);
      process(canvas, null);
    } catch {
      toast('Kunde inte läsa bilden', { type: 'error' });
    }
  });

  const onVisibility = () => {
    if (document.hidden) {
      camera.stop();
      el.classList.remove('is-live');
    } else if (!destroyed && !el.classList.contains('no-camera')) startCamera();
  };
  document.addEventListener('visibilitychange', onVisibility);
  startCamera();

  return {
    el,
    title: 'Skanna',
    destroy() {
      destroyed = true;
      camera.stop();
      offProgress();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
