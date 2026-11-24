import { execFile } from 'node:child_process'
/* Mira Terminal: main process (window, terminals) */
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, session, shell, systemPreferences } from 'electron'
import { trackWindow } from './windows'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { registerTerminals, killAllTerminals, openTerminals, killTerminalsOf } from './terminals'
import { registerProjects } from './projects'
import { registerAnalysis, stopAnalyses } from './analyse'
import { registerMapServer, stopMapServer, cleanupMapServer } from './mapserver'
import { registerAgents } from './agents'
import { registerNotes } from './notes'
import { registerTasks } from './tasks'
import { registerWork } from './work'
import { registerComposer } from './composer'
import { registerSettings, getSettings } from './settings'
import { registerData } from './data'
import { registerAwake, releaseAwake } from './awake'
import { registerPorts } from './ports'
import { registerCustomize } from './customize'
import { registerAccounts } from './accounts'
import { registerSystem, releaseSystem } from './system'
import { registerFiles } from './files'
import { registerNetwork, earlyNetwork } from './network'
import { registerVoice } from './voice'
import { registerAgentEvents } from './agentevents'
import { registerDiagnostics } from './diagnostics'
import { registerUpdates } from './updates'
import { earlyGraphics, registerAdvanced } from './advanced'
import { isMac } from './platform'

app.setName('Mira Terminal')
earlyNetwork()
earlyGraphics()

