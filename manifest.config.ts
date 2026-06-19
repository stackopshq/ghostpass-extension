import { defineManifest } from "@crxjs/vite-plugin";

// Manifest V3. Le popup et le service worker sont buildés par Vite (@crxjs gère les chemins).
// host_permissions = backend GhostPass (dev) ; à adapter au domaine de prod.
export default defineManifest({
  manifest_version: 3,
  name: "GhostPass",
  version: "0.0.0",
  description: "Coffre-fort de mots de passe zero-knowledge — le serveur ne voit jamais vos secrets.",
  action: { default_popup: "src/popup/index.html", default_title: "GhostPass" },
  background: { service_worker: "src/background.ts", type: "module" },
  permissions: ["storage", "activeTab"],
  host_permissions: ["http://localhost:3000/*", "http://10.25.0.19:3000/*"],
});
