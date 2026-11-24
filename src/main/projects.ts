/* Projects: list kept in the app's data folder, adding a folder, cloning a repository, git init */
import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { ensureStructureMap } from './structure'
import { startAnalysis } from './analyse'

// trusted: the user agreed to let this project run its own code through Mira (map checks, automatic diagram), for this path, until they turn it off
export type Project = { id: string; name: string; path: string; addedAt: number; openedAt: number; trusted?: boolean }

const file = () => join(app.getPath('userData'), 'projects.json')

function load(): Project[] {
  try {
    // a project is trusted only once the user said so: a missing flag means not trusted
    return JSON.parse(readFileSync(file(), 'utf8')) as Project[]
  } catch { return [] }
}
export const listProjects = (): Project[] => load()
// the page may only act on folders the user added through a dialog (open folder, clone)
export const isKnown = (path: string): boolean => load().some((p) => p.path === path)
export function isTrusted(path: string): boolean { return !!load().find((p) => p.path === path)?.trusted }
function save(list: Project[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(list, null, 1))
}
function idOf(path: string): string {
  let h = 0
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) | 0
  return 'p' + (h >>> 0).toString(36)
}

export function addProject(path: string): Project {
  const list = load()
  const found = list.find((p) => p.path === path)
  const now = Date.now()
  if (found) { found.openedAt = now; save(list); return found }
  const p: Project = { id: idOf(path), name: basename(path), path, addedAt: now, openedAt: now, trusted: false }
  save([p, ...list])
  return p
}

export function isGit(path: string): boolean { return existsSync(join(path, '.git')) }

function run(cmd: string, args: string[], cwd: string, onLine?: (l: string) => void): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd, env: process.env })
    let out = ''
    const take = (b: Buffer) => { const s = b.toString(); out += s; s.split(/\r|\n/).filter(Boolean).forEach((l) => onLine?.(l)) }
    p.stdout.on('data', take); p.stderr.on('data', take)
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
    p.on('error', (e) => resolve({ code: 1, out: String(e) }))
  })
}

/* the project's own icon, if it has one : the favicon its web pages point to, or a usual file name in the usual folders.
   Read only inside the project, small images only, given to the page as a data URL (an <img> never runs what is in it) */