export function createWindow(): BrowserWindow {
  // a new window opens a little down and right of the one in front, like a browser's
  const from = BrowserWindow.getFocusedWindow()?.getBounds()
  const win = new BrowserWindow({
    width: from?.width ?? 1440,
    height: from?.height ?? 900,
    ...(from ? { x: from.x + 28, y: from.y + 28 } : {}),
    minWidth: 900,
    minHeight: 560,
    title: 'Mira Terminal',
    backgroundColor: '#000000',
    // macOS : the traffic lights over the page ; Windows and Linux : their own buttons drawn over the top right corner
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#000000', symbolColor: '#ededed', height: 40 } }),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // the page has no Node access : it only talks to the main process through the preload bridge
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  trackWindow(win)
  const wcId = win.webContents.id
  win.on('closed', () => killTerminalsOf(wcId))
  // in full screen the window buttons are gone : the page moves its title bar to the left
  win.on('enter-full-screen', () => win.webContents.send('app:menu', 'fullscreen-on'))
  win.on('leave-full-screen', () => win.webContents.send('app:menu', 'fullscreen-off'))
  win.once('ready-to-show', () => { win.webContents.setZoomFactor(getSettings().uiZoom / 100); win.show() })
  // external links open in the browser, never in the app window
  // only web links leave the app, to the browser ; never file:, never other app schemes
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // the window never navigates away from the app ; the map stays inside its frame
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault() })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
  // ⌘E dictates : caught here, before macOS menus and the terminal can take it, and passed to the page (key down and key up, for hold to talk)
  let dictating = false
  win.webContents.on('before-input-event', (e, input) => {
    // ⌘⇧N : a new window
    // the shortcut keys : ⌘ on macOS ; Ctrl+Shift elsewhere (Ctrl alone belongs to the shell), and ⌘⇧ becomes Ctrl+Alt
    const mod = isMac ? input.meta && !input.control : input.control && !input.meta
    const plain = mod && (isMac ? !input.shift && !input.alt : input.shift && !input.alt)
    const shifted = mod && (isMac ? input.shift && !input.alt : input.alt && !input.shift)
    if (input.type === 'keyDown' && shifted && input.code === 'KeyN') { e.preventDefault(); if (!input.isAutoRepeat) createWindow(); return }
    const isE = input.key.toLowerCase() === 'e' || input.code === 'KeyE'
    if (input.type === 'keyDown' && isE && plain) {
      e.preventDefault()
      if (input.isAutoRepeat) return
      dictating = true
      void (async () => {
        if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') await systemPreferences.askForMediaAccess('microphone')
        win.webContents.send('app:menu', 'voice-down')
      })()
    } else if (input.type === 'keyUp' && dictating && (isE || input.key === 'Meta')) {
      dictating = false
      win.webContents.send('app:menu', 'voice-up')
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  // no camera, microphone, location, notifications prompt or other device access for any page
  // the only exception : the microphone, for dictation, asked by Mira's own page (never by the map or a web page)
  // (in development, the page's own address, whatever port it got)
  const dev = process.env.ELECTRON_RENDERER_URL?.replace(/\/?$/, '/')
  const own = (url: string) => url.startsWith('file://') || (!!dev && url.startsWith(dev))
  // the clipboard : Mira's own page copies and pastes (copy buttons, the terminal), the map only copies (its blocks) ; nothing else
  const slash = (u: string) => (u.endsWith('/') ? u : u + '/')
  const mapPage = (url: string) => /^http:\/\/127\.0\.0\.1:\d+\//.test(slash(url))
  const clip = (perm: string, url: string) => (perm === 'clipboard-sanitized-write' && (own(slash(url)) || mapPage(url))) || (perm === 'clipboard-read' && own(slash(url)))
  session.defaultSession.setPermissionRequestHandler((wc, perm, done, details) => {
    const audioOnly = perm === 'media' && (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === 'audio')
    const from = (details as { requestingUrl?: string }).requestingUrl || wc.getURL()
    done((!!audioOnly && own(slash(from)) && !from.includes('127.0.0.1')) || clip(perm, from))
  })
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => (perm === 'media' && !!wc && own(slash(origin || wc.getURL())) && !(origin || '').includes('127.0.0.1')) || clip(perm, origin || wc?.getURL() || ''))
  registerDiagnostics()
  registerUpdates()
  registerAdvanced()
  registerSettings()
  registerData()
  registerAwake()
  registerPorts()
  registerCustomize()
  registerAccounts()
  registerFiles()
  registerNetwork()
  registerVoice()
  registerAgentEvents()
  registerTerminals()
  registerAgents()
  registerNotes()
  registerTasks()
  registerWork()
  registerComposer()
  registerProjects()
  registerAnalysis()
  cleanupMapServer()
  registerMapServer()
  // a terminal rang its bell (an agent finished or waits) : a system notification, when Mira is in the background if so set
  ipcMain.handle('app:notify', (e, title: string, body: string, force?: boolean) => {
    const st = getSettings(), win = BrowserWindow.fromWebContents(e.sender)
    if (!force && (!st.notifyEnabled || (st.notifyOnlyAway && win?.isFocused()))) return false
    if (!Notification.isSupported()) return false
    const n = new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 200), silent: !st.notifySound || st.notifySoundName === 'none', sound: st.notifySoundName === 'default' || st.notifySoundName === 'none' ? undefined : st.notifySoundName })
    n.on('click', () => { win?.show(); win?.focus() })
    // the answer says whether macOS showed it : 'failed' comes when notifications are off for the app
    return new Promise<boolean | string>((res) => {
      n.once('show', () => res(true))
      n.once('failed', (_ev, err) => res(String(err || 'failed')))
      setTimeout(() => res(true), 3000)
      n.show()
    })
  })
  // hear a notification sound when you pick it : only the macOS system sounds, by name
  ipcMain.handle('app:sound', (_e, name: string) => {
    if (process.platform !== 'darwin' || !['Glass', 'Ping', 'Pop', 'Hero', 'Submarine', 'Tink'].includes(name)) return false
    execFile('/usr/bin/afplay', [`/System/Library/Sounds/${name}.aiff`], () => {}); return true
  })
  // open a known file or folder in Finder or its app : nothing else can be opened this way
  // the microphone : macOS asks once (its own window) ; afterwards only System Settings can change the answer
  ipcMain.handle('app:micAccess', async () => {
    if (process.platform !== 'darwin') return 'granted'
    const s = systemPreferences.getMediaAccessStatus('microphone')
    if (s === 'not-determined') return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
    return s
  })
  ipcMain.handle('app:fullscreen', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false)
  ipcMain.handle('app:open', (_e, what: string) => {
    const paths: Record<string, string> = {
      settings: join(app.getPath('userData'), 'settings.json'),
      data: app.getPath('userData'),
      claude: join(homedir(), '.claude', 'settings.json'),
      codex: join(homedir(), '.codex', 'config.toml')
    }
    // the system's own settings page : macOS and Windows have one per privacy setting, Linux desktops differ
    const sys: Record<string, Record<string, string>> = {
      darwin: { microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone', notifications: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension' },
      win32: { microphone: 'ms-settings:privacy-microphone', notifications: 'ms-settings:notifications' }
    }
    if (what === 'microphone' || what === 'notifications') { const u = sys[process.platform]?.[what]; return u ? shell.openExternal(u).then(() => '') : 'unsupported' }
    const p = paths[what]
    return p ? shell.openPath(p) : 'unknown'
  })
  ipcMain.handle('app:info', () => ({ name: 'Mira Terminal', version: app.getVersion(), home: homedir(), platform: process.platform }))
  ipcMain.handle('app:newWindow', () => { createWindow(); return true })
  createWindow()
  registerSystem(createWindow)
  if (process.platform === 'darwin') app.dock?.setMenu(Menu.buildFromTemplate([{ label: 'New window', click: () => createWindow() }]))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  stopMapServer()
  if (process.platform !== 'darwin') app.quit()
})
let quitting = false
app.on('before-quit', (e) => {
  // terminals still running : ask once before closing them
  if (!quitting && getSettings().confirmQuit && openTerminals() > 0) {
    e.preventDefault()
    const n = openTerminals()
    const r = dialog.showMessageBoxSync({ type: 'question', buttons: ['Quit', 'Cancel'], defaultId: 0, cancelId: 1, message: `Quit Mira?`, detail: `${n} terminal${n === 1 ? ' is' : 's are'} still running. They will be closed.` })
    if (r !== 0) return
    quitting = true
    app.quit()
    return
  }
  killAllTerminals(); stopAnalyses(); stopMapServer(); releaseAwake(); releaseSystem()
})
