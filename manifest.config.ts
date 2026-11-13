import { defineManifest } from "@crxjs/vite-plugin";
// La version du manifeste est **dérivée** de package.json, jamais recopiée : deux nombres
// qui doivent monter ensemble sans que rien ne l'impose finissent toujours par diverger,
// et c'est celui du manifeste que le Chrome Web Store refuse en silence quand il n'a pas bougé.
import pkg from "./package.json" with { type: "json" };

// Icônes déclarées pour le Store (128 obligatoire, 48 utilisé par la page des extensions,
// 16/32 par la barre d'outils). Elles sont produites par `npm run icons` à partir de
// `assets/logo/ghostpass-icon.svg` — la variante *icône* de la charte, pas le logo réduit :
// le trait du logo fait 4 % de la hauteur et disparaît à 16 px.
const ICONS = {
  16: "assets/logo/icon-16.png",
  32: "assets/logo/icon-32.png",
  48: "assets/logo/icon-48.png",
  128: "assets/logo/icon-128.png",
};

// Manifest V3. Le popup, la page d'options et le service worker sont buildés par Vite (@crxjs).
// La fonction reçoit l'environnement Vite : ce qui n'a de sens qu'en développement n'entre pas
// dans le paquet publié.
export default defineManifest((env) => {
  const isDev = env.mode !== "production";

  return {
    manifest_version: 3,
    name: "GhostPass",
    version: pkg.version,
    description: "Coffre-fort de mots de passe zero-knowledge — le serveur ne voit jamais vos secrets.",
    icons: ICONS,
    action: { default_popup: "src/popup/index.html", default_title: "GhostPass", default_icon: ICONS },
    options_ui: { page: "src/options/index.html", open_in_tab: true },
    background: { service_worker: "src/background.ts", type: "module" },
    // Le cœur crypto est du WebAssembly : la CSP MV3 par défaut interdit sa compilation
    // sans 'wasm-unsafe-eval'. Aucun code distant n'est jamais chargé.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // activeTab + scripting : injection du remplissage dans l'onglet actif, uniquement au clic
    // « Remplir » (geste utilisateur) — pas de content script permanent ni d'accès large aux pages.
    // clipboardWrite + offscreen : vider le presse-papiers 30 s après une copie, même popup fermé.
    // `offscreen` n'existe que sur Chromium ; `build-firefox.mjs` le retire.
    permissions: ["storage", "alarms", "activeTab", "scripting", "clipboardWrite", "offscreen"],
    // Backend de dev local. **Uniquement en mode développement** : dans un paquet publié, cette
    // permission serait accordée par chaque utilisateur sans jamais lui servir, et un relecteur
    // du Store la verrait. Les utilisateurs pointent l'extension vers leur propre instance depuis
    // la page d'options, qui demande l'origine correspondante au runtime.
    ...(isDev ? { host_permissions: ["http://localhost:3000/*"] } : {}),
    optional_host_permissions: ["https://*/*"],
  };
});
