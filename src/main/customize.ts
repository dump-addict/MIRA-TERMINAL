/* Customize : what your agents can use (plugins, MCP servers, skills, subagents, rules, commands, hooks), read from their own config.
   Only names, descriptions and paths are read : never keys, tokens or environment values. */
import { ipcMain, shell } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, basename, join, resolve, sep } from 'node:path'
import { isKnown } from './projects'

export type Kind = 'plugin' | 'mcp' | 'skill' | 'subagent' | 'rule' | 'command' | 'hook'
export type Item = { kind: Kind; name: string; agent: 'claude' | 'codex'; scope: string; status: 'ok' | 'auth' | 'off'; detail: string; path?: string }

const H = homedir()
const json = (p: string) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const dirs = (p: string) => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name) } catch { return [] } }
const files = (p: string, ext: string) => { try { return readdirSync(p).filter((f) => f.endsWith(ext)) } catch { return [] } }
// the description line of a skill, agent or command file (YAML front matter)
function describe(p: string): { name?: string; description: string } {
  try {
    const t = readFileSync(p, 'utf8').slice(0, 4000)
    const fm = t.match(/^---\n([\s\S]*?)\n---/)
    const get = (k: string) => fm?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].replace(/^["']|["']$/g, '').trim()
    return { name: get('name'), description: (get('description') ?? t.replace(/^---[\s\S]*?---/, '').split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '').slice(0, 200) }
  } catch { return { description: '' } }
}

function skillsIn(dir: string, scope: string, out: Item[]): void {
  for (const d of dirs(dir)) {
    const f = join(dir, d, 'SKILL.md')
    if (!existsSync(f)) continue
    const m = describe(f)
    out.push({ kind: 'skill', name: m.name || d, agent: 'claude', scope, status: 'ok', detail: m.description, path: f })
  }
}
function mdIn(dir: string, kind: Kind, scope: string, out: Item[]): void {
  for (const f of files(dir, '.md')) {
    const m = describe(join(dir, f))
    out.push({ kind, name: m.name || basename(f, '.md'), agent: 'claude', scope, status: 'ok', detail: m.description, path: join(dir, f) })
  }
}

export function collect(project?: string): Item[] {
  const out: Item[] = []
  const settings = json(join(H, '.claude', 'settings.json')) ?? {}
  const claudeJson = json(join(H, '.claude.json')) ?? {}
  const needAuth = new Set(Object.keys(json(join(H, '.claude', 'mcp-needs-auth-cache.json')) ?? {}))

  // plugins, and what each one brings (its skills, agents, commands)
  const installed = json(join(H, '.claude', 'plugins', 'installed_plugins.json'))?.plugins ?? {}
  const enabled = settings.enabledPlugins ?? {}
  for (const [id, v] of Object.entries(installed)) {
    const e = (Array.isArray(v) ? v[0] : v) as { installPath?: string; version?: string }
    const name = id.split('@')[0]
    const on = enabled[id] !== false
    const auth = [...needAuth].some((k) => k.startsWith(`plugin:${name}:`))
    out.push({ kind: 'plugin', name, agent: 'claude', scope: id.split('@')[1] ?? 'plugin', status: !on ? 'off' : auth ? 'auth' : 'ok', detail: auth ? 'Needs authentication' : e.version ? `Version ${e.version}` : '', path: e.installPath })
    if (e.installPath && on) {
      skillsIn(join(e.installPath, 'skills'), `plugin ${name}`, out)
      mdIn(join(e.installPath, 'agents'), 'subagent', `plugin ${name}`, out)
      mdIn(join(e.installPath, 'commands'), 'command', `plugin ${name}`, out)
    }
  }
  // MCP servers : user, project, plugin connectors waiting for a sign-in
  for (const n of Object.keys(claudeJson.mcpServers ?? {})) out.push({ kind: 'mcp', name: n, agent: 'claude', scope: 'user', status: 'ok', detail: 'User server' })
  if (project) {
    for (const n of Object.keys(claudeJson.projects?.[project]?.mcpServers ?? {})) out.push({ kind: 'mcp', name: n, agent: 'claude', scope: 'project', status: 'ok', detail: 'Project server' })
    for (const n of Object.keys(json(join(project, '.mcp.json'))?.mcpServers ?? {})) out.push({ kind: 'mcp', name: n, agent: 'claude', scope: 'project', status: 'ok', detail: 'From .mcp.json' })
  }
  for (const k of needAuth) {
    const [, plugin, server] = k.split(':')
    if (server) out.push({ kind: 'mcp', name: server, agent: 'claude', scope: `plugin ${plugin}`, status: 'auth', detail: 'Needs authentication' })
  }
  // skills, subagents, commands of your own and of the project
  skillsIn(join(H, '.claude', 'skills'), 'user', out)
  mdIn(join(H, '.claude', 'agents'), 'subagent', 'user', out)
  mdIn(join(H, '.claude', 'commands'), 'command', 'user', out)
  if (project) {
    skillsIn(join(project, '.claude', 'skills'), 'project', out)
    mdIn(join(project, '.claude', 'agents'), 'subagent', 'project', out)
    mdIn(join(project, '.claude', 'commands'), 'command', 'project', out)
  }
  // rules : the standing instructions files
  const rule = (p: string, scope: string, agent: 'claude' | 'codex') => {
    if (existsSync(p)) out.push({ kind: 'rule', name: basename(p), agent, scope, status: 'ok', detail: `${Math.round(statSync(p).size / 100) / 10} kB`, path: p })
  }
  rule(join(H, '.claude', 'CLAUDE.md'), 'user', 'claude')
  if (project) { rule(join(project, 'CLAUDE.md'), 'project', 'claude'); rule(join(project, '.claude', 'CLAUDE.md'), 'project', 'claude'); rule(join(project, 'AGENTS.md'), 'project', 'codex') }
  rule(join(H, '.codex', 'AGENTS.md'), 'user', 'codex')
  // hooks : commands run on agent events ; shown by what they do, never in full
  for (const [ev, arr] of Object.entries(settings.hooks ?? {})) {
    for (const g of arr as { hooks?: { command?: string }[] }[]) for (const h of g.hooks ?? []) {
      const c = h.command ?? ''
      const what = /afplay/.test(c) ? `Plays ${basename(c.split(' ').pop() ?? '').replace(/\.\w+$/, '')}` : /orca/i.test(c) ? 'Orca status hook' : /mira/i.test(c) ? 'Mira status hook' : `Runs ${basename(c.trim().split(/\s+/)[0] || 'a script')}`
      out.push({ kind: 'hook', name: ev, agent: 'claude', scope: 'user', status: 'ok', detail: what })
    }
  }
  // Codex : MCP servers from its config.toml
  try {
    const toml = readFileSync(join(H, '.codex', 'config.toml'), 'utf8')
    for (const m of toml.matchAll(/^\[mcp_servers\.([\w-]+)\]/gm)) out.push({ kind: 'mcp', name: m[1], agent: 'codex', scope: 'user', status: 'ok', detail: 'Codex server' })
  } catch { /* no codex */ }
  return out
}

export function registerCustomize(): void {
  ipcMain.handle('customize:list', (_e, project?: string) => collect(project && isKnown(project) ? project : undefined))
  // open a config file : only inside the agents' folders or a known project
  ipcMain.handle('customize:open', (_e, p: string) => {
    const r = resolve(p)
    const ok = [join(H, '.claude'), join(H, '.codex')].some((d) => r.startsWith(d + sep)) || isKnown(r.split(`${sep}.claude${sep}`)[0]) || isKnownRoot(r)
    // text config files only : an .app or .command a cloned repository ships would run on openPath
    return ok && /\.(md|json|jsonc|toml|ya?ml|txt)$/i.test(r) && existsSync(r) ? shell.openPath(r) : 'refused'
  })
}
// up to the root of the drive : / on macOS and Linux, C:\\ on Windows
const isKnownRoot = (p: string) => { for (let d = resolve(p); ; d = dirname(d)) { if (isKnown(d)) return true; if (dirname(d) === d) return false } }
