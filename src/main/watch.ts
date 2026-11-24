/* Activity : which files of the open projects change, so the map can follow the work (agents, editors, git) */
import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'

const SKIP = /(^|\/)(\.git|node_modules|\.miraterminal|dist|out|build|\.next|\.cache|__pycache__|\.venv|venv|target|coverage)(\/|$)|\.DS_Store$|~$|\.swp$/

// one watcher per project shown in a window
type Watch = { w: FSWatcher; batch: Set<string>; timer: NodeJS.Timeout | null }
const watches = new Map<string, Watch>()

export function watchProject(root: string): void {
  if (watches.has(root)) return
  try {
    const x: Watch = { w: null as unknown as FSWatcher, batch: new Set(), timer: null }
    x.w = watch(root, { recursive: true }, (_ev, name) => {
      if (!name) return
      const f = String(name).replace(/\\/g, '/')
      if (SKIP.test(f)) return
      x.batch.add(f)
      if (!x.timer) x.timer = setTimeout(() => flush(root, x), 700)   // a burst of writes becomes one message
    })
    x.w.on('error', () => unwatchProject(root))
    watches.set(root, x)
  } catch { /* a folder that cannot be watched : the map just does not follow */ }
}

function flush(root: string, x: Watch): void {
  x.timer = null
  if (!x.batch.size) return
  const files = [...x.batch].slice(0, 200); x.batch = new Set()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('project:activity', root, files)
}

export function unwatchProject(root: string): void {
  const x = watches.get(root); if (!x) return
  watches.delete(root)
  try { x.w.close() } catch { /* already closed */ }
  if (x.timer) clearTimeout(x.timer)
}

export function stopWatch(): void { for (const r of [...watches.keys()]) unwatchProject(r) }
