// Add/edit sheet for a collection entry.

import { h, mount, openSheet, chips, segmented, stepper, toast, haptic, cardImage, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { COMPANIES } from '../grading.js';
import { CONDITIONS, VARIANT_LABELS, cardVariants, defaultVariant, itemValue } from '../prices.js';
import { getState, addItem, updateItem, removeItems, restoreItems, addBinder, valueCtx, settings } from '../store.js';
import { money, setLine } from '../format.js';
import { gradeNumber } from './slab.js';

/** "+ Ny pärm" chip that turns into an inline name field. */
export function newBinderChip(onCreate) {
  const wrap = h('span', { class: 'new-binder' });
  const idle = () =>
    mount(
      wrap,
      h('button', { class: 'chip chip--dashed', onClick: editing }, icon('plus', { size: 14 }), 'Ny pärm'),
    );
  const editing = () => {
    const input = h('input', { class: 'chip-input', placeholder: 'Namn, t.ex. Favoriter', maxlength: 40, 'aria-label': 'Namn på pärm' });
    const ok = () => {
      const name = input.value.trim();
      if (name) onCreate(name);
      else idle();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') idle();
    });
    mount(wrap, input, h('button', { class: 'chip is-active', onClick: ok }, icon('check', { size: 14 }), 'Skapa'));
    setTimeout(() => input.focus(), 30);
  };
  idle();
  return wrap;
}

/**
 * Open the sheet. With `item` it edits that entry, otherwise it adds a new one.
 * @param {{card:object, item?:object, preset?:{variant?:string, grade?:object}}} opts
 */
