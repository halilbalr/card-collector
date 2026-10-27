// Bootstraps the app: routing, tab bar, theme, onboarding, offline support.

import { route, startRouter, navigate } from './router.js';
import { h, mount, closeAllSheets, toast, openSheet } from './ui.js';
import { icon } from './icons.js';
import { getState, update, subscribe, flush } from './store.js';
import { applyApiSettings, autoRefresh } from './actions.js';
import { pruneCache } from './api.js';
import { DEMO } from './demo.js';
import { session } from './session.js';
import * as home from './views/home.js';
import * as search from './views/search.js';
import * as scan from './views/scan.js';
import * as card from './views/card.js';
import * as grade from './views/grade.js';
import * as library from './views/library.js';
import * as set from './views/set.js';
import * as more from './views/more.js';

route('/', 'home');
route('/search', 'search');
route('/scan', 'scan');
route('/card/:provider/:id', 'card');
route('/grade/:provider/:id', 'grade');
route('/library', 'library');
route('/set/:provider/:id', 'set');
route('/more', 'more');

const VIEWS = { home, search, scan, card, grade, library, set, more };
const TABS = [
  { name: 'home', path: '/', label: 'Hem', icon: 'home' },
  { name: 'search', path: '/search', label: 'Sök', icon: 'search' },
  { name: 'scan', path: '/scan', label: 'Skanna', icon: 'scan', primary: true },
  { name: 'library', path: '/library', label: 'Samling', icon: 'cards' },
  { name: 'more', path: '/more', label: 'Mer', icon: 'sliders' },
];

const viewRoot = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let current = null;

function drawTabbar(active) {
  mount(
    tabbar,
    TABS.map((t) =>
      h(
        'a',
        {
          class: `tab ${t.primary ? 'tab--primary' : ''} ${t.name === active ? 'is-active' : ''}`,
          href: `#${t.path}`,
          'aria-label': t.label,
          'aria-current': t.name === active ? 'page' : null,
          onClick: (e) => {
            e.preventDefault();
            if (t.name === active) window.scrollTo({ top: 0, behavior: 'smooth' });
            else navigate(t.path);
          },
        },
        h('span', { class: 'tab__icon' }, icon(t.icon, { size: t.primary ? 26 : 22 })),
        !t.primary && h('span', { class: 'tab__label' }, t.label),
      ),
    ),
  );
}

function onRoute(r) {
  closeAllSheets();
  try {
    current?.destroy?.();
  } catch {
    /* ignore */
  }
  const view = VIEWS[r.name] ?? home;
  const result = view.render(r);
  current = result instanceof Node ? { el: result } : result;
  mount(viewRoot, current.el);
  document.body.dataset.route = r.name;
  drawTabbar(r.name);
  document.title = current.title ? `${current.title} · Kortkollen` : 'Kortkollen – Pokémonkort';
  window.scrollTo(0, 0);
}

function applyTheme() {
  const theme = getState().settings.theme;
  // In demo mode the host page may set data-theme itself; leave it alone on "auto".
  if (theme === 'auto') {
    if (!DEMO) document.documentElement.removeAttribute('data-theme');
  }
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d14' : '#f4f5fa');
}

function onboarding() {
  if (getState().settings.onboarded) return;
  const slides = [
    { icon: 'scan', title: 'Skanna dina kort', text: 'Rikta kameran mot ett kort – Kortkollen läser namn och nummer och hittar rätt kort och version.' },
    { icon: 'award', title: 'Se graderade värden', text: 'Se kortet i PSA-, BGS-, CGC- och SGC-slabbar, vad varje betyg kan vara värt och vilket betyg ditt kort troligen får.' },
    { icon: 'cards', title: 'Bygg din samling', text: 'Lägg till och ta bort kort, sortera i pärmar och följ värdet över tid. Allt sparas på telefonen.' },
  ];
  let i = 0;
  const body = h('div', { class: 'onboard' });
  const finish = () => {
    update((s) => {
      s.settings.onboarded = true;
    });
    sheet.close();
  };
  const draw = () => {
    const s = slides[i];
    mount(
      body,
      h('div', { class: 'onboard__icon' }, icon(s.icon, { size: 40 })),
      h('h2', { class: 'onboard__title' }, s.title),
      h('p', { class: 'onboard__text' }, s.text),
      h('div', { class: 'onboard__dots' }, slides.map((_, k) => h('span', { class: k === i ? 'is-active' : '' }))),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn btn--ghost', onClick: finish }, 'Hoppa över'),
        h('button', { class: 'btn btn--primary grow', onClick: () => (i < slides.length - 1 ? (i++, draw()) : finish()) }, i < slides.length - 1 ? 'Nästa' : 'Kom igång'),
      ),
    );
  };
  draw();
  const sheet = openSheet({ content: body, onClose: () => update((s) => (s.settings.onboarded = true)), cls: 'sheet--onboard' });
}

function registerServiceWorker() {
  if (DEMO || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Reload only when the user asked for the update – not when the very first
  // service worker takes control of the page.
  let updating = false;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const offer = (worker) =>
        toast('En ny version av Kortkollen finns', {
          action: 'Uppdatera',
          duration: 15000,
          onAction: () => {
            updating = true;
            worker.postMessage('skipWaiting');
          },
        });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating) return;
    updating = false;
    location.reload();
  });
}

function init() {
  applyTheme();
  applyApiSettings();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  let lastTheme = getState().settings.theme;
  subscribe((state, info) => {
    if (info?.error) toast('Lagringen är full – exportera en säkerhetskopia och rensa gamla data.', { type: 'error', duration: 8000 });
    if (state.settings.theme !== lastTheme) {
      lastTheme = state.settings.theme;
      applyTheme();
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    session.installPrompt = e;
  });
  const setOnline = () => document.body.classList.toggle('is-offline', navigator.onLine === false);
  window.addEventListener('online', () => (setOnline(), toast('Du är online igen', { type: 'ok' })));
  window.addEventListener('offline', () => (setOnline(), toast('Du är offline – sparade kort och priser visas')));
  setOnline();
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  window.addEventListener('pagehide', flush);

  startRouter(onRoute);
  registerServiceWorker();
  setTimeout(pruneCache, 3000);
  navigator.storage?.persist?.().catch(() => {});
  setTimeout(onboarding, 400);
  setTimeout(autoRefresh, 1200);
}

init();
