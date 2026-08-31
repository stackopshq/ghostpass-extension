// Verrouille les noms réservés de l'application web.
//
// Ce test existe pour une raison précise : la séquence d'échappement du NUL a l'air d'une
// bizarrerie qu'on « nettoie » en la remplaçant par un espace. Le filtre resterait alors
// parfaitement lisible et parfaitement faux — il ne masquerait plus rien, et le jour où
// l'extension saura écrire, elle pourrait détruire les registres de l'application web sans
// qu'aucune erreur soit rendue.
//
// La preuve en a été faite en écrivant ce correctif : une première version portait un octet nul
// LITTÉRAL. `file` classait le module en « data », et `grep` le sautait sans un mot — sur la
// couche crypto, invisible aux outils d'analyse. D'où l'échappement, et d'où ce test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLDERS_ITEM_NAME,
  SHARES_ITEM_NAME,
  isMetadataItem,
} from "../src/lib/metadata-items.ts";

test("les noms réservés commencent par un NUL, pas par un espace", () => {
  assert.equal(FOLDERS_ITEM_NAME.charCodeAt(0), 0);
  assert.equal(SHARES_ITEM_NAME.charCodeAt(0), 0);
  assert.equal(FOLDERS_ITEM_NAME, "\u0000gp:folders");
  assert.equal(SHARES_ITEM_NAME, "\u0000gp:shares");
  // Le piège qu'on veut interdire : la valeur de la branche latérale jamais fusionnée.
  assert.notEqual(FOLDERS_ITEM_NAME, " gp:folders");
});

test("un registre porté par une note sécurisée est masqué", () => {
  assert.equal(isMetadataItem(FOLDERS_ITEM_NAME, "SecureNote"), true);
  assert.equal(isMetadataItem(SHARES_ITEM_NAME, "SecureNote"), true);
});

test("le type compte autant que le nom", () => {
  // L'application web ne réserve ces noms que pour des notes sécurisées. Masquer un identifiant
  // ainsi nommé donnerait deux vues du même coffre qui ne s'accordent plus.
  assert.equal(isMetadataItem(FOLDERS_ITEM_NAME, "Login"), false);
  assert.equal(isMetadataItem(SHARES_ITEM_NAME, "Card"), false);
});

test("une entrée ordinaire n'est jamais masquée", () => {
  assert.equal(isMetadataItem("GitHub", "Login"), false);
  assert.equal(isMetadataItem("gp:folders", "SecureNote"), false);
  assert.equal(isMetadataItem(" gp:folders", "SecureNote"), false);
  assert.equal(isMetadataItem("", "SecureNote"), false);
});
