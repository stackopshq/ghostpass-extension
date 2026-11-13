// Les coffres d'équipe : chaque organisation active, chaque collection lisible.
//
// Une organisation, une collection ou un élément qui ne s'ouvre pas n'emporte pas les autres :
// une Org Key qui a tourné, une collection retirée entre deux appels ou un élément scellé sous
// une ancienne clé ne doivent pas vider la liste. Ce qui n'a pas pu être lu est compté, pour le
// dire à l'écran plutôt que de le taire.
//
// Le chiffrement est passé en paramètre plutôt qu'importé : `crypto.ts` charge le WebAssembly par
// une URL que seul Vite sait résoudre, et ce module doit pouvoir s'éprouver sous `node --test`.
import type { Account, Org } from "@stackops/ghostpass-crypto-wasm";
import type { TeamApi } from "./api.js";
import type { DecryptedItem, VaultDecryptResult } from "./metadata-items.js";

export interface TeamCrypto {
  openOrg(account: Account, sealedByPublicKey: string, sealed: string): Org;
  decryptOrgItem(org: Org, id: string, encryptedKey: string, encryptedData: string): VaultDecryptResult;
}

export interface TeamVaults {
  items: DecryptedItem[];
  /** Organisations, collections ou éléments qui n'ont pas pu être ouverts. */
  unreadable: number;
}

export async function loadTeamVaults(
  api: TeamApi,
  token: string,
  account: Account,
  crypto: TeamCrypto,
): Promise<TeamVaults> {
  const items: DecryptedItem[] = [];
  let unreadable = 0;
  const { organizations } = await api.listOrgs(token);
  for (const org of organizations) {
    // Une invitation en attente n'a pas encore d'Org Key : rien à lire, et rien d'anormal.
    if (org.status !== "active") continue;
    try {
      const m = await api.getMembership(token, org.orgId);
      if (!m.encryptedOrgKey || !m.sealedByPublicKey) continue;
      const key = crypto.openOrg(account, m.sealedByPublicKey, m.encryptedOrgKey);
      const { collections } = await api.listCollections(token, org.orgId);
      for (const col of collections) {
        let dtos;
        try {
          dtos = (await api.listCollectionItems(token, org.orgId, col.id)).items;
        } catch {
          unreadable++;
          continue;
        }
        for (const d of dtos) {
          try {
            const opened = crypto.decryptOrgItem(key, d.id, d.encryptedKey, d.encryptedData);
            if (opened.kind === "item") {
              items.push({ ...opened.item, team: { orgName: org.name, collectionName: col.name } });
            }
          } catch {
            unreadable++;
          }
        }
      }
    } catch {
      unreadable++;
    }
  }
  return { items, unreadable };
}
