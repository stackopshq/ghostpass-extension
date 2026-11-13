<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "../lib/browser.js";
  import type { DecryptedItem } from "../lib/crypto.js";
  import { hostFromUrl, matchesHost, suggestionsFor } from "../lib/site-match.js";
  import { generateOtp, parseOtp } from "../lib/totp.js";
  import { DEFAULT_GEN_OPTIONS, generatePassword, type GenOptions } from "../lib/generator.js";
  import {
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

  // La session vit dans le service worker ; le popup n'en est qu'une vue.
  let unlocked = $state(false);
  let items = $state<DecryptedItem[]>([]);
  let unreadable = $state(0);
  let search = $state("");
  let revealed = $state<Set<string>>(new Set());
  let copiedId = $state<string | null>(null);

  // Onglet actif (pour l'autofill).
  let activeTabId = $state<number | null>(null);
  let activeHost = $state<string | null>(null);
  let fillMsg = $state<string | null>(null);
  let fillTimer: ReturnType<typeof setTimeout> | undefined;

  // Le temps d'afficher « copié » ; l'effacement lui-même est armé dans le service worker.
  const COPIED_FEEDBACK_MS = 2_000;

  // Les codes à usage unique des identifiants qui en ont, recalculés chaque seconde tant que le
  // coffre est ouvert : le popup ne vit que le temps d'un coup d'œil.
  let otps = $state<Record<string, { code: string; remaining: number }>>({});
  $effect(() => {
    if (!unlocked) return;
    const withOtp = items.filter((i) => i.totp);
    if (withOtp.length === 0) return;
    const tick = async () => {
      const next: Record<string, { code: string; remaining: number }> = {};
      for (const i of withOtp) {
        const cfg = parseOtp(i.totp ?? "");
        if (!cfg) continue;
        try {
          next[i.id] = await generateOtp(cfg);
        } catch {
          /* secret illisible : pas de code plutôt qu'un faux */
        }
      }
      otps = next;
    };
    void tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  });

  // Le générateur : disponible coffre fermé comme ouvert, il ne touche pas au coffre. Les réglages
  // ne sont pas conservés : l'extension ne garde que l'adresse du serveur et le délai de verrouillage.
  let genOpen = $state(false);
  let genOpts = $state<GenOptions>({ ...DEFAULT_GEN_OPTIONS });
  let generated = $state("");
  function regenerate() {
    generated = generatePassword(genOpts);
  }
  function toggleGenerator() {
    genOpen = !genOpen;
  }
  // Un nouveau mot de passe à l'ouverture et à chaque réglage modifié.
  $effect(() => {
    if (!genOpen) return;
    const { length, lowercase, uppercase, digits, symbols } = genOpts;
    generated = generatePassword({ length, lowercase, uppercase, digits, symbols });
  });

  function isLogin(item: DecryptedItem): boolean {
    return (item.kind ?? "Login") === "Login";
  }

  function kindLabel(item: DecryptedItem): string {
    if (item.kind === "Card") return item.cardLast4 ? `Carte · •••• ${item.cardLast4}` : "Carte";
    if (item.kind === "SecureNote") return "Note sécurisée";
    return item.kind ?? "";
  }

  function spaced(code: string): string {
    return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  }
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function matches(item: DecryptedItem): boolean {
    return matchesHost(item, activeHost);
  }

  // Les identifiants de la page ouverte, montrés à part et en premier dès le déverrouillage.
  // Une recherche en cours les fond dans la liste : on cherche alors autre chose.
  const suggestions = $derived(search.trim() ? [] : suggestionsFor(items, activeHost));
  const suggested = $derived(new Set(suggestions.map((i) => i.id)));

  // Filtre par recherche, puis remonte les identifiants du domaine de l'onglet actif.
  const filtered = $derived(
    items
      .filter((i) => {
        const q = search.trim().toLowerCase();
        return (
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.username.toLowerCase().includes(q) ||
          (i.team?.orgName.toLowerCase().includes(q) ?? false)
        );
      })
      .filter((i) => !suggested.has(i.id))
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
        unreadable = state.unreadable ?? 0;
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
      unreadable = res.unreadable ?? 0;
      await loadActiveTab();
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
    unreadable = 0;
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
      await send({ type: "armClipboardClear" });
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, COPIED_FEEDBACK_MS);
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
      else if (res.password || res.username) {
        flashFill(res.password ? "Rempli ✓" : "Identifiant rempli ✓");
        // Comme Bitwarden : le code à usage unique part dans le presse-papiers, prêt pour l'écran
        // suivant du site.
        const otp = otps[item.id];
        if (otp) await copy(`${item.id}:otp`, otp.code);
        // Le formulaire est rempli : le popup n'a plus rien à montrer, et il masquerait la page.
        setTimeout(() => window.close(), 600);
      }
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
    <div class="head-actions">
      <button class="icon-btn" title="Générer un mot de passe" aria-pressed={genOpen} onclick={toggleGenerator}>Générer</button>
      <button class="icon-btn" title="Options (backend)" aria-label="Options" onclick={openOptions}>⚙</button>
    </div>
  </header>

  {#if genOpen}
    <section class="generator" aria-label="Générateur de mots de passe">
      <output class="gen-value">{generated}</output>
      <div class="gen-actions">
        <button class="fill-primary" onclick={() => copy("generated", generated)}>
          {copiedId === "generated" ? "Copié ✓" : "Copier"}
        </button>
        <button class="icon-btn" onclick={regenerate}>Nouveau</button>
      </div>
      <label class="gen-length">
        Longueur : {genOpts.length}
        <input type="range" min="8" max="64" bind:value={genOpts.length} />
      </label>
      <div class="gen-sets">
        <label><input type="checkbox" bind:checked={genOpts.lowercase} /> a-z</label>
        <label><input type="checkbox" bind:checked={genOpts.uppercase} /> A-Z</label>
        <label><input type="checkbox" bind:checked={genOpts.digits} /> 0-9</label>
        <label><input type="checkbox" bind:checked={genOpts.symbols} /> !@#</label>
      </div>
    </section>
  {/if}

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
    {#if unreadable > 0}
      <p class="muted">
        {unreadable === 1
          ? "Un élément d'équipe n'a pas pu être ouvert."
          : `${unreadable} éléments d'équipe n'ont pas pu être ouverts.`}
      </p>
    {/if}
    {#if suggestions.length > 0}
      <section class="suggest" aria-label="Pour ce site">
        <p class="section-title">Pour {activeHost}</p>
        <ul>
          {#each suggestions as item (item.id)}
            {@render row(item, true)}
          {/each}
        </ul>
      </section>
      {#if filtered.length > 0}<p class="section-title">Tout le coffre</p>{/if}
    {/if}
    {#if filtered.length === 0 && suggestions.length === 0}
      <p class="muted">Aucun secret.</p>
    {:else}
      <ul>
        {#each filtered as item (item.id)}
          {@render row(item, false)}
        {/each}
      </ul>
    {/if}
  {/if}

  {#if fillMsg}<p class="muted fill-msg">{fillMsg}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</div>

{#snippet row(item: DecryptedItem, suggested: boolean)}
  <li class:match={!suggested && matches(item)}>
    <div class="item-main">
      <div class="item-name">{item.name}</div>
      {#if isLogin(item)}
        <div class="item-sub">{revealed.has(item.id) ? item.password : item.username || "—"}</div>
      {:else}
        <div class="item-sub">{kindLabel(item)}</div>
      {/if}
      {#if otps[item.id]}
        <button
          class="otp"
          title="Copier le code à usage unique"
          onclick={() => copy(`${item.id}:otp`, otps[item.id]!.code)}
        >
          <span class="otp-code">{spaced(otps[item.id]!.code)}</span>
          <span class="otp-left">{copiedId === `${item.id}:otp` ? "copié ✓" : `${otps[item.id]!.remaining} s`}</span>
        </button>
      {/if}
      {#if item.team}
        <div class="item-team" title="Coffre d'équipe">{item.team.orgName} · {item.team.collectionName}</div>
      {/if}
    </div>
    {#if isLogin(item)}
      {#if suggested}
        <button class="fill-primary" onclick={() => fill(item)}>Remplir</button>
      {:else}
        <button class="icon-btn fill-btn" title="Remplir dans l'onglet actif" aria-label="Remplir" onclick={() => fill(item)}>⌨</button>
        <button class="icon-btn" title="Afficher" onclick={() => toggle(item.id)}>👁</button>
      {/if}
      <button class="icon-btn" title="Copier le mot de passe" onclick={() => copy(item.id, item.password)}>
        {copiedId === item.id ? "✓" : "⧉"}
      </button>
    {/if}
  </li>
{/snippet}
