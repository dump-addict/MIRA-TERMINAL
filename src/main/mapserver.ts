/* Project map: the map server (skill/miraterminal/server.py) runs for the open project, and the home view shows it */
import { app, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { join, sep } from 'node:path'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { watchProject, unwatchProject, stopWatch } from './watch'
import { isKnown, isTrusted } from './projects'
import { PYTHON } from './platform'

// one map server per open project : several windows can each show their own project, two windows on the same project share one
type Server = { root: string; proc: ChildProcess; url: string }
const servers = new Map<string, Server>()
const pending = new Map<string, Promise<string>>()
// which project each window shows (by its webContents id)
const shown = new Map<number, string>()
// pid of the running map server, so a crashed or killed app does not leave servers behind
const pidFile = () => join(app.getPath('userData'), 'map-server.pid')

function skillDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'skill/miraterminal') : join(app.getAppPath(), 'skill/miraterminal')
}

const savePids = () => { try { writeFileSync(pidFile(), [...servers.values()].map((x) => x.proc.pid).join(' ')) } catch { /* rien */ } }
function stop(root?: string): void {
  for (const [r, x] of [...servers]) if (!root || r === root) { servers.delete(r); x.proc.kill(); unwatchProject(r) }
  savePids()
}
// servers no window shows any more are stopped
function sweep(): void {
  const used = new Set(shown.values())
  for (const r of [...servers.keys()]) if (!used.has(r)) stop(r)
}

/* at launch : stop a map server left by a previous run */
export function cleanupMapServer(): void {
  try {
    for (const pid of readFileSync(pidFile(), 'utf8').split(' ').map(Number)) if (pid > 0) { try { process.kill(pid) } catch { /* already gone */ } }
  } catch { /* none left */ }
}

function start(root: string): Promise<string> {
  const have = servers.get(root)
  if (have) return Promise.resolve(have.url)
  const wait = pending.get(root)
  if (wait) return wait   // the same map asked twice at once : one server only
  const p = launch(root).finally(() => { if (pending.get(root) === p) pending.delete(root) })
  pending.set(root, p)
  return p
}

function launch(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [join(skillDir(), 'server.py'), '--root', root, '--port', '4710', '--no-open'], {
      windowsHide: true,
      env: { ...process.env, MIRA_EMBEDDED: '1', MIRA_TRUSTED: isTrusted(root) ? '1' : '0', PYTHONUNBUFFERED: '1' }
    })
    let done = false
    const fail = (msg: string) => { if (!done) { done = true; reject(new Error(msg)) } }
    proc.stdout.on('data', (b: Buffer) => {
      const m = b.toString().match(/https?:\/\/127\.0\.0\.1:\d+\/\?k=[\w-]+/)  // the map's address, with its launch key
      if (m && !done) { done = true; servers.set(root, { root, proc, url: m[0] }); savePids(); resolve(m[0]) }
    })
    let err = ''
    proc.stderr.on('data', (b: Buffer) => { err += b.toString() })
    proc.on('error', (e) => fail(`${PYTHON} not found (${e.message})`))
    proc.on('exit', (code) => { if (servers.get(root)?.proc === proc) { servers.delete(root); savePids() } fail(err.split('\n').filter(Boolean).pop() || `map server stopped (${code})`) })
    setTimeout(() => fail('map server not responding'), 8000)
  })
}

export function registerMapServer(): void {
  ipcMain.handle('map:open', async (e, root: string) => {
    if (!isKnown(root)) return { error: 'Unknown project' }
    const id = e.sender.id
    // a window that closes frees its project's server
    if (!shown.has(id)) e.sender.once('destroyed', () => { shown.delete(id); sweep() })
    shown.set(id, root); sweep()
    watchProject(root)
    try { return { url: await start(root) } } catch (x) { return { error: (x as Error).message } }
  })
  ipcMain.handle('map:close', (e) => { shown.delete(e.sender.id); sweep(); return true })
  // after a change of trust : the server restarts with the new rule
  ipcMain.handle('map:restart', async (_e, root: string) => { if (!isKnown(root)) return { error: 'Unknown project' }; stop(root); watchProject(root); try { return { url: await start(root) } } catch (e) { return { error: (e as Error).message } } })
  // the blocks of a project's map, for search
  ipcMain.handle('map:blocks', (_e, root: string) => {
    if (!isKnown(root)) return []
    try {
      const m = JSON.parse(readFileSync(join(root, '.miraterminal', 'map.json'), 'utf8'))
      return (m.nodes || []).map((n: { id: string; label?: string; kind?: string; summary?: string; parent?: string }) =>
        ({ id: n.id, label: n.label || n.id, kind: n.kind || '', summary: n.summary || '', parent: n.parent || null }))
    } catch { return [] }
  })
  // prompt of a focused discussion: kept in the project's .miraterminal/sessions/
  ipcMain.handle('session:save', (_e, root: string, key: string, prompt: string) => {
    if (!isKnown(root)) throw new Error('Unknown project')
    // a cloned repository can ship .miraterminal or sessions as a symlink: check each level before creating or writing anything
    const base = realpathSync(root)
    let dir = base
    for (const part of ['.miraterminal', 'sessions']) {
      dir = join(dir, part)
      if (!existsSync(dir)) mkdirSync(dir)
      dir = realpathSync(dir)
      if (!dir.startsWith(base + sep)) throw new Error('Sessions folder is outside the project')
    }
    const f = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${key.replace(/[^a-z0-9_-]+/gi, '_')}.md`)
    writeFileSync(f, prompt)
    return f
  })
}

export const mapServerPids = (): number[] => [...servers.values()].map((x) => x.proc.pid ?? 0)

export function stopMapServer(): void { stop(); stopWatch() }
