/* Clearing what Mira keeps on this computer */
import { app, ipcMain } from 'electron'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listProjects } from './projects'

export function registerData(): void {
  ipcMain.handle('data:clear', (_e, what: string) => {
    const ud = app.getPath('userData')
    if (what === 'projects') { writeFileSync(join(ud, 'projects.json'), '[]'); return true }
    // saved prompts of focused discussions, in each project's .miraterminal/sessions
    if (what === 'sessions') {
      for (const p of listProjects()) { const d = join(p.path, '.miraterminal', 'sessions'); if (existsSync(d)) rmSync(d, { recursive: true, force: true }) }
      return true
    }
    return false
  })
}
