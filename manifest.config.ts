import { defineManifest } from "@crxjs/vite-plugin";

// Manifest V3. Le popup, la page d'options et le service worker sont buildés par Vite (@crxjs).
export default defineManifest({
  manifest_version: 3,
  name: "GhostPass",
  version: "0.0.0",
  description: "Coffre-fort de mots de passe zero-knowledge — le serveur ne voit jamais vos secrets.",
  action: { default_popup: "src/popup/index.html", default_title: "GhostPass" },
  options_ui: { page: "src/options/index.html", open_in_tab: true },
  background: { service_worker: "src/background.ts", type: "module" },
  // Le cœur crypto est du WebAssembly : la CSP MV3 par défaut interdit sa compilation
  // sans 'wasm-unsafe-eval'. Aucun code distant n'est jamais chargé.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  // activeTab + scripting : injection du remplissage dans l'onglet actif, uniquement au clic
  // « Remplir » (geste utilisateur) — pas de content script permanent ni d'accès large aux pages.
  permissions: ["storage", "alarms", "activeTab", "scripting"],
  // Backend de dev uniquement. Les utilisateurs pointent l'extension vers leur propre instance
  // depuis la page d'options, qui demande l'origine correspondante au runtime.
  host_permissions: ["http://localhost:3000/*"],
  optional_host_permissions: ["https://*/*"],
});
