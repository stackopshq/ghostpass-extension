<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "../lib/browser.js";
  import type { DecryptedItem } from "../lib/crypto.js";
  import {
    hostFromUrl,
    hostsMatch,
    type FillResult,
    type Message,
    type StateResult,
    type UnlockResult,
  } from "../lib/messages.js";

  let ready = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  let email = $state("");
  let password = $state("");
  let totpCode = $state("");
  let mfaRequired = $state(false);
  // Le coffre vient-il du cache local ? Il peut alors dater, et on le dit :
  // un coffre vieux d'une semaine ressemble sinon à un coffre à jour.
  let depuisLeCache = $state(false);

  // La session vit dans le service worker ; le popup n'en est qu'une vue.
  let unlocked = $state(false);
  let items = $state<DecryptedItem[]>([]);
  let search = $state("");
  let revealed = $state<Set<string>>(new Set());
  let copiedId = $state<string | null>(null);

  // Onglet actif (pour l'autofill).
  let activeTabId = $state<number | null>(null);
  let activeHost = $state<string | null>(null);
  let fillMsg = $state<string | null>(null);
  let fillTimer: ReturnType<typeof setTimeout> | undefined;

  const CLIPBOARD_CLEAR_MS = 20_000;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function matches(item: DecryptedItem): boolean {
    return hostsMatch(hostFromUrl(item.url), activeHost);
  }

  // Filtre par recherche, puis remonte les identifiants du domaine de l'onglet actif.
  const filtered = $derived(
    items
      .filter((i) => {
        const q = search.trim().toLowerCase();
        return !q || i.name.toLowerCase().includes(q) || i.username.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(matches(b)) - Number(matches(a))),
  );

  function send<T>(message: Message): Promise<T> {
    return browser.runtime.sendMessage(message) as Promise<T>;
  }

  async function loadActiveTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      activeTabId = tab?.id ?? null;
      activeHost = tab?.url ? hostFromUrl(tab.url) : null;
    } catch {
      activeTabId = null;
      activeHost = null;
    }
  }

  onMount(async () => {
    try {
      const state = await send<StateResult>({ type: "getState" });
      if (state?.unlocked && state.items) {
        unlocked = true;
        items = state.items;
        await loadActiveTab();
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
      depuisLeCache = !!res.depuisLeCache;
      await loadActiveTab();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  /** Relève le coffre depuis le serveur, donc avec un second facteur si besoin.
   *
   * On reverrouille d'abord : sans cela le déverrouillage suivant repartirait
   * du cache, et le bouton ne ferait rien de visible.
   */
  async function relever() {
    await lock();
    depuisLeCache = false;
    mfaRequired = false;
    error = "Saisissez votre mot de passe maître pour relever le coffre.";
  }

  async function seDeconnecter() {
    try {
      await send({ type: "logout" });
    } catch {
      /* ignore */
    }
    unlocked = false;
    items = [];
    depuisLeCache = false;
    revealed = new Set();
    copiedId = null;
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

  function flashFill(text: string) {
    fillMsg = text;
    if (fillTimer) clearTimeout(fillTimer);
    fillTimer = setTimeout(() => (fillMsg = null), 2500);
  }

  async function fill(item: DecryptedItem) {
    if (activeTabId == null) {
      flashFill("Onglet indisponible.");
      return;
    }
    try {
      const res = await send<FillResult>({ type: "fill", itemId: item.id, tabId: activeTabId });
      if (!res?.ok) flashFill(res?.error ?? "Échec du remplissage.");
      else if (res.password) flashFill("Rempli ✓");
      else if (res.username) flashFill("Identifiant rempli ✓");
      else flashFill("Aucun champ trouvé sur la page.");
    } catch {
      flashFill("Échec du remplissage.");
    }
  }

  function openOptions() {
    browser.runtime.openOptionsPage?.();
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
      {#if depuisLeCache}
        <button class="link" onclick={relever} title="Recharger depuis le serveur">Relever</button>
      {/if}
      <button class="link" onclick={seDeconnecter}>Se déconnecter</button>
    </div>
    {#if filtered.length === 0}
      <p class="muted">Aucun secret.</p>
    {:else}
      <ul>
        {#each filtered as item (item.id)}
          <li class:match={matches(item)}>
            <div class="item-main">
              <div class="item-name">
                {item.name}{#if matches(item)}<span class="badge" title="Correspond à l'onglet actif">•</span>{/if}
              </div>
              <div class="item-sub">{revealed.has(item.id) ? item.password : item.username || "—"}</div>
            </div>
            <button class="icon-btn fill-btn" title="Remplir dans l'onglet actif" aria-label="Remplir" onclick={() => fill(item)}>⌨</button>
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

  {#if fillMsg}<p class="muted fill-msg">{fillMsg}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</div>
