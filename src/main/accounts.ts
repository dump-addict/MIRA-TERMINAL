/* Accounts : several Claude Code and Codex sign-ins on one Mac, each in its own folder (CLAUDE_CONFIG_DIR, CODEX_HOME).
   The system account is the usual ~/.claude or ~/.codex. Mira stores no password : each agent signs in itself, in a terminal.
   Extra Claude accounts share your plugins, skills, settings and MCP servers with the system account. */
import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { posixShell } from './platform'

export type AgentId = 'claude' | 'codex'
type Stored = { claude: string[]; codex: string[]; active: Record<AgentId, string> }  // folders ; 'system' is the usual one
export type Account = { id: string; agent: AgentId; dir: string | null; system: boolean; signedIn: boolean; email: string; plan: string; active: boolean }

const H = homedir()
const root = () => join(app.getPath('userData'), 'accounts')
const file = () => join(root(), 'accounts.json')
function load(): Stored {
  try { const s = JSON.parse(readFileSync(file(), 'utf8')); return { claude: s.claude ?? [], codex: s.codex ?? [], active: { claude: s.active?.claude ?? 'system', codex: s.active?.codex ?? 'system' } } }
  catch { return { claude: [], codex: [], active: { claude: 'system', codex: 'system' } } }
}
const save = (s: Stored) => { mkdirSync(root(), { recursive: true }); writeFileSync(file(), JSON.stringify(s, null, 1)) }
const idOf = (dir: string) => createHash('sha256').update(dir).digest('hex').slice(0, 10)
const inRoot = (p: string) => resolve(p).startsWith(root() + sep)

const sh = posixShell()
const run = (cmd: string, env: Record<string, string> = {}) =>
  new Promise<string>((res) => execFile(sh, ['-ilc', cmd], { windowsHide: true, timeout: 10000, env: { ...process.env, ...env } }, (_e, out) => res(String(out ?? ''))))

/* the Keychain entry Claude Code 2.1+ uses for a config folder */
export const claudeKeychainService = (dir: string | null) =>
  dir ? `Claude Code-credentials-${createHash('sha256').update(dir.normalize('NFC')).digest('hex').slice(0, 8)}` : 'Claude Code-credentials'

async function claudeInfo(dir: string | null): Promise<{ signedIn: boolean; email: string; plan: string }> {
  const out = await run('claude auth status --json 2>/dev/null', dir ? { CLAUDE_CONFIG_DIR: dir } : {})
  const j = (() => { try { return JSON.parse(out.slice(out.indexOf('{'))) } catch { return {} } })()
  let plan = ''
  try { plan = JSON.parse(readFileSync(dir ? join(dir, '.claude.json') : join(H, '.claude.json'), 'utf8')).oauthAccount?.planDisplayName ?? '' } catch { /* none */ }
  return { signedIn: !!j.loggedIn, email: j.email ?? '', plan }
}
function codexInfo(dir: string | null): { signedIn: boolean; email: string; plan: string } {
  try {
    const a = JSON.parse(readFileSync(join(dir ?? join(H, '.codex'), 'auth.json'), 'utf8'))
    const t = String(a.tokens?.id_token ?? '').split('.')[1]
    const c = t ? JSON.parse(Buffer.from(t, 'base64url').toString('utf8')) : {}
    const plan = c['https://api.openai.com/auth']?.chatgpt_plan_type ?? ''
    return { signedIn: !!a.tokens?.access_token, email: c.email ?? '', plan: plan ? plan[0].toUpperCase() + plan.slice(1) : '' }
  } catch { return { signedIn: false, email: '', plan: '' } }
}

export async function listAccounts(agent: AgentId): Promise<Account[]> {
  const s = load()
  const dirs: (string | null)[] = [null, ...s[agent]]
  return Promise.all(dirs.map(async (dir) => {
    const info = agent === 'claude' ? await claudeInfo(dir) : codexInfo(dir)
    const id = dir ? idOf(dir) : 'system'
    return { id, agent, dir, system: !dir, ...info, active: s.active[agent] === id }
  }))
}

