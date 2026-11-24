/* Status bar : the local servers that listen on a port, with open, copy and stop */
import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, Plug, Smartphone, Square } from 'lucide-react'

type Port = Awaited<ReturnType<typeof window.mira.ports.list>>[number]

/* what to add so a server listens beyond this computer, by the program that runs it */
const hostHint = (cmd: string) =>
  /python/i.test(cmd) ? 'Start it with --host 0.0.0.0 (Flask, Uvicorn) or --bind 0.0.0.0 (http.server).'
    : /ruby|rails|puma/i.test(cmd) ? 'Start it with -b 0.0.0.0.'
      : 'Start it with --host (Vite, Astro, Nuxt), -H 0.0.0.0 (Next.js) or HOST=0.0.0.0.'

/* the phone panel : the Wi-Fi address and its QR code, or why a phone cannot reach the server */
function Phone({ p }: { p: Port }) {
  const [r, setR] = useState<{ url: string; qr: string } | null | undefined>(undefined)
  useEffect(() => { if (p.lan) void window.mira.ports.phone(p.port).then(setR) }, [p.port, p.lan])
  if (!p.lan) return <div className="px-2.5 pb-3 text-meta text-text-2">Only this computer can open it. {hostHint(p.command)}</div>
  if (r === undefined) return null
  if (!r) return <div className="px-2.5 pb-3 text-meta text-text-2">This Mac is not on a network.</div>
  return (
    <div className="flex items-center gap-4 px-2.5 pb-3">
      <img src={r.qr} alt="" className="h-32 w-32 shrink-0 rounded-sm bg-white p-1" />
      <div className="min-w-0 text-meta text-text-2">
        <div className="font-mono text-body text-text">{r.url.replace('http://', '')}</div>
        <div className="mt-1">Scan it with a phone on the same Wi-Fi.</div>
        <button onClick={() => void navigator.clipboard.writeText(r.url)} className="mt-2 text-text-3 hover:text-text">Copy address</button>
      </div>
    </div>
  )
}

export function PortsMeter() {
  const [list, setList] = useState<Port[]>([])
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const [phone, setPhone] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const load = () => void window.mira.ports.list().then(setList)
  // checked every 15 s, every 3 s while the list is open
  useEffect(() => { load(); const t = setInterval(load, open ? 3000 : 15000); return () => clearInterval(t) }, [open])
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setAsk(null) } }
    window.addEventListener('mousedown', out)
    return () => window.removeEventListener('mousedown', out)
  }, [open])
  const url = (p: Port) => `http://localhost:${p.port}`
  const icon = 'grid h-6 w-6 place-items-center rounded-xs text-text-3 hover:bg-surface-2 hover:text-text'
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Open ports" className={`flex items-center gap-1.5 hover:text-text ${open || list.some((p) => p.mine) ? 'text-text' : ''}`}>
        <Plug size={12} /><span className="tnum">{(() => { const n = list.filter((p) => p.mine).length; return `${n} ${n === 1 ? 'server' : 'servers'}` })()}</span>
      </button>
      {open && (
        <div className="absolute right-0 bottom-7 z-30 w-96 rounded-md border border-line-strong bg-bg p-1 text-body shadow-[var(--mira-shadow-float)]">
          <div className="flex items-center px-2.5 pt-2 pb-1">
            <span className="mira-label">Open ports</span>
            <button onClick={() => setAll((v) => !v)} className="ml-auto text-meta text-text-3 hover:text-text">
              {all ? `Only your servers (${list.filter((p) => p.mine).length})` : `Show all (${list.length})`}
            </button>
          </div>
          {!list.some((p) => all || p.mine) && <div className="px-2.5 py-2 text-text-3">No local server running</div>}
          <div className="max-h-96 overflow-y-auto">
          {list.filter((p) => all || p.mine).map((p) => (
            <div key={`${p.pid}:${p.port}`}>
            <div className="group flex h-9 items-center gap-3 rounded-sm px-2.5 hover:bg-surface-1">
              <span className="w-12 font-mono text-text tnum">{p.port}</span>
              <span className="min-w-0 flex-1 truncate text-text-2" title={`${p.host}:${p.port}  ${p.cwd}`}>{p.command}<span className="text-text-3">{`  ${p.project ?? (p.mine ? p.cwd.split('/').filter(Boolean).pop() ?? '' : p.host)}`}</span></span>
              {ask === p.pid ? (
                <span className="flex items-center gap-1 text-meta">
                  <button onClick={() => void window.mira.ports.stop(p.pid).then(() => { setAsk(null); setTimeout(load, 500) })} className="h-6 rounded-xs bg-bad px-2 text-accent-text">Stop</button>
                  <button onClick={() => setAsk(null)} className="h-6 rounded-xs px-2 text-text-2 hover:text-text">Cancel</button>
                </span>
              ) : (
                <span className="flex items-center opacity-0 group-hover:opacity-100">
                  <button title="Open in browser" className={icon} onClick={() => window.open(url(p))}><ExternalLink size={13} /></button>
                  <button title="Copy address" className={icon} onClick={() => void navigator.clipboard.writeText(url(p))}><Copy size={13} /></button>
                  <button title="Open on your phone" className={`${icon} ${phone === `${p.pid}:${p.port}` ? 'bg-surface-2 text-text' : ''}`} onClick={() => setPhone((v) => (v === `${p.pid}:${p.port}` ? null : `${p.pid}:${p.port}`))}><Smartphone size={13} /></button>
                  {p.mine && <button title="Stop this server" className={icon} onClick={() => setAsk(p.pid)}><Square size={12} /></button>}
                </span>
              )}
            </div>
            {phone === `${p.pid}:${p.port}` && <Phone p={p} />}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
