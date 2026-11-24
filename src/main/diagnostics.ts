/* Diagnostics : a text file you can send to whoever helps you with a bug. Nothing is sent by Mira ;
   e-mails, your user name, your home folder and anything that looks like a key are removed before it is written. */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir, release, userInfo } from 'node:os'
import { join } from 'node:path'
import { getSettings } from './settings'
import { listProjects } from './projects'
import { openTerminals } from './terminals'
import { MODELS } from './voice'

// the last errors of the app and its page, kept in memory only
const errors: string[] = []
const keep = (line: string) => { errors.push(`${new Date().toISOString()} ${line}`.slice(0, 600)); if (errors.length > 100) errors.shift() }

export function redact(text: string): string {
  let t = text.split(homedir()).join('~')
  const user = userInfo().username
  if (user.length > 2) t = t.replace(new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[user]')
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(sk|pk|rk|ghp|gho|github_pat|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}/g, '[secret]')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+/g, '[secret]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[secret]')
    .replace(/(\/\/)[^/@\s]+:[^/@\s]+@/g, '$1[login]@')
}

function report(): string {
  const s = { ...getSettings() } as Record<string, unknown>
  s.voiceVocabulary = `${String(s.voiceVocabulary ?? '').split('\n').filter(Boolean).length} lines`
  const projects = listProjects()
  const voice = MODELS.filter((m) => existsSync(join(app.getPath('userData'), 'voice', m.file, '.ready'))).map((m) => m.label)
  return redact([
    'Mira Terminal diagnostics',
    `Made ${new Date().toISOString()}`,
    '',
    `Mira ${app.getVersion()}, Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, Node ${process.versions.node}`,
    `${process.platform} ${release()} ${process.arch}, ${app.getLocale()}, ${app.isPackaged ? 'installed' : 'development'}`,
    `Projects ${projects.length}, trusted ${projects.filter((p) => p.trusted).length}, terminals open ${openTerminals()}`,
    `Voice models ${voice.join(', ') || 'none'}`,
    '',
    'Settings',
    JSON.stringify(s, null, 2),
    '',
    `Recent errors (${errors.length})`,
    ...(errors.length ? errors : ['none'])
  ].join('\n'))
}

export function registerDiagnostics(): void {
  process.on('uncaughtException', (e) => keep(`main: ${e.stack ?? e.message}`))
  process.on('unhandledRejection', (e) => keep(`main: ${e instanceof Error ? e.stack ?? e.message : String(e)}`))
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (ev) => { const m = ev as unknown as { level: string | number; message: string }; if (m.level === 'error' || m.level === 3) keep(`page: ${m.message}`) })
    wc.on('render-process-gone', (_ev, d) => keep(`page gone: ${d.reason}`))
  })
  ipcMain.handle('app:diagnostics', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const day = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('desktop'), `mira-diagnostics-${day}.txt`), filters: [{ name: 'Text', extensions: ['txt'] }] })
    if (r.canceled || !r.filePath) return ''
    writeFileSync(r.filePath, report())
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })
}
