/* Agents : their marks, the "+" menu that opens a terminal or an agent, the usage meters of the status bar */
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw, FilePlus, Map as MapIcon, Plus, SquareTerminal } from 'lucide-react'
import { Label, ICON } from './ui'
import geminiPng from './assets/agents/gemini.png'
import cursorPng from './assets/agents/cursor.png'
import type { AgentInfo, AgentUsage } from '../../preload'
import { useSettings } from './settings'
import { kbd } from './platform'

/* the agents' own logos */
const CLAUDE = 'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'
const OPENAI = 'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z'
const COPILOT = ['M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z', 'M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z']
const GROK = 'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815'
export function AgentIcon({ id, size = ICON }: { id: string; size?: number }) {
  const s = { width: size, height: size, flex: 'none' as const, display: 'block' }
  if (id === 'claude') return <svg viewBox="0 0 24 24" style={s}><path d={CLAUDE} fill="var(--mira-agent-claude)" fillRule="nonzero" /></svg>
  // the white logos stay white, whatever the grey of the text around them
  if (id === 'codex') return <svg viewBox="0 0 24 24" style={s} fill="var(--mira-text)" fillRule="evenodd"><path d={OPENAI} /></svg>
  if (id === 'gemini') return <img src={geminiPng} alt="" style={s} />
  if (id === 'cursor') return <img src={cursorPng} alt="" style={s} />
  if (id === 'copilot') return <svg viewBox="0 0 16 16" style={s} fill="var(--mira-text)">{COPILOT.map((d) => <path key={d.slice(0, 12)} d={d} />)}</svg>
  if (id === 'grok') return <svg viewBox="0 0 24 24" style={s} fill="var(--mira-text)" fillRule="evenodd"><path d={GROK} /></svg>
  return <SquareTerminal size={size} />
}

let agentsCache: Promise<AgentInfo[]> | null = null
export const listAgents = () => (agentsCache ??= window.mira.agents.list())
// after an install : look again for what is on this computer
export const refreshAgents = () => { agentsCache = null; return listAgents() }

/* the "+" menu : search, quick kinds (terminal, markdown, map), then the agents */
export type MenuTab = { key: number; title: string }
export function NewMenu({ onClose, onTerminal, onAgent, onNote, onMap, onAddAgent, tabs, onTab }: {
  onAddAgent: () => void; onClose: () => void; onTerminal: () => void; onAgent: (a: AgentInfo) => void; onNote: () => void; onMap?: () => void
  tabs: MenuTab[]; onTab: (key: number) => void
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  // no search box for now : the menu is short ; Esc closes it
  const q = ''
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { void listAgents().then(setAgents) }, [])
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    setTimeout(() => window.addEventListener('mousedown', out))
    return () => window.removeEventListener('mousedown', out)
  }, [onClose])

  type Item = { id: string; label: string; icon: React.ReactNode; hint?: string; off?: boolean; run: () => void }
  const kinds: Item[] = [
    { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={16} />, hint: kbd('⌘T'), run: onTerminal },
    { id: 'markdown', label: 'Markdown', icon: <FilePlus size={16} />, run: onNote },
    ...(onMap ? [{ id: 'map', label: 'Map', icon: <MapIcon size={16} />, hint: kbd('⌘1'), run: onMap }] : [])
  ]
  const st = useSettings()
  // the default agent first
  const shown = agents.filter((a) => a.installed && st?.agents[a.id]?.show !== false).sort((a, b) => Number(b.id === st?.defaultAgent) - Number(a.id === st?.defaultAgent))
  const missing = agents.filter((a) => !a.installed)
  const ql = q.trim().toLowerCase()
  const list: Item[] = ql ? [
    ...tabs.filter((t) => t.title.toLowerCase().includes(ql)).map((t) => ({ id: `tab${t.key}`, label: t.title, icon: <ArrowRight size={ICON} />, hint: 'Open tab', run: () => onTab(t.key) })),
    ...kinds.filter((k) => k.label.toLowerCase().includes(ql)).map((k) => ({ ...k, icon: <span className="scale-[.875]">{k.icon}</span>, hint: k.hint ?? 'New' })),
    ...agents.filter((a) => a.label.toLowerCase().includes(ql) || a.cmd.includes(ql)).map((a) => ({ id: a.id, label: a.label, icon: <AgentIcon id={a.id} />, off: !a.installed, hint: a.installed ? undefined : 'Not installed', run: () => onAgent(a) }))
  ] : shown.map((a, i) => ({ id: a.id, label: a.label, icon: <AgentIcon id={a.id} />, hint: kbd(`⌘⇧${agents.indexOf(a) + 1}`), run: () => onAgent(a) }))
  const live = list.filter((x) => !x.off)
  const pick = (x?: Item) => { if (x && !x.off) { x.run(); onClose() } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(live.length - 1, s + 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
      if (e.key === 'Enter') { e.preventDefault(); pick(live[sel]) }
    }
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true)
  })

  const row = 'flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body text-text disabled:text-text-3'
  return (
    <div ref={ref} className="nodrag absolute top-10 z-30 w-72 overflow-hidden rounded-md border border-line-strong bg-bg shadow-[var(--mira-shadow-float)]">
      {!ql && (
        <div className="flex items-center gap-1 border-b border-line p-1.5">
          {kinds.map((k) => (
            <button key={k.id} onClick={() => pick(k)} title={k.hint ? `${k.label} (${k.hint})` : k.label}
              className="flex h-9 flex-1 flex-col items-center justify-center rounded-sm text-text-2 hover:bg-surface-2 hover:text-text">{k.icon}</button>
          ))}
        </div>
      )}
      <div className="max-h-80 overflow-y-auto p-1">
        {!ql && <Label className="block px-2 pt-1 pb-1">Agents</Label>}
        {list.map((x) => {
          const on = !x.off && live[sel]?.id === x.id
          return (
            <button key={x.id} disabled={x.off} onMouseEnter={() => !x.off && setSel(live.indexOf(x))} onClick={() => pick(x)}
              className={`${row} ${on ? 'bg-surface-2' : ''}`}>
              <span className={x.off ? 'opacity-40' : 'text-text-2'}>{x.icon}</span>
              <span className="truncate">{x.label}</span>
              {x.hint && <span className="ml-auto shrink-0 text-meta text-text-3">{x.hint}</span>}
            </button>
          )
        })}
        {!ql && !shown.length && <div className="px-2 py-1.5 text-body text-text-3">No agent found</div>}
        {/* the agents not on this computer yet : installed from Settings, Agents */}
        {!ql && missing.length > 0 && <button onClick={() => { onAddAgent(); onClose() }} className={`${row} text-text-2 hover:bg-surface-2 hover:text-text`}>
          <span className="text-text-2"><Plus size={16} /></span><span className="truncate">Add an agent</span>
        </button>}
        {ql && !list.length && <div className="px-2 py-1.5 text-body text-text-3">No match</div>}
      </div>
    </div>
  )
}

