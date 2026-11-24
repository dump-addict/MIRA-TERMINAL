/* The message box under an agent's terminal : files picked in a dialog, images pasted (kept in a temporary folder so the agent can read them) */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp']

export function registerComposer(): void {
  ipcMain.handle('composer:pick', async (e, cwd?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { title: 'Add files', defaultPath: typeof cwd === 'string' ? cwd : undefined, properties: ['openFile', 'openDirectory', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  // a screenshot of part of the screen (macOS's own selection) : the file, or nothing if cancelled
  ipcMain.handle('composer:screenshot', () => new Promise<string>((res) => {
    const dir = join(tmpdir(), 'mira-paste'); mkdirSync(dir, { recursive: true })
    const f = join(dir, `screenshot-${Date.now().toString(36)}.png`)
    // macOS's own area selection ; on Linux the GNOME tool if present ; Windows has no command line one (paste instead)
    if (process.platform === 'darwin') execFile('/usr/sbin/screencapture', ['-i', '-x', f], () => res(existsSync(f) ? f : ''))
    else if (process.platform === 'linux') execFile('gnome-screenshot', ['-a', '-f', f], () => res(existsSync(f) ? f : ''))
    else res('')
  }))
  // a pasted image : written once, under the system's temporary folder, never anywhere else
  ipcMain.handle('composer:image', (_e, data: Uint8Array, ext: string) => {
    if (!(data instanceof Uint8Array) || data.byteLength > 20_000_000) return ''
    const x = EXT.includes(String(ext).toLowerCase()) ? String(ext).toLowerCase() : 'png'
    const dir = join(tmpdir(), 'mira-paste')
    mkdirSync(dir, { recursive: true })
    const f = join(dir, `image-${Date.now().toString(36)}.${x}`)
    writeFileSync(f, data)
    return f
  })
}
