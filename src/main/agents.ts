/* Coding agents : which of the 5 are installed, and how much of each account's limit is used */
import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSettings } from './settings'
import { isTrusted } from './projects'
import { accountEnv, activeDir, claudeKeychainService } from './accounts'
import { hookCmd } from './agentevents'
import { posixShell, isMac } from './platform'

export const AGENTS = [
  { id: 'claude', label: 'Claude Code', cmd: 'claude' },
  { id: 'codex', label: 'Codex', cmd: 'codex' },
  { id: 'gemini', label: 'Gemini CLI', cmd: 'gemini' },
  { id: 'cursor', label: 'Cursor CLI', cmd: 'cursor-agent' },
  { id: 'copilot', label: 'Copilot CLI', cmd: 'copilot' },
  { id: 'grok', label: 'Grok CLI', cmd: 'grok' }
] as const

// what each permission mode adds to an agent's command line (from each agent's own docs)
const FLAGS: Record<string, Partial<Record<'default' | 'edits' | 'plan' | 'yolo', string[]>>> = {
  claude: { edits: ['--permission-mode', 'acceptEdits'], plan: ['--permission-mode', 'plan'], yolo: ['--dangerously-skip-permissions'] },
  codex: { edits: ['--full-auto'], yolo: ['--dangerously-bypass-approvals-and-sandbox'] },
  gemini: { edits: ['--approval-mode', 'auto_edit'], yolo: ['--yolo'] },
  cursor: { yolo: ['--force'] },
  copilot: { yolo: ['--allow-all-tools'] },
  grok: { yolo: ['--always-approve'] }
}

const sh = posixShell()
const run = (file: string, args: string[], timeout = 5000) =>
  new Promise<string>((res) => execFile(file, args, { timeout }, (_err, out) => res(String(out ?? "").trim())))

// an interactive login shell knows the user's full PATH (a GUI app does not) : each agent is resolved to its full path
async function installed(): Promise<Record<string, string>> {
  const out = await run(sh, ['-ilc', `for c in ${AGENTS.map((a) => a.cmd).join(' ')}; do p=$(command -v $c) && echo "MIRA:$c:$p"; done`], 8000)
  const found: Record<string, string> = {}
  for (const l of out.split('\n')) { const m = l.match(/^MIRA:([^:]+):(\/.+)$/); if (m) found[m[1]] = m[2] }
  return Object.fromEntries(AGENTS.filter((a) => found[a.cmd]).map((a) => [a.id, found[a.cmd]]))
}

export type Window = { used: number; resetsAt: number | null }
export type Usage = { id: string; session: Window | null; weekly: Window | null }

const ts = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isFinite(n)) return n > 1e10 ? n : n * 1000
  const d = new Date(String(v)).getTime()
  return Number.isNaN(d) ? null : d
}
const win = (used: unknown, reset: unknown): Window | null => (typeof used === 'number' && Number.isFinite(used) ? { used, resetsAt: ts(reset) } : null)

// the account in use (Settings, Agents) : its Keychain entry, or its folder
export async function claudeToken(dir: string | null = activeDir('claude')): Promise<string | null> {
  // macOS keeps the token in the Keychain ; Windows and Linux in the config folder
  const raw = (isMac ? await run('/usr/bin/security', ['find-generic-password', '-s', claudeKeychainService(dir), '-w']) : '')
    || await readFile(join(dir || join(homedir(), '.claude'), '.credentials.json'), 'utf8').catch(() => '')
  try { return JSON.parse(raw)?.claudeAiOauth?.accessToken || null } catch { return null }
}

async function claudeUsage(): Promise<Usage | null> {
  const token = await claudeToken()
  if (!token) return null
  const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'claude-code/2.1.0' },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null)
  if (!r?.ok) return null
  const d = await r.json().catch(() => ({}))
  const w = (x: { utilization?: number; used_percentage?: number; resets_at?: unknown } | undefined) => x ? win(x.utilization ?? x.used_percentage, x.resets_at) : null
  return { id: 'claude', session: w(d.five_hour), weekly: w(d.seven_day) }
}

async function codexUsage(): Promise<Usage | null> {
  const auth = await readFile(join(activeDir('codex') || join(homedir(), '.codex'), 'auth.json'), 'utf8').then(JSON.parse).catch(() => null)
  const token = auth?.tokens?.access_token
  if (!token) return null
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'User-Agent': 'codex-cli', 'OpenAI-Beta': 'codex-1', originator: 'Codex Desktop' }
  if (auth.tokens.account_id) headers['ChatGPT-Account-Id'] = auth.tokens.account_id
  const r = await fetch('https://chatgpt.com/backend-api/wham/usage', { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!r?.ok) return null
  const d = await r.json().catch(() => ({}))
  // the shorter window is the session, the longer one the week
  const ws = [d.rate_limit?.primary_window, d.rate_limit?.secondary_window].filter(Boolean)
    .sort((a: { limit_window_seconds?: number }, b: { limit_window_seconds?: number }) => (a.limit_window_seconds ?? 0) - (b.limit_window_seconds ?? 0))
  const w = (x?: { used_percent?: number; reset_at?: unknown }) => x ? win(x.used_percent, x.reset_at) : null
  return { id: 'codex', session: w(ws[0]), weekly: w(ws[1]) }
}

// limits change slowly : asked at most once a minute
let cache: { at: number; p: Promise<Usage[]> } | null = null
function usage(force = false): Promise<Usage[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.p
  const p = Promise.all([claudeUsage().catch(() => null), codexUsage().catch(() => null)]).then((l) => l.filter((u): u is Usage => !!u))
  cache = { at: Date.now(), p }
  return p
}

