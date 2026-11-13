// Couche crypto de l'extension : encapsule le module WASM partagé avec la web app.
// Les clés en clair restent DANS le WASM ; on n'échange que des données chiffrées.
import init, { Account, Org } from "@stackops/ghostpass-crypto-wasm";
import { classifyOpenedItem, type DecryptedItem, type VaultDecryptResult } from "./metadata-items.js";
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

export type { DecryptedItem, VaultDecryptResult };

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
  return classifyOpenedItem(id, raw);
}

/// Ouvre l'Org Key reçue. `open_org` vérifie qu'elle a bien été scellée par le détenteur de
/// `sealedByPublicKey` ; une clé scellée par quelqu'un d'autre est refusée.
export function openOrg(account: Account, sealedByPublicKey: string, sealed: string): Org {
  return account.open_org(sealedByPublicKey, sealed);
}

/// Ouvre un élément d'équipe avec l'Org Key, et dit ce qu'il est.
export function decryptOrgItem(
  org: Org,
  id: string,
  encryptedKey: string,
  encryptedData: string,
): VaultDecryptResult {
  const raw = JSON.parse(
    org.decrypt_item(JSON.stringify({ encrypted_key: encryptedKey, encrypted_data: encryptedData })),
  );
  return classifyOpenedItem(id, raw);
}
