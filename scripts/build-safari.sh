#!/usr/bin/env bash
# Génère un projet d'app Safari Web Extension à partir du build Chrome (dist/).
#
# ⚠️ macOS + Xcode requis : Apple ne fournit `safari-web-extension-converter` que via `xcrun`.
# Impossible sur Linux / CI non-macOS. Le code (WebExtensions `chrome.*`, MV3) est compatible
# Safari 16.4+ ; la conversion, la compilation et la signature se font sur un Mac.
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]] || ! command -v xcrun >/dev/null 2>&1; then
  echo "Safari nécessite macOS + Xcode (xcrun safari-web-extension-converter)."
  echo "Sur un Mac :"
  echo "  npm ci && npm run build && ./scripts/build-safari.sh"
  echo "puis ouvrir ./safari/GhostPass.xcodeproj dans Xcode pour builder/signer/tester."
  exit 1
fi

npm run build
xcrun safari-web-extension-converter dist \
  --project-location safari \
  --app-name GhostPass \
  --bundle-identifier hq.stackops.ghostpass \
  --swift --no-open --force

echo "Projet Safari généré dans ./safari — ouvrir dans Xcode pour builder/signer/tester."
