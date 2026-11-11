#!/usr/bin/env bash
# Gera o instalador do TF Pipas para Windows (roda no Linux ou no Windows com Git Bash).
# Precisa de: bun, node/npm e makensis (NSIS 3).
#   ./montar.sh            → saida/Instalar-TF-Pipas-<versão>.exe
set -euo pipefail
cd "$(dirname "$0")"
VERSAO=$(node -p "require('../backend/package.json').version")
echo "== TF Pipas ${VERSAO} =="
(cd ../frontend && npm ci --no-audit --no-fund >/dev/null)
(cd ../backend && bun install --frozen-lockfile && bun test && bun run scripts/build.ts windows)
mkdir -p saida
# Bloco de notas antigo prefere CRLF
perl -pe 's/\r?\n/\r\n/' LEIA-ME.txt > saida/LEIA-ME.txt
makensis -V3 -DVERSAO="${VERSAO}" -DEXE=../backend/dist/TFPipas.exe -DLEIAME=saida/LEIA-ME.txt tfpipas.nsi
sha256sum "saida/Instalar-TF-Pipas-${VERSAO}.exe" | tee "saida/Instalar-TF-Pipas-${VERSAO}.exe.sha256"
