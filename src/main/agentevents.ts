/* Agent events : Claude Code and Codex tell Mira when they work, wait for you or finish.
   Their own hooks (added for Mira's sessions only) write a tiny file named after the terminal ; Mira watches the folder. */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, watch } from 'node:fs'
import { join } from 'node:path'

export const eventsDir = () => join(app.getPath('userData'), 'events')

// what an event file's name says : <terminal id>.<working | needs | done>
const KINDS = new Set(['working', 'needs', 'done'])

export function registerAgentEvents(): void {
  const dir = eventsDir()
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { force: true })
  watch(dir, (_ev, name) => {
    if (!name) return
    const m = String(name).match(/^(t\d+)\.(working|needs|done)$/)
    if (!m || !KINDS.has(m[2])) return
    // removing the file below is an event too : without this, every event came twice, and a late "working" could follow the "done"
    if (!existsSync(join(dir, String(name)))) return
    rmSync(join(dir, String(name)), { force: true })
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agent:event', m[1], m[2])
  })
  // the Dock badge : how many agents wait for you or finished while you were away
  ipcMain.handle('app:badge', (_e, n: number) => { if (process.platform === 'darwin') app.dock?.setBadge(n > 0 ? String(Math.min(99, n | 0)) : ''); return true })
}

/* the hook command an agent runs : it only touches a file, it never reads anything */
export const hookCmd = (kind: 'working' | 'needs' | 'done') => `[ -n "$MIRA_PTY" ] && : > "$MIRA_EVENTS/$MIRA_PTY.${kind}"`
