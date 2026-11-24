/* Network : Mira's own proxy and HTTP/1.1 mode, and a check that the services agents need answer */
import { app, ipcMain, net, session } from 'electron'
import { getSettings, type Settings } from './settings'

const CHECKS = [
  { name: 'GitHub', host: 'https://github.com' },
  { name: 'Anthropic API', host: 'https://api.anthropic.com' },
  { name: 'Claude', host: 'https://claude.ai' },
  { name: 'OpenAI', host: 'https://chatgpt.com' },
  { name: 'npm', host: 'https://registry.npmjs.org' },
  { name: 'PyPI', host: 'https://pypi.org' }
]

export async function applyNetwork(s: Settings): Promise<void> {
  await session.defaultSession.setProxy(s.proxyUrl ? { proxyRules: s.proxyUrl, proxyBypassRules: s.noProxy } : { mode: 'system' })
}

/* before the app is ready : HTTP/2 off for proxies that break it (takes effect at the next launch) */
export function earlyNetwork(): void {
  try { if (getSettings().http1) app.commandLine.appendSwitch('disable-http2') } catch { /* first run */ }
}

export function registerNetwork(): void {
  void applyNetwork(getSettings())
  ipcMain.handle('net:check', () => Promise.all(CHECKS.map(async (c) => {
    const t0 = Date.now()
    try {
      const r = await net.fetch(c.host, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
      return { ...c, ok: r.status < 500, ms: Date.now() - t0, detail: `HTTP ${r.status}` }
    } catch (e) {
      return { ...c, ok: false, ms: Date.now() - t0, detail: (e as Error).name === 'TimeoutError' ? 'No answer in 8 s' : 'Unreachable' }
    }
  })))
}
