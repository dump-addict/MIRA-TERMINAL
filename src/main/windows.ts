/* Windows : Mira can have several, like a browser. The first one is the main window : it restores and saves the session ;
   the others start empty and keep their tabs only while they are open. */
import { BrowserWindow } from 'electron'

let main: number | null = null   // webContents id of the main window
export const isMainWindow = (id: number): boolean => main === id
export function trackWindow(win: BrowserWindow): void {
  const id = win.webContents.id
  if (main === null) main = id
  win.on('closed', () => {
    if (main !== id) return
    // the main window closed : the oldest window left takes its place (and from now on saves the session)
    main = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())?.webContents.id ?? null
  })
}
// the window the user is in, else any
export const frontWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
