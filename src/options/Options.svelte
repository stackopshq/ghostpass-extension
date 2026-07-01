<script lang="ts">
  import { onMount } from "svelte";
  import { getApiBase, loadApiBase, setApiBase } from "../lib/api.js";

  let url = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  onMount(async () => {
    await loadApiBase();
    url = getApiBase();
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
      // Instance distante : demander la permission d'hôte au runtime (optional_host_permissions).
      if (parsed.protocol === "https:") {
        const granted = await chrome.permissions.request({ origins: [`${parsed.origin}/*`] });
        if (!granted) throw new Error("Permission d'accès au domaine refusée.");
      }
      await setApiBase(trimmed);
      url = trimmed;
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
    <button class="primary" type="submit" disabled={busy}>
      {busy ? "Enregistrement…" : "Enregistrer"}
    </button>
  </form>

  {#if saved}<p class="ok">Enregistré ✓</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</div>
