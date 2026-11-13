// Les coffres d'équipe, éprouvés avec le WebAssembly réellement embarqué et un serveur simulé.
//
// Ce qui est vérifié : l'Org Key scellée par l'administrateur s'ouvre, les éléments sortent avec
// leur équipe et leur collection, les registres restent cachés, et ce qui ne s'ouvre pas — une
// clé scellée par quelqu'un d'autre, un élément sous une autre Org Key, une collection refusée —
// est compté sans emporter le reste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import init, { Account } from "@stackops/ghostpass-crypto-wasm";
import { loadTeamVaults, type TeamCrypto } from "../src/lib/team-vaults.ts";
import { classifyOpenedItem, FOLDERS_ITEM_NAME } from "../src/lib/metadata-items.ts";
import type { TeamApi } from "../src/lib/api.ts";

await init({
  module_or_path: readFileSync(
    "node_modules/@stackops/ghostpass-crypto-wasm/ghostpass_crypto_wasm_bg.wasm",
  ),
});

// Les mêmes appels que `crypto.ts`, sans l'URL du WebAssembly que seul Vite résout.
const crypto: TeamCrypto = {
  openOrg: (account, pk, sealed) => account.open_org(pk, sealed),
  decryptOrgItem: (org, id, k, d) =>
    classifyOpenedItem(id, JSON.parse(org.decrypt_item(JSON.stringify({ encrypted_key: k, encrypted_data: d })))),
};

const admin = Account.register("admin passphrase", "admin@stackops.ch").account();
const member = Account.register("member passphrase", "member@stackops.ch").account();
const stranger = Account.register("stranger passphrase", "eve@stackops.ch").account();

const creation = admin.create_org();
const org = creation.org();
const sealedForMember = admin.seal_org_key_for_member(org, member.public_key);
const otherOrg = stranger.create_org().org();

function login(name: string, username: string) {
  return { name, notes: null, folder: null, data: { kind: "Login", data: { username, password: "s3cret", uris: ["https://router.example.com"], totp: null, password_history: [] } } };
}
function dto(id: string, sealed: string) {
  const s = JSON.parse(sealed);
  return { id, encryptedKey: s.encrypted_key, encryptedData: s.encrypted_data };
}

function fakeApi(membership: { encryptedOrgKey: string | null; sealedByPublicKey: string | null }): TeamApi {
  return {
    listOrgs: async () => ({
      organizations: [
        { orgId: "o1", name: "StackOps", role: "member", status: "active" },
        { orgId: "o2", name: "Invitation", role: "member", status: "invited" },
      ],
    }),
    getMembership: async () => ({ role: "member", status: "active", ...membership }),
    listCollections: async () => ({
      collections: [
        { id: "c1", name: "Infra", permission: "read" },
        { id: "c2", name: "Refusée", permission: "read" },
      ],
    }),
    listCollectionItems: async (_t, _o, c) => {
      if (c === "c2") throw new Error("HTTP 403");
      return {
        items: [
          dto("i1", org.encrypt_item(JSON.stringify(login("Routeur", "admin")))),
          dto("i2", org.encrypt_item(JSON.stringify({ name: FOLDERS_ITEM_NAME, notes: null, folder: null, data: { kind: "SecureNote", data: { content: "[]" } } }))),
          dto("i3", otherOrg.encrypt_item(JSON.stringify(login("Autre clé", "x")))),
        ],
      };
    },
  } as TeamApi;
}

test("un membre lit le coffre d'équipe, avec son équipe et sa collection", async () => {
  const r = await loadTeamVaults(
    fakeApi({ encryptedOrgKey: sealedForMember, sealedByPublicKey: admin.public_key }),
    "token",
    member,
    crypto,
  );
  assert.deepEqual(
    r.items.map((i) => [i.id, i.name, i.username, i.team]),
    [["i1", "Routeur", "admin", { orgName: "StackOps", collectionName: "Infra" }]],
  );
  // L'élément sous une autre Org Key et la collection refusée : comptés, pas tus.
  assert.equal(r.unreadable, 2);
});

test("une Org Key qui ne vient pas de l'administrateur annoncé est refusée", async () => {
  const r = await loadTeamVaults(
    fakeApi({ encryptedOrgKey: sealedForMember, sealedByPublicKey: stranger.public_key }),
    "token",
    member,
    crypto,
  );
  assert.equal(r.items.length, 0);
  assert.equal(r.unreadable, 1);
});

test("une adhésion sans clé remise n'est ni lue ni comptée comme une erreur", async () => {
  const r = await loadTeamVaults(
    fakeApi({ encryptedOrgKey: null, sealedByPublicKey: null }),
    "token",
    member,
    crypto,
  );
  assert.deepEqual(r, { items: [], unreadable: 0 });
});