const left = (t: number | null) => {
  if (!t) return ''
  const m = Math.max(0, Math.round((t - Date.now()) / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}
const tone = (p: number) => (p >= 95 ? 'text-bad' : p >= 80 ? 'text-warn' : 'text-text-2')
const NAMES: Record<string, string> = { claude: 'Claude', codex: 'Codex' }

/* status bar meters : for each signed-in agent, how much of the limit is used and how long until it resets, kept live */
export function UsageMeters() {
  const st = useSettings()
  const [list, setList] = useState<AgentUsage[]>([])
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const load = (force = false) => { setBusy(true); void window.mira.agents.usage(force).then((l) => { setList(l); setBusy(false) }) }
  useEffect(() => {
    load()
    const poll = setInterval(() => load(true), 60_000)       // usage asked again every minute
    const clock = setInterval(() => tick((x) => x + 1), 60_000) // the tooltips' countdowns move on their own
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [])
  if (st && !st.usageMeters) return null
  return (
    <span className="flex items-center gap-3">
      {!list.length && !busy && <span>No agent signed in</span>}
      {list.map((u) => {
        // the tightest limit is the one that matters : session or week, whichever is closer to full
        const w = [u.session, u.weekly].filter(Boolean).sort((a, b) => b!.used - a!.used)[0]
        if (!w) return null
        const left_ = st?.usageAs === 'left'
        const tip = [u.session && `Session ${Math.round(u.session.used)}% used, resets in ${left(u.session.resetsAt)}`,
          u.weekly && `Week ${Math.round(u.weekly.used)}% used, resets in ${left(u.weekly.resetsAt)}`].filter(Boolean).join('\n')
        return (
          <span key={u.id} title={`${NAMES[u.id] ?? u.id}\n${tip}`} className="flex items-center gap-1.5">
            <AgentIcon id={u.id} size={12} />
            {/* a small bar and the percentage ; when it resets is in the tooltip */}
            <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-text-2" style={{ width: `${Math.max(4, Math.min(100, left_ ? 100 - w.used : w.used))}%` }} />
            </span>
            <span className={`tnum ${tone(w.used)}`}>{left_ ? `${Math.max(0, 100 - Math.round(w.used))}% left` : `${Math.round(w.used)}%`}</span>
          </span>
        )
      })}
      <button onClick={() => load(true)} title="Refresh usage" className="grid h-5 w-5 place-items-center rounded-xs hover:bg-surface-2 hover:text-text">
        <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
      </button>
    </span>
  )
}
