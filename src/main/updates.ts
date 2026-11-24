/* Updates : the installed app looks for a newer release on GitHub (latest-mac.yml, written by electron-builder),
   downloads it in the background and installs it the next time Mira quits. Only in a packaged build ;
   on macOS this needs a signed app, so an unsigned build simply stays on its version. */
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

const EVERY = 4 * 60 * 60 * 1000

export function registerUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // a failed check (offline, unsigned build, no release yet) is not worth telling the user about
  autoUpdater.on('error', (e) => console.warn('update check failed:', e?.message ?? e))
  const check = () => { autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn('update check failed:', e?.message ?? e)) }
  setTimeout(check, 15_000)
  setInterval(check, EVERY)
}
