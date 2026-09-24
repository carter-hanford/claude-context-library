#!/usr/bin/env bash
# check-sources.sh — traceability audit.
# Every wiki page must cite at least one source, and every raw/ path it cites must exist.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WIKI="$ROOT/personal-wiki"

problems=0

while IFS= read -r -d '' page; do
  rel="${page#"$ROOT"/}"
  base="$(basename "$page")"
  case "$base" in _*|INDEX.md) continue ;; esac

  # Frontmatter is everything up to the second '---'.
  fm="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1' "$page")"

  # Paths may contain spaces, so run to end-of-value and stop only on YAML delimiters.
  cited="$(printf '%s\n' "$fm" | grep -oE 'raw/[^]",'"'"']*' | sed -E 's/[[:space:]]+$//')"
  convo="$(printf '%s\n' "$fm" | grep -cE 'conversation [0-9]{4}-[0-9]{2}-[0-9]{2}')"

  if [ -z "$cited" ] && [ "$convo" -eq 0 ]; then
    echo "NO SOURCE   $rel"
    problems=$((problems + 1))
    continue
  fi

  while IFS= read -r src; do
    [ -n "$src" ] || continue
    if [ ! -e "$ROOT/$src" ]; then
      echo "BROKEN      $rel  ->  $src"
      problems=$((problems + 1))
    fi
  done <<< "$cited"
done < <(find "$WIKI" -name '*.md' -type f -print0 | sort -z)

echo
if [ "$problems" -eq 0 ]; then
  echo "all wiki pages trace back to real sources"
else
  echo "$problems traceability problem(s)"
  exit 1
fi
