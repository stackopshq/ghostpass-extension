// Couche crypto de l'extension : encapsule le module WASM partagé avec la web app.
// Les clés en clair restent DANS le WASM ; on n'échange que des données chiffrées.
import init, { Account } from "@stackops/ghostpass-crypto-wasm";
import { isMetadataItem } from "./metadata-items.js";
import wasmUrl from "@stackops/ghostpass-crypto-wasm/ghostpass_crypto_wasm_bg.wasm?url";

let ready: Promise<unknown> | null = null;

export function ensureCryptoReady(): Promise<unknown> {
  if (!ready) ready = init({ module_or_path: wasmUrl });
  return ready;
}

export interface LoginBlobs {
  kdfParams: string;
  encryptedUserKey: string;
  encryptedPrivateKey: string;
}

export interface DecryptedItem {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string;
}

export type AccountHandle = Account;

/// Hash d'authentification à envoyer au serveur (dérivé du mot de passe maître, côté client).
export function computeLoginHash(email: string, password: string, kdfParams: string): string {
  return Account.master_password_hash(password, email, kdfParams);
}

/// Reconstruit l'objet `Account` (les clés) depuis les blobs renvoyés par le serveur.
export function unlock(email: string, password: string, blobs: LoginBlobs): Account {
  return Account.unlock(
    password,
    email,
    blobs.kdfParams,
    blobs.encryptedUserKey,
    blobs.encryptedPrivateKey,
  );
}

/// Ce qu'un élément du coffre s'avère être une fois ouvert.
///
/// Deux cas, et non un seul : tout ce que le serveur rend n'est pas une entrée à montrer. Les
/// registres de l'application web (dossiers, partages) sont des items comme les autres pour le
/// serveur, qui ne lit rien. C'est au client de les reconnaître — voir `metadata-items.ts`.
export type VaultDecryptResult =
  | { kind: "item"; item: DecryptedItem }
  | { kind: "metadata"; name: string };

/// Ouvre un item du coffre avec l'USK et dit ce qu'il est.
export function decryptVaultItem(
  account: Account,
  id: string,
  encryptedKey: string,
  encryptedData: string,
): VaultDecryptResult {
  const raw = JSON.parse(
    account.decrypt_item(
      JSON.stringify({ encrypted_key: encryptedKey, encrypted_data: encryptedData }),
    ),
  );
  const name: string = typeof raw.name === "string" ? raw.name : "";
  const itemKind: string = typeof raw.data?.kind === "string" ? raw.data.kind : "";
  if (isMetadataItem(name, itemKind)) return { kind: "metadata", name };

  const d = raw.data?.data ?? {};
  return {
    kind: "item",
    item: {
      id,
      name,
      username: d.username ?? "",
      password: d.password ?? "",
      url: d.uris?.[0] ?? "",
    },
  };
}
