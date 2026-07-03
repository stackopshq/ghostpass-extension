// Couche crypto de l'extension : encapsule le module WASM partagé avec la web app.
// Les clés en clair restent DANS le WASM ; on n'échange que des données chiffrées.
import init, { Account } from "@stackopshq/ghostpass-crypto-wasm";
import wasmUrl from "@stackopshq/ghostpass-crypto-wasm/ghostpass_crypto_wasm_bg.wasm?url";

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

/// Déchiffre un item (login) du coffre avec l'USK.
export function decryptItem(
  account: Account,
  id: string,
  encryptedKey: string,
  encryptedData: string,
): DecryptedItem {
  const item = JSON.parse(
    account.decrypt_item(
      JSON.stringify({ encrypted_key: encryptedKey, encrypted_data: encryptedData }),
    ),
  );
  const d = item.data?.data ?? {};
  return {
    id,
    name: item.name,
    username: d.username ?? "",
    password: d.password ?? "",
    url: d.uris?.[0] ?? "",
  };
}
