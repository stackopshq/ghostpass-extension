<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "../lib/browser.js";
  import { getApiBase, loadApiBase, setApiBase } from "../lib/api.js";
  import { DEFAULT_AUTO_LOCK_MINUTES, getAutoLockMinutes } from "../lib/messages.js";

  let url = $state("");
  let lockMinutes = $state(DEFAULT_AUTO_LOCK_MINUTES);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  onMount(async () => {
    await loadApiBase();
    url = getApiBase();
    lockMinutes = await getAutoLockMinutes();
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    saved = false;
    busy = true;
    try {
      const trimmed = url.trim().replace(/\/$/, "");
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new Error("URL invalide (ex. https://vault.example.com).");
      }
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        throw new Error("Utilisez https:// pour une instance distante (http n'est toléré qu'en local).");
      }
      const minutes = Math.round(Number(lockMinutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) {
        throw new Error("Verrouillage auto : entre 1 et 720 minutes.");
      }
      // Instance distante : demander la permission d'hôte au runtime (optional_host_permissions).
      if (parsed.protocol === "https:") {
        const granted = await browser.permissions.request({ origins: [`${parsed.origin}/*`] });
        if (!granted) throw new Error("Permission d'accès au domaine refusée.");
      }
      await setApiBase(trimmed);
      await browser.storage.local.set({ autoLockMinutes: minutes });
      url = trimmed;
      lockMinutes = minutes;
      saved = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <p class="brand">🔐 GhostPass — Options</p>

  <form onsubmit={save}>
    <label>
      Backend GhostPass
      <input
        type="url"
        bind:value={url}
        required
        placeholder="https://vault.example.com"
        autocomplete="off"
      />
    </label>
    <p class="hint">
      URL de votre instance. En choisissant un domaine <code>https</code>, le navigateur demandera
      l'autorisation d'y accéder. Le chiffrement reste côté client : le backend ne voit que des blobs.
    </p>

    <label>
      Verrouillage automatique (minutes)
      <input type="number" bind:value={lockMinutes} min="1" max="720" required />
    </label>
    <p class="hint">
      Le coffre déverrouillé est gardé en mémoire par le service worker (jamais sur disque) et
      verrouillé après ce délai d'inactivité, à la fermeture du navigateur, ou manuellement.
    </p>

    <button class="primary" type="submit" disabled={busy}>
      {busy ? "Enregistrement…" : "Enregistrer"}
    </button>
  </form>

  {#if saved}<p class="ok">Enregistré ✓</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</div>
