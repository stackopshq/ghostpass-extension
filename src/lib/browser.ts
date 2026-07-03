// Namespace WebExtensions unifié, basé sur les **promesses**.
//
// Piège cross-browser : sur Firefox (et Safari), `chrome.*` est **callback** et seul `browser.*`
// renvoie des promesses ; sur Chromium (MV3), `chrome.*` renvoie des promesses et `browser` n'existe
// pas. On expose donc `browser` = `globalThis.browser ?? globalThis.chrome`, qui est promis partout.
// Typé via `typeof chrome` (@types/chrome) — structurellement compatible avec l'usage qu'on en fait.
export const browser: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? globalThis.chrome;
