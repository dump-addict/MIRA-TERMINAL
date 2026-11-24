/* Terminals: one pty per tab, driven from the UI over IPC */
import { ipcMain, webContents } from 'electron'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import * as pty from 'node-pty'
import { getSettings } from './settings'
import { agentGitEnv } from './githooks'
import { AGENTS } from './agents'
import { eventsDir } from './agentevents'
import { gitBash, isWin } from './platform'

type Term = { proc: pty.IPty; owner: number }
const terms = new Map<string, Term>()
let seq = 0

function defaultShell(): string {
  const custom = getSettings().shell
  if (custom && existsSync(custom)) return custom
  if (isWin) return 'powershell.exe'
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
}
// agents without their own attribution setting get "Made with Mira Terminal and <agent>" through git hooks (Claude Code uses its setting)
function markEnv(agent?: string): Record<string, string> {
  const a = AGENTS.find((x) => x.id === agent)
  if (!a || a.id === 'claude' || !getSettings().markCommits) return {}
  return agentGitEnv(a.label)
}
// the proxy set in Settings, Network : git, npm, curl and the agents use these variables
function proxyEnv(): Record<string, string> {
  const { proxyUrl, noProxy } = getSettings()
  if (!proxyUrl) return {}
  return { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, https_proxy: proxyUrl, http_proxy: proxyUrl, NO_PROXY: noProxy, no_proxy: noProxy }
}
export const openTerminals = (): number => terms.size

export function registerTerminals(): void {
  ipcMain.handle('term:create', (e, opts: { cwd?: string; cols: number; rows: number; command?: string; args?: string[]; run?: string; agent?: string }) => {
    const id = `t${++seq}`
    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()
    // run: a command started in the login shell; the shell stays open when it exits
    const sh = defaultShell()
    // an agent or a command : written for a POSIX shell, so on Windows it runs in Git Bash, which stays open after it
    const posix = isWin ? gitBash() || sh : sh
    const file = opts.command || (opts.run ? posix : sh)
    const login = !isWin || /bash/i.test(file) ? ['-l'] : []
    const args = opts.command ? opts.args || [] : opts.run ? ['-l', '-c', `${opts.run}; exec ${isWin ? 'bash' : sh} -l`] : login
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, opts.cols | 0),
      rows: Math.max(2, opts.rows | 0),
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'MiraTerminal', MIRA_PTY: id, MIRA_EVENTS: eventsDir(), ...proxyEnv(), ...markEnv(opts.agent) } as Record<string, string>
    })
    const owner = e.sender.id
    terms.set(id, { proc, owner })
    proc.onData((data) => webContents.fromId(owner)?.send('term:data', id, data))
    proc.onExit(({ exitCode }) => {
      terms.delete(id)
      webContents.fromId(owner)?.send('term:exit', id, exitCode)
    })
    return { id, cwd, shell: file }
  })
  ipcMain.on('term:write', (_e, id: string, data: string) => terms.get(id)?.proc.write(data))
  ipcMain.on('term:resize', (_e, id: string, cols: number, rows: number) => {
    const t = terms.get(id)
    if (t && cols > 1 && rows > 1) t.proc.resize(cols | 0, rows | 0)
  })
  // the program running in a terminal, when it is not just the shell waiting (an agent, a server, a build)
  ipcMain.handle('term:busy', (_e, id: string) => {
    const t = terms.get(id)
    if (!t) return null
    const p = t.proc.process
    return p && !/^-?(zsh|bash|fish|sh|login|nu|tcsh|ksh|pwsh|powershell|cmd)(\.exe)?$/i.test(p.split(/[\\/]/).pop() ?? '') ? p : null
  })
  ipcMain.on('term:kill', (_e, id: string) => {
    terms.get(id)?.proc.kill()
    terms.delete(id)
  })
}

// a window that closes takes its terminals with it
export function killTerminalsOf(owner: number): void {
  for (const [id, t] of [...terms]) if (t.owner === owner) { terms.delete(id); try { t.proc.kill() } catch { /* already gone */ } }
}

export function killAllTerminals(): void {
  terms.forEach((t) => t.proc.kill())
  terms.clear()
}
