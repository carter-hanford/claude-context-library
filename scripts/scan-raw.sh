#!/usr/bin/env bash
# scan-raw.sh: report which files in raw/ are NEW, CHANGED, or already ingested.
# Matching is by short content hash, recorded in personal-wiki/_ingest-log.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW="$ROOT/raw"
LOG="$ROOT/personal-wiki/_ingest-log.md"

[ -d "$RAW" ] || { echo "no raw/ directory at $RAW" >&2; exit 1; }
[ -f "$LOG" ] || touch "$LOG"

new=0; changed=0; same=0

while IFS= read -r -d '' f; do
  base="$(basename "$f")"
  case "$base" in .*|_*) continue ;; esac

  rel="${f#"$ROOT"/}"
  hash="$(shasum -a 256 "$f" | cut -c1-8)"

  if grep -qF "$hash" "$LOG"; then
    same=$((same + 1))
  elif grep -qF "$rel" "$LOG"; then
    echo "CHANGED  $hash  $rel"
    changed=$((changed + 1))
  else
    echo "NEW      $hash  $rel"
    new=$((new + 1))
  fi
  # `_`-prefixed directories are attachments, not drops: raw/_media/ holds the
  # images and video frames the app pulled down alongside a captured link. They
  # belong to that capture's own row, so listing them as separate NEW files
  # would bury the things Carter actually put here.
done < <(find "$RAW" \( -name '.*' -o -name '_*' \) -type d -prune -o -type f -print0 | sort -z)

echo
echo "$new new, $changed changed, $same already ingested"
