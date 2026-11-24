/* Tasks : a project's to-do list, kept in the project itself (.miraterminal/tasks.json), so it goes with the code in git.
   Agents can read and edit the same file ; Mira watches it and shows their changes at once. */
import { BrowserWindow, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { isKnown } from './projects'
import { noLinks } from './safepath'

export type Status = 'backlog' | 'todo' | 'progress' | 'review' | 'done' | 'canceled'
export type Task = {
  id: string; title: string; description: string; status: Status; priority: 0 | 1 | 2 | 3 | 4
  labels: string[]; part: string; parent: string; branch: string; order: number; createdAt: number; updatedAt: number
  /* the agent chosen for it (claude, codex...) ; empty = the default agent */
  agent: string
}
type File = { version: 1; prefix: string; next: number; tasks: Task[] }

const STATUSES: Status[] = ['backlog', 'todo', 'progress', 'review', 'done', 'canceled']
const file = (root: string) => join(root, '.miraterminal', 'tasks.json')
// the short name in front of each number : NORTHWIND gives NOR-1, NOR-2…
const prefixOf = (root: string) => (basename(root).replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'TSK')

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
function clean(t: Record<string, unknown>, prev?: Task): Task {
  const now = Date.now()
  return {
    id: str(t.id, 20) || prev?.id || '',
    title: str(t.title, 300).trim() || prev?.title || 'Untitled',
    description: typeof t.description === 'string' ? t.description.slice(0, 20000) : prev?.description ?? '',
    status: STATUSES.includes(t.status as Status) ? (t.status as Status) : prev?.status ?? 'todo',
    priority: [0, 1, 2, 3, 4].includes(t.priority as number) ? (t.priority as Task['priority']) : prev?.priority ?? 0,
    labels: Array.isArray(t.labels) ? t.labels.filter((x) => typeof x === 'string').map((x) => x.slice(0, 30)).slice(0, 10) : prev?.labels ?? [],
    part: typeof t.part === 'string' ? t.part.slice(0, 100) : prev?.part ?? '',
    parent: typeof t.parent === 'string' ? t.parent.slice(0, 20) : prev?.parent ?? '',
    branch: typeof t.branch === 'string' ? t.branch.slice(0, 200) : prev?.branch ?? '',
    agent: typeof t.agent === 'string' ? t.agent.replace(/[^a-z0-9-]/gi, '').slice(0, 30) : prev?.agent ?? '',
    // its place in its group, when moved by hand (lower first)
    order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : prev?.order ?? 0,
    createdAt: prev?.createdAt ?? (typeof t.createdAt === 'number' ? t.createdAt : now),
    updatedAt: now
  }
}

function read(root: string): File {
  try {
    const j = JSON.parse(readFileSync(file(root), 'utf8'))
    const tasks = Array.isArray(j.tasks) ? j.tasks.filter((x: unknown) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({ ...clean(x), createdAt: Number(x.createdAt) || Date.now(), updatedAt: Number(x.updatedAt) || Date.now() })) : []
    const max = Math.max(0, ...tasks.map((t: Task) => Number(t.id.split('-').pop()) || 0))
    return { version: 1, prefix: str(j.prefix, 6) || prefixOf(root), next: Math.max(Number(j.next) || 1, max + 1), tasks }
  } catch { return { version: 1, prefix: prefixOf(root), next: 1, tasks: [] } }
}

let writing = 0
function write(root: string, f: File): void {
  // written whole then renamed : an agent reading at the same time never sees half a file
  const tmp = file(root) + '.tmp'
  // never through a link a cloned repository put there (see safepath.ts)
  if (!noLinks(root, tmp) || !noLinks(root, file(root))) throw new Error('The project folder .miraterminal holds links to files outside the project')
  mkdirSync(join(root, '.miraterminal'), { recursive: true })
  writing = Date.now()
  writeFileSync(tmp, JSON.stringify(f, null, 2) + '\n')
  renameSync(tmp, file(root))
  // every view of the list follows, whoever changed it
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('tasks:changed', root)
  follow(root)
}

const watchers = new Map<string, FSWatcher>()
function follow(root: string): void {
  if (watchers.has(root)) return
  const dir = join(root, '.miraterminal')
  // a project without the folder yet : watched once a task is written there
  if (!existsSync(dir)) return
  let t: NodeJS.Timeout | undefined
  try {
    watchers.set(root, watch(dir, (_e, name) => {
      if (name !== 'tasks.json' || Date.now() - writing < 300) return
      clearTimeout(t)
      t = setTimeout(() => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('tasks:changed', root) }, 150)
    }))
  } catch { /* no watching : the list still works, refreshed by hand */ }
}

export function registerTasks(): void {
  const guard = (root: unknown): root is string => typeof root === 'string' && isKnown(root)
  ipcMain.handle('tasks:list', (_e, root: string) => {
    if (!guard(root)) return null
    follow(root)
    const f = read(root)
    return { prefix: f.prefix, tasks: f.tasks, exists: existsSync(file(root)) }
  })
  // a new task (no id) or a change to one : only the fields given change
  ipcMain.handle('tasks:save', (_e, root: string, t: Record<string, unknown>) => {
    if (!guard(root) || !t || typeof t !== 'object') return null
    const f = read(root)
    const prev = typeof t.id === 'string' ? f.tasks.find((x) => x.id === t.id) : undefined
    const merged = prev ? { ...prev, ...t } : t
    const task = clean(merged, prev)
    if (!prev) { task.id = `${f.prefix}-${f.next}`; f.next += 1; f.tasks.push(task) }
    else f.tasks = f.tasks.map((x) => (x.id === prev.id ? task : x))
    write(root, f)
    return task
  })
  ipcMain.handle('tasks:delete', (_e, root: string, id: string) => {
    if (!guard(root) || typeof id !== 'string') return false
    const f = read(root)
    f.tasks = f.tasks.filter((x) => x.id !== id).map((x) => (x.parent === id ? { ...x, parent: '' } : x))
    write(root, f)
    return true
  })
}
