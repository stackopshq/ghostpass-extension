// Les règles de correspondance de domaine, et RIEN d'autre.
//
// Elles vivaient dans `messages.ts`, qui importe `./browser.js` — donc elles
// n'étaient éprouvables qu'en chargeant l'extension dans un navigateur,
// c'est-à-dire jamais. Ce module n'importe rien : Node le charge tel quel.
//
// Ce ne sont pas des détails. `pourLHote` décide si l'extension propose quelque
// chose sur une page, sur tous les sites en https. Une règle trop large fait
// apparaître une pastille partout, jusqu'à ce qu'on cesse de la regarder ; une
// règle trop étroite ne propose rien là où il faudrait.

/** Hostname normalisé (sans `www.`) d'une URL éventuellement sans schéma. `null` si invalide. */
export function hostFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Vrai si deux hôtes correspondent (égaux ou l'un sous-domaine de l'autre). */
export function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Les éléments dont l'adresse correspond à cet hôte.
 *
 * Un élément SANS adresse ne correspond à aucun site : `hostsMatch` rend faux
 * dès qu'un côté est nul. Le contraire ferait apparaître une proposition sur
 * chaque page du web.
 */
export function pourLHote<T extends { uris?: string[] }>(items: T[], host: string): T[] {
  const cible = hostFromUrl(host);
  // `?? []` pour la même raison que dans le popup : une entrée d'une forme
  // antérieure ne doit pas faire lever la règle, elle doit simplement ne
  // correspondre à rien.
  return items.filter((i) => (i.uris ?? []).some((u) => hostsMatch(hostFromUrl(u), cible)));
}
