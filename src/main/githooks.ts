/* "Made with Mira Terminal and <agent>" on commits an agent makes from Mira, for agents that have no attribution setting.
   Only the agent's own terminal points git at these hooks (an environment variable) ; the project's files and hooks are untouched :
   every hook here first runs the project's own hook of the same name. */
import { app } from 'electron'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* Mira's own GitHub account (miraterminal), named as co-author of the commits agents make from Mira */
export const MIRA_COAUTHOR = 'Co-Authored-By: Mira Terminal <361582628+miraterminal@users.noreply.github.com>'

const HOOKS = ['applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit',
  'pre-rebase', 'post-checkout', 'post-merge', 'pre-push', 'pre-receive', 'update', 'post-receive', 'post-update', 'push-to-checkout', 'pre-auto-gc', 'post-rewrite', 'sendemail-validate', 'reference-transaction']

const SCRIPT = `#!/bin/sh
# Mira Terminal : runs the project's own hook, then marks agent commits
name=$(basename "$0")
orig=$(git config --local core.hooksPath 2>/dev/null)
[ -z "$orig" ] && orig="$(git rev-parse --git-common-dir 2>/dev/null)/hooks"
case "$orig" in /*) ;; *) orig="$(git rev-parse --show-toplevel)/$orig" ;; esac
if [ "$name" != "prepare-commit-msg" ]; then
  [ -x "$orig/$name" ] && exec "$orig/$name" "$@"
  exit 0
fi
if [ -x "$orig/$name" ]; then "$orig/$name" "$@" || exit $?; fi
# only a new commit (not a merge, squash or amend), only once
case "$2" in merge|squash|commit) exit 0 ;; esac
[ -n "$MIRA_AGENT_LABEL" ] || exit 0
grep -q "Made with Mira Terminal" "$1" 2>/dev/null && exit 0
line="Made with Mira Terminal and $MIRA_AGENT_LABEL"
# the line goes after the message, before its trailers (Co-Authored-By...) and the editor comments
awk -v line="$line" '
  { l[NR] = $0 }
  END {
    end = NR; for (i = 1; i <= NR; i++) if (l[i] ~ /^#/) { end = i - 1; break }
    while (end > 0 && l[end] ~ /^[ \\t]*$/) end--
    t = end + 1; while (t > 1 && l[t-1] ~ /^[A-Za-z][A-Za-z-]*: /) t--
    if (t <= end && t > 1 && l[t-1] ~ /^[ \\t]*$/) { at = t - 1 } else { at = end; t = end + 1 }
    for (i = 1; i <= at; i++) print l[i]
    if (at > 0) print ""
    print line
    if (t <= end) { print ""; for (i = t; i <= end; i++) print l[i] }
    for (i = end + 1; i <= NR; i++) print l[i]
  }' "$1" > "$1.mira" && mv "$1.mira" "$1"
# Mira as co-author : GitHub lists it among the repository's contributors
git interpret-trailers --in-place --if-exists addIfDifferent --trailer "${MIRA_COAUTHOR}" "$1" 2>/dev/null
exit 0
`

let dir: string | null = null
export function hooksDir(): string {
  if (dir) return dir
  dir = join(app.getPath('userData'), 'git-hooks')
  mkdirSync(dir, { recursive: true })
  for (const h of HOOKS) { const f = join(dir, h); writeFileSync(f, SCRIPT); chmodSync(f, 0o755) }
  return dir
}

/* the environment of an agent's terminal : git uses Mira's hooks, which know the agent's name */
export function agentGitEnv(label: string): Record<string, string> {
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooksDir(), MIRA_AGENT_LABEL: label }
}
