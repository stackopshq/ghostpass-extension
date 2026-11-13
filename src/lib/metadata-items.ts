// Noms réservés que l'application web donne à ses items de **métadonnées**.
//
// Ce ne sont pas des secrets : ce sont deux notes sécurisées à nom réservé, chiffrées par la clé
// du coffre, dans lesquelles l'application web range le registre des dossiers vides et celui des
// partages en cours (avec leurs jetons de révocation). Le serveur ne les distingue pas d'un
// élément ordinaire — il ne lit rien de ce qu'il stocke.
//
// **Pourquoi ce fichier existe.** L'extension listait tout ce que le serveur lui rendait, donc
// elle affichait ces deux items comme des entrées fantômes, sans identifiant ni mot de passe.
// C'est un défaut visible aujourd'hui. Il deviendra destructeur le jour où l'extension saura
// écrire : modifier ou supprimer l'un d'eux efface les dossiers ou les partages de l'utilisateur
// dans l'application web, et rien ne rend d'erreur nulle part — le serveur accepte, puisqu'il ne
// sait pas ce qu'il stocke. Le défaut n'apparaîtrait qu'ailleurs, plus tard.
//
// **Le NUL est échappé et non littéral**, pour la raison que donne ghostpass à l'endroit où ces
// constantes font foi : un octet nul brut fait classer le fichier comme binaire, et `grep` le
// saute alors sans rien dire. Sur la couche cryptographique, c'est le pire endroit où être
// invisible aux outils d'analyse. La valeur à l'exécution est identique, et
// `test/metadata-items.test.ts` la verrouille — c'est ce test qui empêche qu'on « nettoie »
// l'échappement en un espace, ce qui rendrait le filtre juste en apparence et faux en pratique.
//
// Source de vérité : `apps/web-next/src/lib/crypto.ts` du dépôt `stackops/ghostpass`, branche
// `main`. Une valeur à espace (`" gp:folders"`) a existé sur une branche latérale jamais
// fusionnée : aucun coffre ne la porte, et la reconnaître ici masquerait un élément que
// l'application web, elle, affiche.

/** Registre des dossiers vides (note sécurisée à nom réservé). */
export const FOLDERS_ITEM_NAME = "\u0000gp:folders";

/** Registre des partages en cours et de leurs jetons de révocation. */
export const SHARES_ITEM_NAME = "\u0000gp:shares";

/**
 * Vrai si cet élément est un registre de l'application web, à masquer.
 *
 * Le **type compte autant que le nom** : l'application web ne traite ces noms comme réservés que
 * portés par une `SecureNote`. Filtrer sur le seul nom masquerait un identifiant ainsi nommé que
 * l'application web, elle, montrerait — deux vues du même coffre qui cesseraient de s'accorder.
 */
export function isMetadataItem(name: string, kind: string): boolean {
  return kind === "SecureNote" && (name === FOLDERS_ITEM_NAME || name === SHARES_ITEM_NAME);
}

/// Un élément ouvert, tel que l'extension le montre.
export interface DecryptedItem {
  id: string;
  name: string;
  username: string;
  password: string;
  /// La première adresse, pour l'affichage.
  url: string;
  /// Toutes les adresses de l'élément : c'est sur elles que se fait la correspondance avec la page.
  urls?: string[];
  /// Le type d'élément du cœur (`Login`, `SecureNote`, `Card`…). Seul un `Login` se remplit.
  kind?: string;
  /// Présent pour un élément d'un coffre d'équipe : où il vit, pour le dire à l'écran.
  team?: { orgName: string; collectionName: string };
}

/// Ce qu'un élément du coffre s'avère être une fois ouvert.
///
/// Deux cas, et non un seul : tout ce que le serveur rend n'est pas une entrée à montrer. Les
/// registres de l'application web (dossiers, partages) sont des items comme les autres pour le
/// serveur, qui ne lit rien. C'est au client de les reconnaître — voir `isMetadataItem`.
export type VaultDecryptResult =
  | { kind: "item"; item: DecryptedItem }
  | { kind: "metadata"; name: string };

/// Range un élément ouvert (le JSON du `VaultItem` Rust) : entrée à montrer ou registre à taire.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyOpenedItem(id: string, raw: any): VaultDecryptResult {
  const name: string = typeof raw.name === "string" ? raw.name : "";
  const itemKind: string = typeof raw.data?.kind === "string" ? raw.data.kind : "";
  if (isMetadataItem(name, itemKind)) return { kind: "metadata", name };

  const d = raw.data?.data ?? {};
  const urls: string[] = Array.isArray(d.uris)
    ? d.uris.filter((u: unknown): u is string => typeof u === "string" && u !== "")
    : [];
  return {
    kind: "item",
    item: {
      id,
      name,
      username: d.username ?? "",
      password: d.password ?? "",
      url: urls[0] ?? "",
      urls,
      kind: itemKind,
    },
  };
}
