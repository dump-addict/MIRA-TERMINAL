/* System : session restore file, open a project in another app, launch at login, menu bar icon, global shortcut */
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { frontWindow, isMainWindow } from './windows'
import { getSettings, whenSaved, type Settings } from './settings'
import { isKnown } from './projects'
import { applyNetwork } from './network'
import { shellOut } from './platform'

const sessionFile = () => join(app.getPath('userData'), 'session.json')
let tray: Tray | null = null
let shortcut: string | null = null

const win = () => frontWindow()
let newWindow: () => void = () => {}
const show = () => { const w = win(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus() } }
const send = (a: string) => { show(); win()?.webContents.send('app:menu', a) }

function apply(s: Settings): void {
  void applyNetwork(s)
  // only when it changes : macOS refuses the call from an unsigned build, and there is nothing to do when it is already right
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== s.launchAtLogin) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin })
  // menu bar icon : show Mira, new terminal, new agent, quit
  if (s.menuBarIcon && !tray) {
    const img = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAtElEQVR4nO1YWw6AMAijxPtfGf+NIivgY1k/pUADAxJFFhYmAxybDfLvEIqnA87e9zuE4ymR1IrEnNqVTGZdvC3oUNk+F1dv6DWofAxbwhcdbVVyz6CLp0QQBJNQ8bRogwvJx8gbOpIrxhyVU4bkYsQvx14H+SBvVHgQmArhImlaDCuoFawgOFWiq5M9HS2XP9MyJO3lgixpLxVkxbz5pqwNS9ATi7F09KfaQ17SzD+ABfGwAxamIEGJ9lQxAAAAAElFTkSuQmCC', 'base64'), { scaleFactor: 2 })
    if (process.platform === 'darwin') img.setTemplateImage(true)
    tray = new Tray(img)
    tray.setToolTip('Mira Terminal')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Mira', click: show },
      { label: 'New window', click: () => newWindow() },
      { label: 'New terminal', click: () => send('terminal') },
      { label: 'New agent', click: () => send('agent') },
      { type: 'separator' },
      { label: 'Quit Mira', click: () => app.quit() }
    ]))
  }
  if (!s.menuBarIcon && tray) { tray.destroy(); tray = null }
  // a global shortcut brings Mira to the front from any app
  if (shortcut && shortcut !== s.summonShortcut) { globalShortcut.unregister(shortcut); shortcut = null }
  if (s.summonShortcut !== 'off' && !shortcut) { try { if (globalShortcut.register(s.summonShortcut, show)) shortcut = s.summonShortcut } catch { /* taken */ } }
}

export function registerSystem(create: () => void): void {
  newWindow = create
  // only the main window restores and saves the session : the other windows start empty
  ipcMain.handle('session:load', (e) => { if (!isMainWindow(e.sender.id)) return null; try { return JSON.parse(readFileSync(sessionFile(), 'utf8')) } catch { return null } })
  ipcMain.handle('session:store', (e, state: unknown) => { if (!isMainWindow(e.sender.id)) return false; try { writeFileSync(sessionFile(), JSON.stringify(state).slice(0, 2_000_000)); return true } catch { return false } })
  // open a project folder in the app chosen in settings : only folders the user added
  ipcMain.handle('app:openIn', (_e, path: string) => {
    if (!isKnown(path)) return 'refused'
    const a = getSettings().openIn
    if (a === 'Finder') return shell.openPath(path)
    if (process.platform === 'darwin') return new Promise<string>((res) => execFile('/usr/bin/open', ['-a', a, path], (err) => res(err ? `${a} is not installed` : '')))
    // Windows and Linux : the editors' own command line tools, found in the login shell's PATH
    const cli: Record<string, string> = { 'Visual Studio Code': 'code', Cursor: 'cursor', Zed: 'zed' }
    if (!cli[a]) return shell.openPath(path)
    return shellOut(`${cli[a]} ${JSON.stringify(path)} && echo ok`, 8000).then((o) => (o.endsWith('ok') ? '' : `${a} is not installed`))
  })
  whenSaved(apply)
  apply(getSettings())
}
export function releaseSystem(): void { globalShortcut.unregisterAll(); tray?.destroy(); tray = null }
