/* Advanced : graphics, settings files to share, running terminals, developer tools, and removing all of Mira's data */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { applySettings, getSettings } from './settings'
import { killAllTerminals, openTerminals } from './terminals'
import { stopMapServer } from './mapserver'
import { claudeKeychainService, listAccounts } from './accounts'
import { isMac } from './platform'

// what stays on this Mac when settings are shared : the microphone, the shell, the proxy (it can hold a password)
const LOCAL = ['voiceMic', 'shell', 'proxyUrl', 'noProxy']

/* before the app is ready : graphics without the GPU, when an app flickers or draws badly on some screens */
export function earlyGraphics(): void {
  try { if (!getSettings().gpu) app.disableHardwareAcceleration() } catch { /* first run */ }
}

let removing = false

export function registerAdvanced(): void {
  const win = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined

  ipcMain.handle('advanced:export', async (e) => {
    const r = await dialog.showSaveDialog(win(e)!, { defaultPath: join(app.getPath('desktop'), 'mira-settings.json'), filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return ''
    const s = { ...getSettings() } as Record<string, unknown>
    for (const k of LOCAL) delete s[k]
    writeFileSync(r.filePath, JSON.stringify({ mira: 'settings', version: 1, settings: s }, null, 1))
    return r.filePath
  })

  ipcMain.handle('advanced:import', async (e) => {
    const r = await dialog.showOpenDialog(win(e)!, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePaths[0]) return { error: '' }
    try {
      const j = JSON.parse(readFileSync(r.filePaths[0], 'utf8'))
      const s = j?.mira === 'settings' ? j.settings : j
      if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: 'This is not a Mira settings file' }
      for (const k of LOCAL) delete s[k]
      // every value is checked as if set by hand : anything unknown or out of range is dropped
      applySettings(s)
      return { ok: true }
    } catch { return { error: 'This file cannot be read' } }
  })

  ipcMain.handle('advanced:terminals', () => openTerminals())
  ipcMain.handle('advanced:stopTerminals', () => { const n = openTerminals(); killAllTerminals(); return n })
  ipcMain.handle('advanced:devtools', (e) => { e.sender.toggleDevTools(); return true })
  ipcMain.handle('advanced:relaunch', () => { app.relaunch(); app.exit(0) })

  // everything Mira keeps : settings, projects list, extra accounts and their sign-ins, voice models, events. Your folders are not touched.
  ipcMain.handle('advanced:removeAll', async () => {
    if (removing) return false
    removing = true
    for (const a of await listAccounts('claude').catch(() => [])) {
      if (a.system || !a.dir) continue
      if (isMac) await new Promise((res) => execFile('/usr/bin/security', ['delete-generic-password', '-s', claudeKeychainService(a.dir)], () => res(null)))
    }
    killAllTerminals()
    stopMapServer()
    const dir = app.getPath('userData')
    app.once('will-quit', () => { if (basename(dir) === 'Mira Terminal') rmSync(dir, { recursive: true, force: true }) })
    app.quit()
    return true
  })
}
