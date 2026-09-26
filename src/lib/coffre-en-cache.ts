// Le coffre CHIFFRÉ, gardé sur le disque, pour déverrouiller sans réseau.
//
// ─── Pourquoi ce fichier existe ───
//
// `doUnlock` appelait `api.login()` à CHAQUE déverrouillage. Verrouiller
// équivalait donc à se déconnecter, et sur un compte à second facteur il
// fallait ressaisir le code à six chiffres toutes les quinze minutes.
//
// Ni Bitwarden ni Dashlane ne font cela, et pour une raison de fond : ils
// distinguent deux gestes que l'extension confondait.
//
//   verrouiller     la clé quitte la mémoire ; le coffre CHIFFRÉ reste en
//                   cache. Le déverrouillage redérive la clé depuis le mot de
//                   passe maître, localement. Aucun appel serveur, aucun 2FA.
//   se déconnecter  tout est effacé. La prochaine entrée est une vraie
//                   connexion, avec second facteur.
//
// GhostPass fait déjà le bon modèle sur iPhone : « l'application dépose sur
// l'appareil une copie chiffrée du coffre ; l'extension lit cette copie, et ne
// parle jamais au serveur ». C'est l'extension navigateur qui était
// l'exception.
//
// ─── Ce que ce cache contient, et ce qu'il coûte ───
//
// Uniquement du CHIFFRÉ : les mêmes octets que le serveur détient, et que le
// serveur lui-même ne sait pas lire. Ni mot de passe, ni clé dérivée, ni jeton
// de session.
//
// Le coût est réel et il faut le nommer : quelqu'un qui obtient l'accès au
// disque peut tenter le mot de passe maître HORS LIGNE, sans la limite de débit
// du serveur. Argon2id avec 64 Mio et 3 passes rend chaque essai cher, et c'est
// le compromis qu'ont retenu tous les gestionnaires comparables. Le cache
// s'efface à la déconnexion explicite et au changement de serveur.

const CLE = "coffreEnCache";

/** Le peu de `browser.storage.local` dont ce module a besoin.
 *
 * Passé en paramètre plutôt qu'importé : le service worker donne le vrai
 * magasin, un test en donne un faux, et ce fichier n'a plus besoin de savoir
 * qu'il tourne dans une extension. Sans cela il tirait `./browser.js`, que
 * Node ne sait pas résoudre, et il restait donc intestable.
 */
export interface Magasin {
  get(cle: string): Promise<Record<string, unknown>>;
  set(valeurs: Record<string, unknown>): Promise<void>;
  remove(cle: string): Promise<void>;
}

/** Un élément tel que le serveur le rend : chiffré, opaque. */
export interface ElementChiffre {
  id: string;
  encryptedKey: string;
  encryptedData: string;
}

export interface CoffreEnCache {
  /** À qui appartient ce cache. Changer de compte l'invalide. */
  email: string;
  /** L'adresse du serveur d'où il vient. En changer l'invalide aussi. */
  base: string;
  kdfParams: string;
  encryptedUserKey: string;
  encryptedPrivateKey: string;
  elements: ElementChiffre[];
  /** Quand la dernière relève a eu lieu, pour le dire à l'écran. */
  releveA: number;
}

export async function lireLeCoffre(
  magasin: Magasin,
  email: string,
  base: string,
): Promise<CoffreEnCache | null> {
  try {
    const brut = (await magasin.get(CLE))[CLE] as CoffreEnCache | undefined;
    if (!brut || typeof brut.kdfParams !== "string") return null;
    // Un cache d'un AUTRE compte ou d'un autre serveur n'est pas le nôtre. Le
    // rendre quand même ferait échouer le déverrouillage avec un message de
    // mot de passe invalide, ce qui enverrait chercher au mauvais endroit.
    if (brut.email !== email || brut.base !== base) return null;
    return brut;
  } catch {
    return null;
  }
}

export async function ecrireLeCoffre(magasin: Magasin, coffre: CoffreEnCache): Promise<void> {
  try {
    await magasin.set({ [CLE]: coffre });
  } catch {
    // Un cache qu'on ne peut pas écrire n'est pas une panne : le
    // déverrouillage suivant repassera simplement par le réseau.
  }
}

export async function oublierLeCoffre(magasin: Magasin): Promise<void> {
  try {
    await magasin.remove(CLE);
  } catch {
    /* rien à oublier */
  }
}
