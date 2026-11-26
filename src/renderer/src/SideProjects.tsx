/* The sidebar's projects and their open tabs, joined to their project by thin rounded lines.
   No small status icons : what an agent does is said by the tab's own text (amber : waits for you, bold : finished unseen, breathing : working). */
import { useEffect, useRef, useState } from 'react'
import { useSettings } from './settings'
import { FolderGit2, FolderOpen, ListTodo, X } from 'lucide-react'
import type { Peek } from './peek'
import type { ProjectInfo } from '../../preload'

export type SideTab = { key: number; title: string; projectId?: string; agent?: string; live?: string; block?: unknown; file?: string; note?: string; dirty?: boolean; status?: 'working' | 'needs' | 'done'; seen?: boolean; since?: number }

// the order of a project's tabs : agents, parts of the map, terminals, then files and notes
const rank = (t: SideTab) => t.agent ? 0 : t.block ? 1 : t.file || t.note ? 3 : 2
// what the agent in a tab is doing, in one word
const stateOf = (t: SideTab): 'needs' | 'unread' | 'working' | null => t.status === 'needs' ? 'needs' : t.status === 'done' && !t.seen ? 'unread' : t.status === 'working' ? 'working' : null
// its class : the marks themselves are in styles.css, chosen in Settings › Appearance
export const stClass = (s: ReturnType<typeof stateOf>) => (s === 'needs' ? 'st-need' : s === 'unread' ? 'st-done' : s === 'working' ? 'st-work' : '')
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
/* the worst state of a project's tabs, for its icon in the narrow sidebar */
export const projectState = (tabs: SideTab[]) => { const l = tabs.map(stateOf); return l.includes('needs') ? 'needs' : l.includes('working') ? 'working' : l.includes('unread') ? 'unread' : null }

