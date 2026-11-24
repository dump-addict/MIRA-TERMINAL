/* Keep the computer awake : off, while an agent tab is open, or always (the screen may still turn off) */
import { ipcMain, powerSaveBlocker } from 'electron'

let id: number | null = null
const set = (on: boolean) => {
  if (on && id === null) id = powerSaveBlocker.start('prevent-app-suspension')
  if (!on && id !== null) { powerSaveBlocker.stop(id); id = null }
}

export function registerAwake(): void {
  // the page says what it wants ; only the main process holds the lock
  ipcMain.handle('awake:set', (_e, on: boolean) => { set(!!on); return id !== null })
}
export function releaseAwake(): void { set(false) }
