<script lang="ts">
  import { onMount } from "svelte";
  import type { DecryptedItem } from "../lib/crypto.js";
  import type { Message, StateResult, UnlockResult } from "../lib/messages.js";

  let ready = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  let email = $state("");
  let password = $state("");
  let totpCode = $state("");
  let mfaRequired = $state(false);

  // La session vit dans le service worker ; le popup n'en est qu'une vue.
  let unlocked = $state(false);
  let items = $state<DecryptedItem[]>([]);
  let search = $state("");
  let revealed = $state<Set<string>>(new Set());
  let copiedId = $state<string | null>(null);

  const CLIPBOARD_CLEAR_MS = 20_000;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  const filtered = $derived(
    items.filter((i) => {
      const q = search.trim().toLowerCase();
      return !q || i.name.toLowerCase().includes(q) || i.username.toLowerCase().includes(q);
    }),
  );

  function send<T>(message: Message): Promise<T> {
    return chrome.runtime.sendMessage(message) as Promise<T>;
  }

  onMount(async () => {
    try {
      const state = await send<StateResult>({ type: "getState" });
      if (state?.unlocked && state.items) {
        unlocked = true;
        items = state.items;
      }
    } catch {
      /* service worker indisponible → écran de connexion */
    }
    ready = true;
  });

  async function login(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      const res = await send<UnlockResult>({
        type: "unlock",
        email,
        password,
        totpCode: totpCode || undefined,
      });
      if (!res?.ok) {
        mfaRequired = !!res?.mfaRequired;
        throw new Error(res?.mfaRequired ? "Code 2FA requis." : res?.error || "Échec de connexion.");
      }
      password = "";
      totpCode = "";
      mfaRequired = false;
      unlocked = true;
      items = res.items ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function lock() {
    try {
      await send({ type: "lock" });
    } catch {
      /* ignore */
    }
    unlocked = false;
    items = [];
    revealed = new Set();
    copiedId = null;
  }

  function toggle(id: string) {
    const s = new Set(revealed);
    s.has(id) ? s.delete(id) : s.add(id);
    revealed = s;
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        // Efface le secret du presse-papier (les gestionnaires font de même après ~20 s).
        navigator.clipboard.writeText("").catch(() => {});
        if (copiedId === id) copiedId = null;
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      /* ignore */
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage?.();
  }
</script>

<div class="wrap">
  <header class="head">
    <p class="brand">🔐 GhostPass</p>
    <button class="icon-btn" title="Options (backend)" aria-label="Options" onclick={openOptions}>⚙</button>
  </header>

  {#if !ready}
    <p class="muted">Chargement…</p>
  {:else if !unlocked}
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
        {#each filtered as item (item.id)}
          <li>
            <div class="item-main">
              <div class="item-name">{item.name}</div>
              <div class="item-sub">{revealed.has(item.id) ? item.password : item.username || "—"}</div>
            </div>
            <button class="icon-btn" title="Afficher" onclick={() => toggle(item.id)}>👁</button>
            <button
              class="icon-btn"
              title="Copier le mot de passe"
              onclick={() => copy(item.id, item.password)}
            >
              {copiedId === item.id ? "✓" : "⧉"}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</div>