export function openItemSheet({ card, item = null, preset = {}, onSaved }) {
  const editing = !!item;
  const draft = {
    variant: item?.variant ?? preset.variant ?? defaultVariant(card),
    graded: !!(item?.grade && item.grade.company !== 'RAW') || !!preset.grade,
    condition: item?.condition ?? 'NM',
    company: item?.grade?.company && item.grade.company !== 'RAW' ? item.grade.company : preset.grade?.company ?? settings().gradingCompany ?? 'PSA',
    gradeKey: item?.grade?.key ?? preset.grade?.key ?? '10',
    manual: item?.grade?.manualValue ?? null,
    qty: item?.qty ?? 1,
    purchase: item?.purchase?.amount ?? null,
    binderIds: [...(item?.binderIds ?? [])],
    notes: item?.notes ?? '',
  };
  const cur = settings().currency;

  const valueLine = h('div', { class: 'item-sheet__value' });
  const gradeBox = h('div', { class: 'item-sheet__grade' });
  const binderBox = h('div');

  const toEntry = () => ({
    card,
    variant: draft.variant,
    condition: draft.condition,
    qty: draft.qty,
    grade: draft.graded
      ? {
          company: draft.company,
          key: draft.gradeKey,
          ...(draft.manual != null ? { manualValue: draft.manual, manualCurrency: cur } : {}),
        }
      : null,
    purchase: draft.purchase != null ? { amount: draft.purchase, currency: cur } : null,
    binderIds: draft.binderIds,
    notes: draft.notes.trim(),
  });

  const refreshValue = () => {
    const v = itemValue(toEntry(), valueCtx());
    mount(valueLine, h('span', { class: 'muted' }, draft.qty > 1 ? `Värde (${draft.qty} st)` : 'Uppskattat värde'), h('b', {}, money(v)));
  };

  const numberInput = (value, placeholder, onChange) => {
    const input = h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'decimal',
      placeholder,
      value: value != null ? String(value).replace('.', ',') : '',
    });
    input.addEventListener('input', () => {
      const n = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
      onChange(Number.isFinite(n) && n >= 0 ? n : null);
    });
    return h('div', { class: 'input-wrap' }, input, h('span', { class: 'input-suffix' }, cur));
  };

  const drawGrade = () => {
    if (!draft.graded) {
      mount(
        gradeBox,
        h('label', { class: 'field-label' }, 'Skick'),
        chips(
          CONDITIONS.map((c) => ({ value: c.id, label: `${c.short} · ${c.label}` })),
          draft.condition,
          (v) => {
            draft.condition = v;
            refreshValue();
          },
          { cls: 'chips--wrap' },
        ),
      );
      return;
    }
    const company = COMPANIES[draft.company];
    if (!company.grades.some((g) => g.key === draft.gradeKey)) draft.gradeKey = '10';
    mount(
      gradeBox,
      h('label', { class: 'field-label' }, 'Graderingsföretag'),
      chips(
        Object.values(COMPANIES).map((c) => ({ value: c.id, label: c.name })),
        draft.company,
        (v) => {
          draft.company = v;
          drawGrade();
          refreshValue();
        },
      ),
      h('label', { class: 'field-label' }, 'Betyg'),
      chips(
        company.grades.map((g) => ({ value: g.key, label: g.key === '10BL' ? '10 Black Label' : g.key === '10P' ? '10 Pristine' : gradeNumber(g.key) })),
        draft.gradeKey,
        (v) => {
          draft.gradeKey = v;
          refreshValue();
        },
        { cls: 'chips--wrap' },
      ),
      h('label', { class: 'field-label' }, 'Känt värde per kort (valfritt)'),
      numberInput(draft.manual, 'Använd uppskattning', (v) => {
        draft.manual = v;
        refreshValue();
      }),
      h('p', { class: 'field-hint' }, 'Har du sett vad exakt den här slabben säljs för? Ange det så används det i stället för uppskattningen.'),
    );
  };

  const drawBinders = () => {
    const binders = getState().binders;
    mount(
      binderBox,
      h('label', { class: 'field-label' }, 'Pärmar'),
      h(
        'div',
        { class: 'chips chips--wrap' },
        binders.map((b) => {
          const on = draft.binderIds.includes(b.id);
          return h(
            'button',
            {
              class: `chip ${on ? 'is-active' : ''}`,
              onClick: () => {
                draft.binderIds = on ? draft.binderIds.filter((x) => x !== b.id) : [...draft.binderIds, b.id];
                drawBinders();
              },
            },
            `${b.emoji} ${b.name}`,
          );
        }),
        newBinderChip((name) => {
          const b = addBinder(name);
          draft.binderIds.push(b.id);
          drawBinders();
        }),
      ),
    );
  };

  const variants = cardVariants(card);
  const notes = h('textarea', { class: 'input', rows: 2, placeholder: 'T.ex. "Från 151-booster, sleevad direkt"' }, draft.notes);
  notes.addEventListener('input', () => (draft.notes = notes.value));

  const save = () => {
    const entry = toEntry();
    if (editing) {
      updateItem(item.uid, entry);
      toast('Ändringarna sparade', { type: 'ok' });
    } else {
      const added = addItem(entry);
      haptic([10, 40, 10]);
      toast(`${card.name} tillagt i samlingen`, { type: 'ok', action: 'Ångra', onAction: () => removeItems([added.uid]) });
    }
    sheet.close();
    onSaved?.();
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Ta bort kortet?', message: `${card.name} (${draft.qty} st) tas bort ur samlingen.`, confirmLabel: 'Ta bort', danger: true });
    if (!ok) return;
    const removed = removeItems([item.uid]);
    sheet.close();
    toast(`${card.name} borttaget`, { action: 'Ångra', onAction: () => restoreItems(removed) });
  };

  const content = h(
    'div',
    { class: 'item-sheet' },
    h(
      'div',
      { class: 'item-sheet__card' },
      h('div', { class: 'row__thumb row__thumb--lg' }, cardImage(card.images?.small, card.name)),
      h('div', {}, h('div', { class: 'row__title' }, card.name), h('div', { class: 'row__sub' }, setLine(card)), card.rarity && h('div', { class: 'row__sub' }, card.rarity)),
    ),
    variants.length > 1 &&
      h(
        'div',
        {},
        h('label', { class: 'field-label' }, 'Variant'),
        chips(
          variants.map((v) => ({ value: v, label: VARIANT_LABELS[v] ?? v })),
          draft.variant,
          (v) => {
            draft.variant = v;
            refreshValue();
          },
          { cls: 'chips--wrap' },
        ),
      ),
    segmented(
      [
        { value: false, label: 'Ograderat' },
        { value: true, label: 'Graderat' },
      ],
      draft.graded,
      (v) => {
        draft.graded = v;
        drawGrade();
        refreshValue();
      },
      { cls: 'seg--block' },
    ),
    gradeBox,
    h(
      'div',
      { class: 'field-row' },
      h('div', {}, h('label', { class: 'field-label' }, 'Antal'), stepper(draft.qty, (v) => ((draft.qty = v), refreshValue()))),
      h(
        'div',
        { class: 'grow' },
        h('label', { class: 'field-label' }, 'Inköpspris per kort'),
        numberInput(draft.purchase, 'Valfritt', (v) => (draft.purchase = v)),
      ),
    ),
    binderBox,
    h('div', {}, h('label', { class: 'field-label' }, 'Anteckning'), notes),
    valueLine,
    h(
      'div',
      { class: 'btn-row' },
      editing && h('button', { class: 'btn btn--danger-ghost', onClick: remove }, icon('trash'), 'Ta bort'),
      h('button', { class: 'btn btn--primary grow', onClick: save }, icon(editing ? 'check' : 'plus'), editing ? 'Spara' : 'Lägg till i samlingen'),
    ),
  );

  drawGrade();
  drawBinders();
  refreshValue();
  const sheet = openSheet({ title: editing ? 'Redigera' : 'Lägg till', content, tall: true });
  return sheet;
}
