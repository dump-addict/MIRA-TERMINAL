/* Ideas for new projects (kept in Mira : they have no folder yet) and the pull requests waiting on GitHub (read with the gh command) */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addProject, isGit, isKnown } from './projects'
import { ensureStructureMap } from './structure'
import { posixShell, nativePathOf, looksLikePath } from './platform'

export type Idea = { id: string; title: string; description: string; createdAt: number }
const file = () => join(app.getPath('userData'), 'ideas.json')
const load = (): Idea[] => { try { const j = JSON.parse(readFileSync(file(), 'utf8')); return Array.isArray(j) ? j : [] } catch { return [] } }
const save = (l: Idea[]) => {
  mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(file(), JSON.stringify(l, null, 1))
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ideas:changed')
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export type Pull = { number: number; title: string; author: string; branch: string; url: string; draft: boolean; decision: string; updatedAt: string }
export type Reviews = { state: 'ok' | 'nogh' | 'signedout' | 'nogithub' | 'error'; pulls: Pull[] }

const sh = posixShell()
let ghPath: string | null | undefined
// a GUI app does not know the user's PATH : gh is found once through a login shell
async function gh(): Promise<string | null> {
  if (ghPath !== undefined) return ghPath
  ghPath = await new Promise<string | null>((res) => execFile(sh, ['-ilc', nativePathOf('gh')], { timeout: 8000, windowsHide: true }, (_e, out) => {
    const p = String(out ?? '').trim().split('\n').pop() ?? ''
    res(looksLikePath(p) ? p : null)
  }))
  return ghPath
}
const runGh = (bin: string, args: string[], cwd: string) => new Promise<{ ok: boolean; out: string }>((res) =>
  execFile(bin, args, { cwd, timeout: 20000, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (e, out, err) => res({ ok: !e, out: String(out ?? '') || String(err ?? '') })))

export function registerWork(): void {
  ipcMain.handle('ideas:list', () => load())
  ipcMain.handle('ideas:save', (_e, i: Record<string, unknown>) => {
    if (!i || typeof i !== 'object') return null
    const l = load()
    const prev = l.find((x) => x.id === i.id)
    const idea: Idea = { id: prev?.id ?? `idea-${Date.now().toString(36)}`, title: str(i.title, 300).trim() || prev?.title || 'Untitled', description: typeof i.description === 'string' ? i.description.slice(0, 20000) : prev?.description ?? '', createdAt: prev?.createdAt ?? Date.now() }
    save(prev ? l.map((x) => (x.id === idea.id ? idea : x)) : [...l, idea])
    return idea
  })
  ipcMain.handle('ideas:delete', (_e, id: string) => { save(load().filter((x) => x.id !== id)); return true })
  // an idea becomes a project : a new folder where the user chooses, added to the projects ; the idea leaves the list
  ipcMain.handle('ideas:start', async (e, id: string) => {
    const idea = load().find((x) => x.id === id)
    if (!idea) return null
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { title: `Where should "${idea.title}" live?`, buttonLabel: 'Create here', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const base = idea.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'new-project'
    let dir = join(r.filePaths[0], base), n = 2
    while (existsSync(dir)) dir = join(r.filePaths[0], `${base}-${n++}`)
    mkdirSync(dir, { recursive: true })
    const p = addProject(dir)
    ensureStructureMap(p.path)
    save(load().filter((x) => x.id !== id))
    return { project: { ...p, git: isGit(p.path) }, idea }
  })

  // the open pull requests of a project, newest first
  ipcMain.handle('reviews:list', async (_e, root: string): Promise<Reviews> => {
    if (typeof root !== 'string' || !isKnown(root)) return { state: 'error', pulls: [] }
    if (!isGit(root)) return { state: 'nogithub', pulls: [] }
    const bin = await gh()
    if (!bin) return { state: 'nogh', pulls: [] }
    const r = await runGh(bin, ['pr', 'list', '--state', 'open', '--limit', '40', '--json', 'number,title,author,headRefName,url,isDraft,reviewDecision,updatedAt'], root)
    if (!r.ok) {
      if (/auth login|not logged|authenticat/i.test(r.out)) return { state: 'signedout', pulls: [] }
      if (/no git remotes|not a git repository|none of the git remotes|could not determine/i.test(r.out)) return { state: 'nogithub', pulls: [] }
      return { state: 'error', pulls: [] }
    }
    try {
      const l = JSON.parse(r.out) as { number: number; title: string; author?: { login?: string }; headRefName: string; url: string; isDraft: boolean; reviewDecision: string; updatedAt: string }[]
      return { state: 'ok', pulls: l.map((x) => ({ number: x.number, title: x.title, author: x.author?.login ?? '', branch: x.headRefName, url: x.url, draft: x.isDraft, decision: x.reviewDecision ?? '', updatedAt: x.updatedAt })) }
    } catch { return { state: 'error', pulls: [] } }
  })
  ipcMain.handle('reviews:gh', async () => !!(await gh()))
  // after an install or a sign-in made in a terminal tab, look again
  ipcMain.handle('reviews:recheck', async () => { ghPath = undefined; return !!(await gh()) })
}
