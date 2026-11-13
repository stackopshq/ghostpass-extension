// Produit le build Firefox à partir du build Chrome (`dist/`, généré par @crxjs).
//
// Firefox veut un `browser_specific_settings.gecko` (identifiant, collecte de données déclarée) et un
// background en **event page module** (`background.scripts`) plutôt qu'un `service_worker`
// (Chromium). Le reste du code est identique (`chrome.*` est aliasé sur Firefox).
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SRC = "dist";
const OUT = "dist-firefox";

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const manifestPath = `${OUT}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.browser_specific_settings = {
  ...manifest.browser_specific_settings,
  gecko: {
    // Definitive once published on addons.mozilla.org: an id on a domain we own.
    id: "ghostpass@stackops.ch",
    strict_min_version: "128.0",
    // AMO asks every new extension to declare what it transmits. The e-mail address and the
    // login proof go to the GhostPass server the user configured, which may be one we host.
    data_collection_permissions: {
      required: ["personallyIdentifyingInfo", "authenticationInfo"],
    },
  },
};

// `offscreen` est propre à Chromium. Firefox efface le presse-papiers depuis sa page
// d'arrière-plan, qui a un document.
manifest.permissions = (manifest.permissions ?? []).filter((p) => p !== "offscreen");

const serviceWorker = manifest.background?.service_worker;
if (serviceWorker) {
  manifest.background = { scripts: [serviceWorker], type: "module" };
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Firefox build → ${OUT}/ (background.scripts, gecko id)`);