/* the folder of the account in use, or null for the system one */
export function activeDir(agent: AgentId): string | null {
  const s = load(), a = s.active[agent]
  if (a === 'system') return null
  return s[agent].find((d) => idOf(d) === a) ?? null
}
/* what an agent's command needs to run on the chosen account */
export function accountEnv(agent: string): string {
  if (agent !== 'claude' && agent !== 'codex') return ''
  const d = activeDir(agent)
  if (!d) return ''
  const q = `'${d.replace(/'/g, `'\\''`)}'`
  return agent === 'claude' ? `CLAUDE_CONFIG_DIR=${q} ` : `CODEX_HOME=${q} `
}

/* a new account folder, sharing the system account's config ; the sign-in happens in a terminal */
function newAccount(agent: AgentId): string {
  const s = load()
  let n = s[agent].length + 2
  while (existsSync(join(root(), `${agent}-${n}`))) n++
  const dir = join(root(), `${agent}-${n}`)
  mkdirSync(dir, { recursive: true })
  const link = (from: string, name: string) => { if (existsSync(from) && !existsSync(join(dir, name))) try { symlinkSync(from, join(dir, name)) } catch { /* skip */ } }
  if (agent === 'claude') {
    for (const f of ['settings.json', 'plugins', 'skills', 'agents', 'commands', 'CLAUDE.md', 'keybindings.json']) link(join(H, '.claude', f), f)
    // MCP servers live in .claude.json next to the sign-in : only the server list is copied
    try {
      const mcp = JSON.parse(readFileSync(join(H, '.claude.json'), 'utf8')).mcpServers
      if (mcp) writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: mcp }, null, 1))
    } catch { /* none */ }
  } else {
    for (const f of ['config.toml', 'AGENTS.md', 'prompts']) link(join(H, '.codex', f), f)
  }
  s[agent].push(dir); save(s)
  return dir
}

export function registerAccounts(): void {
  ipcMain.handle('accounts:list', (_e, agent: AgentId) => (agent === 'claude' || agent === 'codex' ? listAccounts(agent) : []))
  // returns the command to run in a terminal to sign in
  ipcMain.handle('accounts:add', async (_e, agent: AgentId) => {
    if (agent !== 'claude' && agent !== 'codex') return null
    // a sign-in that was never finished is reused, so unfinished accounts never pile up
    let dir: string | undefined
    for (const d of load()[agent] ?? []) if (!(agent === 'claude' ? await claudeInfo(d) : codexInfo(d)).signedIn) { dir = d; break }
    dir ??= newAccount(agent)
    const q = `'${dir.replace(/'/g, `'\\''`)}'`
    return { id: idOf(dir), command: agent === 'claude' ? `CLAUDE_CONFIG_DIR=${q} claude auth login` : `CODEX_HOME=${q} codex login` }
  })
  ipcMain.handle('accounts:use', (_e, agent: AgentId, id: string) => {
    const s = load()
    if (id !== 'system' && !s[agent]?.some((d) => idOf(d) === id)) return false
    s.active[agent] = id; save(s); return true
  })
  // sign out ; an extra account's folder is removed with it, the system account stays (only signed out)
  ipcMain.handle('accounts:remove', async (_e, agent: AgentId, id: string) => {
    const s = load()
    const dir = id === 'system' ? null : s[agent]?.find((d) => idOf(d) === id)
    if (id !== 'system' && !dir) return false
    await run(agent === 'claude' ? 'claude auth logout' : 'codex logout', dir ? (agent === 'claude' ? { CLAUDE_CONFIG_DIR: dir } : { CODEX_HOME: dir }) : {})
    if (dir && inRoot(dir)) {
      rmSync(dir, { recursive: true, force: true })
      s[agent] = s[agent].filter((d) => d !== dir)
      if (s.active[agent] === id) s.active[agent] = 'system'
      save(s)
    }
    return true
  })
}
