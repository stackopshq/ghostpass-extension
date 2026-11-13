// La correspondance entre les éléments du coffre et la page de l'onglet actif.
//
// Sans import : ce module s'éprouve sous `node --test`.

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

export interface Matchable {
  name: string;
  url: string;
  urls?: string[];
  kind?: string;
}

/** Vrai si l'une des adresses de l'élément correspond à l'hôte de la page. */
export function matchesHost(item: Matchable, host: string | null): boolean {
  // `urls` manque dans une session ouverte avant cette version : on retombe sur `url`.
  const urls = item.urls ?? (item.url ? [item.url] : []);
  return urls.some((u) => hostsMatch(hostFromUrl(u), host));
}

/// Ce qu'on peut remplir sur cette page : les identifiants dont une adresse correspond.
///
/// Une note ou une carte qui porterait l'adresse du site n'a ni identifiant ni mot de passe à
/// poser dans un formulaire : la proposer ferait un bouton « Remplir » qui ne remplit rien.
export function suggestionsFor<T extends Matchable>(items: T[], host: string | null): T[] {
  if (!host) return [];
  return items
    .filter((i) => (i.kind ?? "Login") === "Login" && matchesHost(i, host))
    .sort((a, b) => a.name.localeCompare(b.name));
}