export function SideProjects({ icons, projects, tabs, current, active, onScreen, page, collapsed, onToggle, onOpen, onTab, onClose, icon, tip, openCount, onTasks, peek, onMove, onRemove }: {
  icons: Record<string, string>; projects: ProjectInfo[]; tabs: SideTab[]; current?: string; active: number; onScreen: Set<number>; page: boolean
  collapsed: Set<string>; onToggle: (id: string) => void; onOpen: (p: ProjectInfo) => void; onTab: (p: ProjectInfo, key: number) => void; onClose: (key: number) => void
  icon: (t: SideTab) => React.ReactNode; tip: (t: SideTab) => string; openCount: (id: string) => number; onTasks: (id: string) => void
  peek: (t: SideTab) => Peek | null
  onMove: (id: string, to: string, before: boolean) => void
  onRemove: (p: ProjectInfo) => void
}) {
  // the card shown beside an agent's tab after a short hover : what it last said, or what it asks you
  const st = useSettings()
  // the working time ticks once a second, only when it is shown
  const [, tick] = useState(0)
  const timer = st?.tabWorking === 'timer' && tabs.some((t) => t.status === 'working')
  useEffect(() => { if (!timer) return; const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i) }, [timer])
  const [card, setCard] = useState<{ t: SideTab; top: number; left: number; p: Peek | null } | null>(null)
  const wait = useRef(0)
  const enter = (t: SideTab, el: HTMLElement) => {
    if (!t.agent && !t.live) return
    clearTimeout(wait.current)
    wait.current = window.setTimeout(() => { const r = el.getBoundingClientRect(); setCard({ t, top: r.top, left: r.right + 8, p: peek(t) }) }, 450)
  }
  const leave = () => { clearTimeout(wait.current); setCard(null) }
  // dragging a project's row to another place : a thin line shows where it lands
  const [drag, setDrag] = useState<string | null>(null)
  const [mark, setMark] = useState<{ id: string; before: boolean } | null>(null)
  const MIME = 'application/x-mira-project'
  return (
    <>
      {card && <HoverCard {...card} />}
      {projects.map((p) => {
        const own = tabs.filter((t) => t.projectId === p.id).sort((a, b) => rank(a) - rank(b))
        const shut = collapsed.has(p.id)
        const here = current === p.id
        const waits = own.some((t) => stateOf(t) === 'needs')
        const n = openCount(p.id)
        return (
          <div key={p.id} className={`group/p relative mb-0.5 ${drag === p.id ? 'opacity-40' : ''}`}>
            {mark?.id === p.id && <i className={`pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-text ${mark.before ? '-top-px' : '-bottom-px'}`} />}
            <div onClick={() => onOpen(p)} title={p.path} draggable
              onDragStart={(e) => { e.dataTransfer.setData(MIME, p.id); e.dataTransfer.effectAllowed = 'move'; setDrag(p.id) }}
              onDragEnd={() => { setDrag(null); setMark(null) }}
              onDragOver={(e) => { if (!e.dataTransfer.types.includes(MIME)) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2; setMark((m) => (m?.id === p.id && m.before === before ? m : { id: p.id, before })) }}
              onDragLeave={() => setMark((m) => (m?.id === p.id ? null : m))}
              onDrop={(e) => { const id = e.dataTransfer.getData(MIME); if (!id) return; e.preventDefault(); if (mark) onMove(id, p.id, mark.before); setDrag(null); setMark(null) }}
              className={`flex h-8 cursor-default items-center gap-2 rounded-sm pr-2 pl-2 text-body ${here && !page ? 'bg-surface-2' : 'hover:bg-surface-1'}`}>
              {/* the project's own icon when it has one, else a folder */}
              <span className="shrink-0 text-text-2">{icons[p.id] ? <img src={icons[p.id]} alt="" className="h-4 w-4 rounded-[3px] object-contain" /> : p.git ? <FolderGit2 size={15} /> : <FolderOpen size={15} />}</span>
              <span className={`min-w-0 truncate ${shut && waits ? 'text-warn' : 'text-text'}`}>{p.name}</span>
              {/* the small filled arrow after the name, like the section's title : shows or hides its tabs */}
              {own.length > 0 ? <button onClick={(e) => { e.stopPropagation(); onToggle(p.id) }} title={shut ? 'Show its tabs' : 'Hide its tabs'}
                className="grid h-5 w-4 shrink-0 place-items-center text-text-3 hover:text-text">
                <svg width="8" height="8" viewBox="0 0 8 8" className={`transition-transform ${shut ? '-rotate-90' : ''}`} aria-hidden><path d="M1 2.2h6L4 6.2z" fill="currentColor" /></svg>
              </button> : null}
              <span className="flex-1" />
              {n > 0 && <span role="button" title="Open tasks" onClick={(e) => { e.stopPropagation(); onTasks(p.id) }}
                className="flex shrink-0 items-center gap-1 text-meta text-text tnum group-hover/p:hidden"><ListTodo size={11} />{n}</span>}
              {/* out of the list (the folder stays on disk) : shown on hover, in place of the tasks count */}
              <button onClick={(e) => { e.stopPropagation(); onRemove(p) }} title="Remove from the list (the folder stays on disk)"
                className="hidden h-4 w-4 shrink-0 place-items-center rounded-xs text-text-3 hover:bg-surface-3 hover:text-text group-hover/p:grid"><X size={12} /></button>
            </div>
            {!shut && own.length > 0 && (
              <div className="relative ml-[15px]">
                {own.map((t, i) => {
                  const s = stateOf(t)
                  const on = here && !page && t.key === active
                  const last = i === own.length - 1
                  return (
                    <div key={t.key} className="group/t relative pl-3.5">
                      {/* soft rounded elbows, in the strong line colour : the faint one disappears on the light theme's #fafafa sidebar */}
                      {!last && <i className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-line-strong" />}
                      <i className="pointer-events-none absolute top-0 left-0 h-1/2 w-2.5 rounded-bl-md border-b border-l border-line-strong" />
                      <div onClick={() => { leave(); onTab(p, t.key) }} title={t.agent || t.live ? undefined : tip(t)} onMouseEnter={(e) => enter(t, e.currentTarget)} onMouseLeave={leave}
                        className={`mira-row flex h-7 cursor-default items-center gap-2 rounded-sm pr-7 pl-1.5 text-body ${stClass(s)} ${on ? 'bg-surface-1' : 'hover:bg-surface-1'}`}>
                        <span className="mira-ic h-4 w-4 shrink-0 text-text-2">{icon(t)}</span>
                        <span className={`mira-nm min-w-0 flex-1 truncate ${on || (here && onScreen.has(t.key)) ? 'text-text' : 'text-text-2'}`}>
                          {t.dirty ? `${t.title} •` : t.title}
                        </span>
                        {s === 'working' && st?.tabWorking === 'timer' && t.since ? <span className="shrink-0 text-meta text-text-2 tnum">{clock(Date.now() - t.since)}</span> : null}
                        {s === 'unread' && st?.tabDone === 'word' ? <span className="shrink-0 text-meta text-text">Done</span> : null}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onClose(t.key) }} title="Close"
                        className="absolute top-1/2 right-1.5 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-xs text-text-3 opacity-0 hover:bg-surface-3 hover:text-text group-hover/t:opacity-100"><X size={12} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function HoverCard({ t, top, left, p }: { t: SideTab; top: number; left: number; p: Peek | null }) {
  const s = stateOf(t)
  const label = p?.questions ? 'Asked' : s === 'needs' ? 'Waiting for you' : s === 'working' ? 'Working' : s === 'unread' ? 'Finished' : ''
  const foot = p?.questions ? `${p.questions} ${p.questions > 1 ? 'questions' : 'question'}, open to answer` : s === 'needs' ? 'Open to answer' : null
  return (
    <div style={{ top: Math.min(top, window.innerHeight - 180), left }} className="pointer-events-none fixed z-50 w-80 rounded-lg border border-line-strong bg-surface-2 px-3.5 py-3 shadow-[var(--mira-shadow-float)]">
      <div className="truncate text-body font-medium text-text">{t.title}</div>
      {p?.text
        ? <div className="mt-1.5 line-clamp-4 text-body whitespace-pre-line text-text">{label && <span className={s === 'needs' || p.questions ? 'text-warn' : 'text-text-3'}>{label} </span>}{p.text}</div>
        : <div className="mt-1.5 text-body text-text-3">{label || 'No message yet'}</div>}
      {foot && <div className="mt-2 text-meta text-text-3">{foot}</div>}
    </div>
  )
}