export function registerAgents(): void {
  ipcMain.handle('agents:list', async () => {
    const ok = await installed()
    return AGENTS.map((a) => ({ ...a, installed: !!ok[a.id], path: ok[a.id] ?? null }))
  })
  // the MCP servers Claude Code knows (names only, never their keys) : shown in settings so you see they carry over
  ipcMain.handle('agents:mcp', async () => {
    const j = await readFile(join(homedir(), '.claude.json'), 'utf8').then(JSON.parse).catch(() => null)
    return j?.mcpServers ? Object.keys(j.mcpServers) : []
  })
  ipcMain.handle('agents:usage', (_e, force?: boolean) => (getSettings().usageMeters ? usage(!!force) : []))
  // the command that starts an agent : its path, the permission flags chosen in settings, the extra arguments
  ipcMain.handle('agents:command', async (_e, id: string, root?: string, session?: { id?: string; resume?: boolean }) => {
    const a = AGENTS.find((x) => x.id === id)
    if (!a) return null
    const path = (await installed())[id]
    if (!path) return null
    const st = getSettings(), conf = st.agents[id]
    // the agent's own mode, or the one set for all agents
    let mode = !conf || conf.mode === 'inherit' ? st.agentMode : conf.mode
    // never skip prompts in a project the user has not trusted, or when it is locked
    if (mode === 'yolo' && (st.lockYolo || !root || !isTrusted(root))) mode = 'default'
    const flags = FLAGS[id]?.[mode] ?? []
    const q = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`
    const extra: string[] = []
    if (id === 'claude') {
      // Claude Code settings for this session only : protections, and a light "made with Mira" kept with Claude's own line
      const own = await readFile(join(activeDir('claude') || join(homedir(), '.claude'), 'settings.json'), 'utf8').then(JSON.parse).catch(() => ({}))
      const cfg: Record<string, unknown> = {}
      const perms: Record<string, unknown> = {}
      if (st.blockWritesOutside) perms.blockWritesOutsideWorkingDirectories = true
      if (st.blockReadsOutside) perms.blockReadsOutsideWorkingDirectories = true
      if (st.askBeforeDelete) perms.ask = ['Bash(rm *)', 'Bash(rm -rf *)', 'Bash(git clean *)', 'Bash(git reset --hard *)']
      // secrets stay out of reach : .env files, private keys, SSH and cloud credentials
      if (st.protectSecrets) perms.deny = ['Read(**/.env)', 'Read(**/.env.*)', 'Read(**/*.pem)', 'Read(**/*.key)', 'Read(**/id_rsa*)', 'Read(**/id_ed25519*)', 'Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(~/.gnupg/**)']
      if (Object.keys(perms).length) cfg.permissions = perms
      // Mira's hooks, for this session only : they tell the tab when Claude works, waits for you, or is done
      const h = (k: 'working' | 'needs' | 'done', matcher?: string) => [{ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCmd(k) }] }]
      // a real question only (a permission, a question to answer) : the "waiting for your input" reminder after a minute idle
      // would turn a finished tab into one that asks something
      cfg.hooks = { UserPromptSubmit: h('working'), PreToolUse: h('working'), Notification: h('needs', 'permission_prompt|elicitation_dialog'), PermissionRequest: h('needs'), Stop: h('done') }
      if (st.markCommits && own.attribution === undefined && own.includeCoAuthoredBy === undefined) {
        cfg.attribution = { commit: 'Made with Mira Terminal and Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>', pr: 'Made with [Mira Terminal](https://github.com/dump-addict/MIRA-TERMINAL) and Claude Code' }
      }
      if (Object.keys(cfg).length) extra.push('--settings', q(JSON.stringify(cfg)))
    }
    if (id === 'codex' && st.blockWritesOutside && mode === 'default') extra.push('--sandbox', 'workspace-write')
    // Codex calls its notify program when a turn is complete
    if (id === 'codex') extra.push('-c', q(`notify=["sh","-c",${JSON.stringify(hookCmd('done'))}]`))
    // the account chosen for this agent (Settings, Agents, Accounts)
    // each Claude tab has its own conversation id : a new tab starts it, a reopened tab continues that one (never another one in the folder)
    const sid = typeof session?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id) ? session.id : ''
    // a conversation is resumed only if Claude saved it (a tab where nothing was typed has none)
    const saved = (d: string) => { try { return readdirSync(join(d, 'projects')).some((f) => existsSync(join(d, 'projects', f, `${sid}.jsonl`))) } catch { return false } }
    const resumable = !!sid && !!session?.resume && saved(activeDir('claude') || join(homedir(), '.claude'))
    const cont = id === 'claude' && sid ? (resumable ? ['--resume', sid] : ['--session-id', sid]) : []
    // the model set for this agent in Mira : every tab of it uses that one (unless the extra arguments already name a model)
    const named = /(?:^|\s)(?:--model|-m)(?:=|\s)/.test(conf?.args ?? '')
    const model = conf?.model && !named ? [id === 'codex' || id === 'gemini' ? '-m' : '--model', q(conf.model)] : []
    // the extra arguments can't skip the permission prompts where the mode may not (untrusted project, lock on) : an imported
    // settings file could put --dangerously-skip-permissions there
    const BYPASS = /(?:^|\s)(?:--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|--yolo|--force|--allow-all-tools|--always-approve|--permission-mode(?:=|\s+)bypassPermissions|--approval-mode(?:=|\s+)yolo)(?=\s|$)/gi
    const args = mode === 'yolo' ? conf?.args ?? '' : (conf?.args ?? '').replace(BYPASS, ' ').trim()
    return { command: accountEnv(id) + [q(path), ...cont, ...flags, ...extra, ...model, args].filter(Boolean).join(' '), mode }
  })
}
