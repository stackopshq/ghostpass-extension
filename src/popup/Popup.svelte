<script lang="ts">
  import { onMount } from "svelte";
  import { api, loadApiBase } from "../lib/api.js";
  import {
    computeLoginHash,
    decryptItem,
    ensureCryptoReady,
    unlock,
    type AccountHandle,
    type DecryptedItem,
  } from "../lib/crypto.js";

  let ready = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  let email = $state("");
  let password = $state("");
  let totpCode = $state("");
  let mfaRequired = $state(false);

  let token = $state<string | null>(null);
  let account = $state<AccountHandle | null>(null);
  let items = $state<DecryptedItem[]>([]);
  let search = $state("");
  let revealed = $state<Set<number>>(new Set());

  const filtered = $derived(
    items.filter((i) => {
      const q = search.trim().toLowerCase();
      return !q || i.name.toLowerCase().includes(q) || i.username.toLowerCase().includes(q);
    }),
  );

  onMount(async () => {
    await loadApiBase();
    await ensureCryptoReady();
    ready = true;
  });

  async function login(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      const { kdfParams } = await api.prelogin(email);
      const hash = computeLoginHash(email, password, kdfParams);
      const res = await api.login(email, hash, totpCode || undefined);
      if (!res.ok) {
        mfaRequired = res.mfaRequired;
        throw new Error(res.mfaRequired ? "Code 2FA requis." : res.error);
      }
      account = unlock(email, password, {
        kdfParams: res.kdfParams,
        encryptedUserKey: res.encryptedUserKey,
        encryptedPrivateKey: res.encryptedPrivateKey,
      });
      token = res.token;
      password = "";
      const { items: dtos } = await api.listItems(token);
      items = dtos.map((d) => decryptItem(account!, d.encryptedKey, d.encryptedData));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function lock() {
    token = null;
    account = null;
    items = [];
    revealed = new Set();
  }

  function toggle(i: number) {
    const s = new Set(revealed);
    s.has(i) ? s.delete(i) : s.add(i);
    revealed = s;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }
</script>

<div class="wrap">
  <p class="brand">🔐 GhostPass</p>

  {#if !ready}
    <p class="muted">Chargement…</p>
  {:else if !token}
    <form onsubmit={login}>
      <label>Email<input type="email" bind:value={email} required autocomplete="username" /></label>
      <label>
        Mot de passe maître
        <input type="password" bind:value={password} required autocomplete="current-password" />
      </label>
      {#if mfaRequired}
        <label>Code 2FA<input bind:value={totpCode} inputmode="numeric" placeholder="123456" /></label>
      {/if}
      <button class="primary" type="submit" disabled={busy}>
        {busy ? "Déverrouillage…" : "Déverrouiller"}
      </button>
    </form>
  {:else}
    <div class="bar">
      <input placeholder="Rechercher…" bind:value={search} style="flex:1" />
      <button class="link" onclick={lock}>Verrouiller</button>
    </div>
    {#if filtered.length === 0}
      <p class="muted">Aucun secret.</p>
    {:else}
      <ul>
        {#each filtered as item, i (i)}
          <li>
            <div class="item-main">
              <div class="item-name">{item.name}</div>
              <div class="item-sub">{revealed.has(i) ? item.password : item.username || "—"}</div>
            </div>
            <button class="icon-btn" title="Afficher" onclick={() => toggle(i)}>👁</button>
            <button class="icon-btn" title="Copier" onclick={() => copy(item.password)}>⧉</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</div>
