// Le contrat sur lequel repose le masquage, éprouvé avec le WebAssembly réellement embarqué.
//
// `decryptVaultItem` décide à partir de deux champs de l'item ouvert : `name` et `data.kind`. Ces
// noms viennent du `serde` de la structure Rust `VaultItem`, pas d'un choix côté JavaScript — et
// c'est exactement le genre de contrat qui dérive sans rien casser de visible. Un `kind` renommé
// et le filtre laisse passer les registres ; un nom à NUL mutilé par un aller-retour JSON et le
// filtre ne reconnaît plus rien. Ni l'un ni l'autre ne rend d'erreur.
//
// Ce test scelle puis ouvre avec le paquet `@stackops/ghostpass-crypto-wasm` que l'extension
// embarque — pas une réimplémentation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import init, { Account } from "@stackops/ghostpass-crypto-wasm";
import { FOLDERS_ITEM_NAME, isMetadataItem } from "../src/lib/metadata-items.ts";

await init({
  module_or_path: readFileSync(
    "node_modules/@stackops/ghostpass-crypto-wasm/ghostpass_crypto_wasm_bg.wasm",
  ),
});

const account = Account.register("correct horse battery staple", "clara@stackops.ch").account();

function sceller(item: unknown) {
  return JSON.parse(account.encrypt_item(JSON.stringify(item)));
}
function ouvrir(enc: { encrypted_key: string; encrypted_data: string }) {
  return JSON.parse(account.decrypt_item(JSON.stringify(enc)));
}

test("le nom à NUL du registre survit au scellement et à l'ouverture", () => {
  const registre = {
    name: FOLDERS_ITEM_NAME,
    notes: null,
    folder: null,
    data: { kind: "SecureNote", data: { content: "[]" } },
  };
  const ouvert = ouvrir(sceller(registre));
  assert.equal(ouvert.name, FOLDERS_ITEM_NAME);
  assert.equal(ouvert.name.charCodeAt(0), 0);
  assert.equal(ouvert.data.kind, "SecureNote");
  assert.equal(isMetadataItem(ouvert.name, ouvert.data.kind), true);
});

test("une entrée ordinaire traverse le même chemin sans être masquée", () => {
  const login = {
    name: "GitHub",
    notes: null,
    folder: null,
    data: {
      kind: "Login",
      data: { username: "clara", password: "s3cr3t!", uris: ["https://github.com"], totp: null, password_history: [] },
    },
  };
  const ouvert = ouvrir(sceller(login));
  assert.equal(ouvert.data.kind, "Login");
  assert.equal(isMetadataItem(ouvert.name, ouvert.data.kind), false);
  // Les champs sur lesquels le popup s'appuie portent bien les noms du serde Rust.
  assert.equal(ouvert.data.data.username, "clara");
  assert.equal(ouvert.data.data.uris[0], "https://github.com");
});