const DIRS = ['', 'public', 'static', 'app', 'src', 'src/app', 'app/img', 'assets', 'img', 'web', 'web/public', 'frontend/public', 'client/public', 'apps/web/public', 'docs']
const NAMES = ['favicon.svg', 'favicon.png', 'favicon.ico', 'icon.svg', 'icon.png', 'apple-touch-icon.png', 'logo.svg', 'logo.png']
const MIME: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
function projectIcon(root: string): string {
  const inside = (f: string) => { const r = resolve(f); return r.startsWith(resolve(root) + sep) ? r : null }
  const read = (f: string | null) => {
    try {
      if (!f || !MIME[extname(f).toLowerCase()] || !existsSync(f) || statSync(f).size > 300_000) return ''
      return `data:${MIME[extname(f).toLowerCase()]};base64,${readFileSync(f).toString('base64')}`
    } catch { return '' }
  }
  // 1. what the web pages say (<link rel="icon" href="…">), the page's folder taken as the site's root
  for (const d of ['', 'public', 'app', 'src', 'web', 'frontend', 'client']) {
    const html = join(root, d, 'index.html')
    if (!existsSync(html)) continue
    try {
      const m = readFileSync(html, 'utf8').slice(0, 20000).match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i)
      const href = m?.[0].match(/href=["']([^"'?#]+)/i)?.[1]
      if (href && !/^(https?:|data:|\/\/)/i.test(href)) { const r = read(inside(join(dirname(html), href.replace(/^\//, '')))); if (r) return r }
    } catch { /* unreadable page */ }
  }
  // 2. the usual names in the usual folders
  for (const d of DIRS) for (const n of NAMES) { const r = read(inside(join(root, d, n))); if (r) return r }
  return ''
}

export function registerProjects(): void {
  ipcMain.handle('projects:icon', (_e, path: string) => (typeof path === 'string' && isKnown(path) ? projectIcon(path) : ''))
  // the git branch a folder of a known project is on (empty outside git)
  ipcMain.handle('projects:branch', (_e, dir: string) => {
    if (typeof dir !== 'string' || !load().some((p) => dir === p.path || dir.startsWith(p.path + sep))) return ''
    return new Promise<string>((res) => execFile('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { windowsHide: true, timeout: 3000 }, (e, out) => res(e ? '' : String(out).trim())))
  })
  ipcMain.handle('projects:list', () => load().filter((p) => existsSync(p.path)).map((p) => ({ ...p, git: isGit(p.path) })))

  ipcMain.handle('projects:openFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { title: 'Open folder', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = addProject(r.filePaths[0])
    ensureStructureMap(p.path)
    void startAnalysis(p.path, true)
    return { ...p, git: isGit(p.path) }
  })

  ipcMain.handle('projects:touch', (_e, path: string) => {
    if (!isKnown(path) || !existsSync(path) || !statSync(path).isDirectory()) return null
    const p = addProject(path)
    ensureStructureMap(p.path)
    void startAnalysis(p.path, true)
    return { ...p, git: isGit(p.path) }
  })

  // clone: pick the parent folder, the repository lands in <parent>/<repository name>
  ipcMain.handle('projects:clone', async (e, url: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const clean = url.trim()
    if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(clean)) return { error: 'Invalid git URL' }
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to clone', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const name = basename(clean).replace(/\.git$/, '') || 'repo'
    const dest = join(r.filePaths[0], name)
    if (existsSync(dest)) return { error: `A folder named ${name} already exists here` }
    const res = await run('git', ['clone', '--progress', clean, dest], r.filePaths[0], (l) => e.sender.send('projects:cloneProgress', l))
    if (res.code !== 0) return { error: res.out.split('\n').filter(Boolean).pop() || 'Clone failed' }
    const p = addProject(dest)
    ensureStructureMap(p.path)
    void startAnalysis(p.path, true)
    return { ...p, git: true }
  })

  // a new project from nothing : the user names the folder and picks where it goes ; it starts as a git repository
  ipcMain.handle('projects:create', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, { title: 'New project', buttonLabel: 'Create', nameFieldLabel: 'Project name:', defaultPath: 'new-project', properties: ['createDirectory'] })
    if (r.canceled || !r.filePath) return null
    const dest = r.filePath
    if (existsSync(dest)) return { error: `A folder named ${basename(dest)} already exists here` }
    try { mkdirSync(dest, { recursive: true }) } catch (x) { return { error: (x as Error).message } }
    await run('git', ['init'], dest)
    const p = addProject(dest)
    ensureStructureMap(p.path)
    void startAnalysis(p.path, true)
    return { ...p, git: isGit(p.path) }
  })

  ipcMain.handle('projects:gitInit', async (_e, path: string) => {
    if (!isKnown(path)) return false
    const r = await run('git', ['init'], path)
    return r.code === 0
  })

  ipcMain.handle('projects:trust', (_e, path: string, trusted: boolean) => {
    const list = load(), p = list.find((x) => x.path === path)
    if (!p) return false
    p.trusted = !!trusted; save(list); return true
  })
  // the sidebar's order, chosen by dragging : the ids in their new order (unknown ids ignored, missing ones kept at the end)
  ipcMain.handle('projects:reorder', (_e, ids: unknown) => {
    if (!Array.isArray(ids)) return false
    const list = load(), rank = new Map(ids.filter((x): x is string => typeof x === 'string').map((id, i) => [id, i]))
    save([...list].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)))
    return true
  })
  ipcMain.handle('projects:remove', (_e, id: string) => { save(load().filter((p) => p.id !== id)); return true })
}
