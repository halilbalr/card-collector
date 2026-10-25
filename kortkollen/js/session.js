// In-memory state that should not be persisted: cards seen this session
// (for instant rendering) and the most recent scan photo.

export const session = {
  /** @type {Map<string, object>} cardKey → normalised card */
  cards: new Map(),
  /** Last scan: { dataUrl, centering, cardKey, at } */
  lastScan: null,
  /** Deferred PWA install prompt (Android/desktop Chrome). */
  installPrompt: null,
};

/** Remember cards so a detail page can render before the network answers. */
export function remember(cards) {
  for (const c of cards) if (c?.id) session.cards.set(`${c.provider}:${c.id}`, c);
}
