#!/usr/bin/env bash
# Regenera as imagens de docs/ a partir do que os mods desenham de fato (kit de testes do Claude Code).
# Precisa do claude no PATH, de python3 com Pillow e da fonte DejaVu Sans Mono (caminho do Debian/Ubuntu).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

cp -r "$root/.claude-plugin" "$root/hooks" "$root/types" "$work/"
mkdir "$work/tests"
cp "$root/scripts/preview-scenes.tsx" "$work/tests/preview.test.tsx"
# Falhou: mostra o log antes do trap apagar a pasta
if ! claude plugin test "$work" > "$work/dump.log" 2>&1; then
  cat "$work/dump.log" >&2
  exit 1
fi
python3 -I "$root/scripts/render_preview.py" "$work/dump.log" "$root/docs"
echo "docs/ atualizado"
