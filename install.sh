#!/bin/sh
# Installs the miraterminal skill into a project.
#   sh install.sh /path/to/project          copy
#   sh install.sh /path/to/project --link   symbolic link (updates to this repository apply right away)
#   sh install.sh --global                  into ~/.claude/skills (every project)
set -e
SRC="$(cd "$(dirname "$0")" && pwd)/skill/miraterminal"

if [ "$1" = "--global" ]; then
  DEST="$HOME/.claude/skills/miraterminal"; TARGET=""
else
  TARGET="$(cd "${1:-.}" && pwd)"; DEST="$TARGET/.claude/skills/miraterminal"
fi
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
if [ "$2" = "--link" ] || [ "$1" = "--link" ]; then ln -s "$SRC" "$DEST"; else cp -R "$SRC" "$DEST"; fi
echo "skill installed: $DEST"

if [ -n "$TARGET" ]; then
  mkdir -p "$TARGET/.miraterminal"
  GI="$TARGET/.gitignore"
  if ! grep -qs "^.miraterminal/sessions/" "$GI"; then printf '\n# miraterminal: focused session prompts\n.miraterminal/sessions/\n' >> "$GI"; fi
  echo "in Claude Code: /miraterminal  (generates the map, then opens it)"
fi
