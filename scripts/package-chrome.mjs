// Empaquette `dist/` en un ZIP téléversable sur le Chrome Web Store — de façon **reproductible**.
//
// **Pourquoi ne pas réutiliser `web-ext build`.** Il sait produire ce ZIP, il est déjà installé par
// la CI, et il donne un fichier différent à chaque exécution : il horodate chaque entrée à l'heure
// du build. Deux archives du même commit n'ont alors pas la même empreinte, et on ne peut plus
// répondre à « le paquet publié est-il bien ce commit ? » autrement qu'en faisant confiance.
// Ici toutes les entrées portent la même date fixe (l'époque DOS, 1980-01-01) et sont triées :
// même commit ⇒ mêmes octets, sur n'importe quelle machine.
//
// Format ZIP écrit à la main plutôt qu'avec une bibliothèque : il tient en quelques dizaines de
// lignes, il n'ajoute aucune dépendance à un paquet publié, et c'est précisément le contrôle sur
// l'horodatage et l'ordre qui fait la reproductibilité.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const outDir = join(root, "artifacts");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Un paquet en 0.0.0 est un paquet qui n'est jamais sorti. Le Store accepte le téléversement puis
// refuse toute mise à jour ultérieure qui ne monte pas la version : l'erreur se découvre au pire
// moment. On échoue ici, bruyamment.
if (!/^\d+(\.\d+){0,3}$/.test(pkg.version) || /^0\.0\.0(\.0)?$/.test(pkg.version)) {
  console.error(
    `\n  ✗ package.json porte version "${pkg.version}".\n` +
      `    Le Chrome Web Store attend 1 à 4 entiers séparés par des points, et refuse\n` +
      `    un paquet dont la version n'a pas augmenté. 0.0.0 est la marque de ce qui\n` +
      `    n'est jamais sorti : donnez-lui un vrai numéro avant d'empaqueter.\n`,
  );
  process.exit(1);
}

// Le manifeste dérive sa version de package.json, mais c'est le manifeste **construit** qui part
// au Store : on le relit plutôt que de supposer que la dérivation a bien eu lieu.
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));
} catch {
  console.error("\n  ✗ dist/manifest.json est absent — lancez `npm run build` d'abord.\n");
  process.exit(1);
}
if (manifest.version !== pkg.version) {
  console.error(
    `\n  ✗ dist/manifest.json est en ${manifest.version}, package.json en ${pkg.version}.\n` +
      `    Le build est périmé, ou la dérivation de version est cassée.\n`,
  );
  process.exit(1);
}
// Ce qui n'a de sens qu'en développement ne doit pas partir au Store.
if (manifest.host_permissions?.length) {
  console.error(
    `\n  ✗ dist/manifest.json déclare host_permissions : ${JSON.stringify(manifest.host_permissions)}\n` +
      `    C'est le backend de dev. Empaquetez un build de production (\`npm run build\`).\n`,
  );
  process.exit(1);
}
for (const size of [16, 48, 128]) {
  if (!manifest.icons?.[size]) {
    console.error(`\n  ✗ dist/manifest.json ne déclare pas d'icône ${size}×${size}.\n`);
    process.exit(1);
  }
}

/** Tous les fichiers de `dir`, chemins relatifs en séparateurs POSIX, triés. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(relative(distDir, full).split(sep).join("/"));
  }
  return out.sort();
}

// 1980-01-01 00:00:00, plancher du format ZIP : la date la plus ancienne représentable, et donc
// celle qui ne dépend ni de l'horloge ni du fuseau de la machine qui empaquette.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const files = walk(distDir);
if (files.length === 0) {
  console.error("\n  ✗ dist/ est vide — lancez `npm run build` d'abord.\n");
  process.exit(1);
}

const locals = [];
const centrals = [];
let offset = 0;

for (const name of files) {
  const raw = readFileSync(join(distDir, name));
  const deflated = deflateRawSync(raw, { level: 9 });
  // Un fichier que la compression fait grossir est stocké tel quel (méthode 0).
  const stored = deflated.length >= raw.length;
  const body = stored ? raw : deflated;
  const method = stored ? 0 : 8;
  const crc = crc32(raw);
  const nameBuf = Buffer.from(name, "utf8");
  // Bit 11 : le nom est en UTF-8. Sans lui, un nom non-ASCII serait lu en CP437.
  const flags = nameBuf.equals(Buffer.from(name, "latin1")) ? 0 : 0x0800;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version minimale
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // pas de champ « extra » : c'est là que se logent les horodatages
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version d'écriture
  central.writeUInt16LE(20, 6); // version minimale
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0o644 << 16, 38); // permissions POSIX
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, centralBuf, eocd]);
const outName = `ghostpass-chrome-${pkg.version}.zip`;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, outName), zip);
writeFileSync(
  join(outDir, `${outName}.sha256`),
  `${createHash("sha256").update(zip).digest("hex")}  ${outName}\n`,
);

console.log(`  artifacts/${outName}`);
console.log(`  ${files.length} fichiers, ${zip.length} o`);
console.log(`  sha256 ${createHash("sha256").update(zip).digest("hex")}`);
