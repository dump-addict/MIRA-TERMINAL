/* Files of a project : list, read and write, only inside folders the user added (and never in .git) */
import { ipcMain } from 'electron'
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { listProjects } from './projects'
import { noLinks } from './safepath'

const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.nuxt', '.turbo', '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'target', '.DS_Store'])
const MAX = 5 * 1024 * 1024

/* the project a path belongs to, or null : every file call checks it */
function rootOf(p: string): string | null {
  const r = resolve(p)
  if (r.split(sep).includes('.git')) return null
  const pr = listProjects().map((x) => resolve(x.path)).filter((x) => r === x || r.startsWith(x + sep)).sort((a, b) => b.length - a.length)[0]
  // a link inside the project (docs/setup.md -> ~/.ssh/config) would reach outside it
  return pr && noLinks(pr, r) ? pr : null
}

export function registerFiles(): void {
  // one folder level, folders first
  ipcMain.handle('files:list', (_e, dir: string) => {
    if (!rootOf(dir)) return []
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => !SKIP.has(e.name))
        .map((e) => ({ name: e.name, path: join(dir, e.name), dir: e.isDirectory() }))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
    } catch { return [] }
  })
  // every file of a project, for quick open (paths relative to the project)
  ipcMain.handle('files:all', (_e, root: string) => {
    const r = rootOf(root)
    if (!r) return []
    const out: string[] = []
    const walk = (d: string, depth: number) => {
      if (out.length > 20000 || depth > 12) return
      let ents: import('node:fs').Dirent[] = []
      try { ents = readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const e of ents) {
        if (SKIP.has(e.name)) continue
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p, depth + 1); else if (e.isFile()) out.push(relative(root, p))
      }
    }
    walk(root, 0)
    return out
  })
  ipcMain.handle('files:read', (_e, p: string) => {
    if (!rootOf(p) || !existsSync(p)) return { error: 'Not a file of an open project' }
    const st = statSync(p)
    if (!st.isFile()) return { error: 'Not a file' }
    if (st.size > MAX) return { error: 'File too large to open (over 5 MB)' }
    const buf = readFileSync(p)
    // a NUL byte in the first 8 kB : a binary file
    if (buf.subarray(0, 8192).includes(0)) return { error: 'Binary file' }
    return { text: buf.toString('utf8'), mtime: st.mtimeMs }
  })
  ipcMain.handle('files:write', (_e, p: string, text: string) => {
    if (!rootOf(p) || typeof text !== 'string' || text.length > MAX) return false
    writeFileSync(p, text)
    return true
  })
}
