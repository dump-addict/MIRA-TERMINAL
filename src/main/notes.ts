/* Markdown tabs : a note is a plain .md file, kept in the project's .miraterminal/notes/ */
import { ipcMain } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { listProjects } from './projects'
import { noLinks } from './safepath'

export function registerNotes(): void {
  ipcMain.handle('notes:create', (_e, root?: string) => {
    const base = root && listProjects().some((x) => x.path === root) ? root : join(homedir(), 'Documents')
    const dir = join(base, '.miraterminal', 'notes')
    if (!noLinks(base, dir)) throw new Error('The notes folder is a link to somewhere else')
    mkdirSync(dir, { recursive: true })
    let n = 1
    while (existsSync(join(dir, `note-${n}.md`))) n++
    const f = join(dir, `note-${n}.md`)
    writeFileSync(f, '')
    return f
  })
  // only .md files inside a known project (or the default notes folder) can be read or written this way
  // (in a project : anywhere in it ; outside : only Mira's own notes folder in Documents), never through a link
  const md = (f: string) => {
    const p = resolve(f)
    const roots = [...listProjects().map((x) => x.path), join(homedir(), 'Documents', '.miraterminal', 'notes')]
    const r = roots.find((x) => p.startsWith(resolve(x) + sep))
    if (!p.endsWith('.md') || !r || !noLinks(r, p)) throw new Error('Not a note of a known project')
    return p
  }
  ipcMain.handle('notes:read', (_e, f: string) => { try { return readFileSync(md(f), 'utf8') } catch { return '' } })
  ipcMain.handle('notes:write', (_e, f: string, text: string) => { writeFileSync(md(f), text); return true })
}
