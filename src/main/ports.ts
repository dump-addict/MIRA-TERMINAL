import { sep } from 'node:path'
/* Open ports : the local servers you started (dev servers, APIs, databases), found with lsof */
import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { homedir, networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import { listProjects } from './projects'
import { mapServerPids } from './mapserver'

// mine : a server you started from one of your folders (or an ssh tunnel) ; the others are apps and system services
// lan : it listens on every interface, so a phone on the same Wi-Fi can reach it
export type Port = { port: number; pid: number; command: string; host: string; cwd: string; project: string | null; mine: boolean; lan: boolean }

const exec = (file: string, args: string[]) =>
  new Promise<string>((res) => execFile(file, args, { timeout: 4000, maxBuffer: 4 << 20, windowsHide: true }, (_e, out) => res(String(out ?? ''))))
const lsof = (args: string[]) => exec(process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof', args)

/* Windows has no lsof : netstat gives the listening ports and their process, tasklist the process names (the folder a
   server was started in is not known there, so its project is not either) */
async function windowsListeners(): Promise<string> {
  const [net, tasks] = await Promise.all([exec('netstat', ['-ano']), exec('tasklist', ['/FO', 'CSV', '/NH'])])
  const names = new Map<string, string>()
  for (const l of tasks.split(/\r?\n/)) { const m = l.match(/^"([^"]+)","(\d+)"/); if (m) names.set(m[2], m[1].replace(/\.exe$/i, '')) }
  // the same lines lsof -F pcn prints : p<pid>, c<command>, n<host>:<port>
  const out: string[] = []
  for (const l of net.split(/\r?\n/)) {
    // the state word is translated on non-English Windows : a listening socket is the one with no remote end
    const m = l.trim().match(/^TCP\s+(\S+):(\d+)\s+(?:0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)$/i)
    if (m) out.push(`p${m[3]}`, `c${names.get(m[3]) ?? 'process'}`, `n${m[1] === '0.0.0.0' || m[1] === '[::]' ? '*' : m[1]}:${m[2]}`)
  }
  return out.join('\n')
}

// apps that listen for their own reasons : not servers you started
const NOISE = /^(ControlCe|rapportd|figma_age|ClickUp|Electron|Google|Slack|Discord|Spotify|Dropbox|Notion|Raycast|com\.apple|sharingd|launchd|identitys|Cursor Hel|Code Help|WhatsApp|Telegram|zoom|Adobe|Creative|1Password|Figma|Arc|Brave|Safari|Mira)/i

export async function listPorts(): Promise<Port[]> {
  const out = process.platform === 'win32' ? await windowsListeners() : await lsof(['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'])
  const found = new Map<string, { port: number; pid: number; command: string; host: string; lan: boolean }>()
  let pid = 0, command = ''
  for (const l of out.split('\n')) {
    if (l[0] === 'p') pid = Number(l.slice(1))
    else if (l[0] === 'c') command = l.slice(1)
    else if (l[0] === 'n') {
      const m = l.slice(1).match(/^(.*):(\d+)$/)
      // a bare version number is an agent's own process (Claude Code names itself so) : stopping it would end a session
      if (!m) continue
      // the same server on 127.0.0.1 and [::1] is one line
      const port = Number(m[2])
      const lan = m[1] === '*' || m[1] === '0.0.0.0' || m[1] === '[::]' || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(m[1])
      const had = found.get(`${pid}:${port}`)
      if (!had) found.set(`${pid}:${port}`, { port, pid, command, host: lan ? 'all interfaces' : m[1], lan })
      else if (lan) { had.lan = true; had.host = 'all interfaces' }
    }
  }
  const pids = [...new Set([...found.values()].map((x) => x.pid))]
  // where each server was started : tells which project it belongs to
  const cwds = new Map<number, string>()
  if (pids.length && process.platform !== 'win32') {
    const c = await lsof(['-a', '-d', 'cwd', '-p', pids.join(','), '-F', 'pn'])
    let p = 0
    for (const l of c.split('\n')) { if (l[0] === 'p') p = Number(l.slice(1)); else if (l[0] === 'n') cwds.set(p, l.slice(1)) }
  }
  const projects = listProjects()
  const home = homedir()
  return [...found.values()]
    .map((x) => {
      const cwd = cwds.get(x.pid) ?? ''
      const pr = projects.find((p) => cwd === p.path || cwd.startsWith(p.path + sep))
      // an agent's own process names itself with a bare version number (Claude Code does) : stopping it would end a session
      const internal = NOISE.test(x.command) || /^\d+\.\d+\.\d+$/.test(x.command) || x.pid === process.pid || mapServerPids().includes(x.pid)
      // Windows does not tell the folder a server runs in : any listener that is not a known app counts as the user's
      const mine = !internal && (!!pr || x.command === 'ssh' || (cwd.startsWith(home) && cwd !== home) || (process.platform === 'win32' && !x.lan))
      return { ...x, cwd, project: pr?.name ?? null, mine }
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(!!b.project) - Number(!!a.project) || a.port - b.port)
}

/* this Mac's address on the Wi-Fi or the cable (en0 first) */
function lanAddress(): string | null {
  const all = networkInterfaces()
  for (const name of ['en0', 'en1', ...Object.keys(all)]) for (const a of all[name] ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address
  return null
}

export function registerPorts(): void {
  ipcMain.handle('ports:list', () => listPorts())
  // a phone on the same network opens the server with this address ; the QR code is drawn here, on this Mac
  ipcMain.handle('ports:phone', async (_e, port: number) => {
    const ip = lanAddress()
    if (!ip || !Number.isInteger(port) || port < 1 || port > 65535) return null
    const url = `http://${ip}:${port}`
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    return { url, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
  })
  // stop a server : only one that is still listed (started by you, from your folders)
  ipcMain.handle('ports:stop', async (_e, pid: number) => {
    if (!(await listPorts()).some((p) => p.pid === pid && p.mine)) return false
    try { process.kill(pid, 'SIGTERM'); return true } catch { return false }
  })
}
