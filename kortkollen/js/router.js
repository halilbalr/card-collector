// Hash router: "#/card/ptcg/base1-4?x=1" → { name, params, query }.

const routes = [];
let depth = 0;
let handler = null;

/**
 * Register a route. Pattern segments starting with ":" become params.
 * @param {string} pattern e.g. "/card/:provider/:id"
 * @param {string} name
 */
export function route(pattern, name) {
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/\/:([a-z]+)/gi, (_, k) => {
      keys.push(k);
      return '/([^/]+)';
    })}/?$`,
  );
  routes.push({ re, keys, name });
}

/** Parse the current location hash. */
export function current() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { name: r.name, path, params, query: Object.fromEntries(new URLSearchParams(qs)) };
    }
  }
  return { name: 'home', path: '/', params: {}, query: {} };
}

/** Go to an in-app path, e.g. navigate('/card/ptcg/base1-4'). */
export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) {
    history.replaceState(null, '', target);
    handler?.(current());
  } else {
    depth++;
    location.hash = target;
  }
}

/** Back within the app, or to `fallback` when there is no in-app history. */
export function back(fallback = '/') {
  if (depth > 0) {
    depth--;
    history.back();
  } else navigate(fallback, { replace: true });
}

/** Start listening; `onRoute` gets the parsed route on every change. */
export function startRouter(onRoute) {
  handler = onRoute;
  window.addEventListener('hashchange', () => onRoute(current()));
  onRoute(current());
}
