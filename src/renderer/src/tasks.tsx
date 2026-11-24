/* Tasks : the pieces the To-do page is made of (status and priority marks, menus, a task's row).
   A project's tasks live in the project itself (.miraterminal/tasks.json). */
import { useEffect, useRef, useState } from 'react'
import { Boxes, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, CircleDot, Copy, Flag, GitBranch, Trash2, UserRound, X } from 'lucide-react'
import type { Task, TaskStatus } from '../../preload'
import { KindIcon, StatusIcon } from './kinds'
import { AgentIcon } from './agents'
import { ICON, IconButton, PrimaryButton, SecondaryButton } from './ui'

export type Part = { id: string; label: string; kind: string }

export const STATUS: { id: TaskStatus; label: string }[] = [
  { id: 'progress', label: 'In progress' }, { id: 'review', label: 'In review' }, { id: 'todo', label: 'Todo' },
  { id: 'backlog', label: 'Backlog' }, { id: 'done', label: 'Done' }, { id: 'canceled', label: 'Canceled' }
]
// one colour per status, from the tokens (they follow the theme) : amber at work, violet in review, white to do, grey not planned, green done, red dropped
export const STATUS_COLOR: Record<TaskStatus, string> = {
  progress: 'var(--mira-status-progress)', review: 'var(--mira-status-review)', todo: 'var(--mira-status-todo)',
  backlog: 'var(--mira-status-backlog)', done: 'var(--mira-status-done)', canceled: 'var(--mira-status-canceled)'
}
export const PRIORITY = ['No priority', 'Urgent', 'High', 'Medium', 'Low']
// the priority's colour, from the task palette chosen in Appearance
export const PRIORITY_COLOR = ['transparent', 'var(--mira-priority-1)', 'var(--mira-priority-2)', 'var(--mira-priority-3)', 'var(--mira-priority-4)']
/* the priority as a tinted label : its colour on a faint wash of itself */
export const priorityStyle = (p: number): React.CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${PRIORITY_COLOR[p]} 16%, transparent)`, color: PRIORITY_COLOR[p] })

/* the status as a small circle that fills up, like a progress mark */
export function StatusGlyph({ s, size = 14, color }: { s: TaskStatus; size?: number; color?: string }) {
  const r = 6, c = 7
  const pie = (f: number) => { const a = f * 2 * Math.PI - Math.PI / 2; const x = c + 3.5 * Math.cos(a), y = c + 3.5 * Math.sin(a); return `M${c} ${c} L${c} ${c - 3.5} A3.5 3.5 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y} Z` }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ color: color ?? STATUS_COLOR[s] }} aria-hidden>
      {s === 'backlog' && <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />}
      {(s === 'todo' || s === 'progress' || s === 'review') && <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {s === 'progress' && <path d={pie(0.5)} fill="currentColor" />}
      {s === 'review' && <path d={pie(0.75)} fill="currentColor" />}
      {s === 'done' && <><circle cx={c} cy={c} r={r + 0.5} fill="currentColor" /><path d="M4.3 7.2 6.2 9 9.8 5.2" fill="none" stroke={color ? STATUS_COLOR[s] : 'var(--mira-bg)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
      {s === 'canceled' && <><circle cx={c} cy={c} r={r + 0.5} fill="currentColor" /><path d="M5 5 9 9M9 5 5 9" stroke={color ? STATUS_COLOR[s] : 'var(--mira-bg)'} strokeWidth="1.5" strokeLinecap="round" /></>}
    </svg>
  )
}

/* the priority as bars, urgent as a filled square with a mark */
export function PriorityGlyph({ p, size = 14 }: { p: number; size?: number }) {
  if (p === 1) return <svg width={size} height={size} viewBox="0 0 14 14" style={{ color: PRIORITY_COLOR[1] }} aria-hidden><rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" /><path d="M7 4v3.6M7 9.6v.2" stroke="var(--mira-bg)" strokeWidth="1.7" strokeLinecap="round" /></svg>
  const on = p === 2 ? 3 : p === 3 ? 2 : p === 4 ? 1 : 0
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="text-text-2" style={p ? { color: PRIORITY_COLOR[p] } : undefined} aria-hidden>
      {p === 0 ? <path d="M3 7h1.5M6.25 7h1.5M9.5 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        : [0, 1, 2].map((i) => <rect key={i} x={2 + i * 4} y={9 - i * 3} width="2.4" height={3 + i * 3} rx="0.6" fill="currentColor" opacity={i < on ? 1 : 0.3} />)}
    </svg>
  )
}

/* a small menu of choices, opened from a button */
export function Pick<T extends string | number>({ value, options, onChange, children, title, bare, cell, style }: { value: T; options: { v: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void; children: React.ReactNode; title: string; bare?: boolean
  /* cell : the trigger fills its table cell and shows only what it is given (a filled label, a dash) */ cell?: boolean; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', out); return () => window.removeEventListener('mousedown', out)
  }, [open])
  return (
    <div ref={box} className={`relative ${cell ? 'w-full min-w-0' : ''}`}>
      <button title={title} style={style} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className={cell ? 'flex h-6 w-full min-w-0 items-center gap-1.5 rounded-xs px-2 text-left text-meta whitespace-nowrap hover:ring-1 hover:ring-line-strong' : bare ? 'grid h-6 w-6 place-items-center rounded-xs hover:bg-surface-2' : 'flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2 text-body text-text-2 hover:bg-surface-2 hover:text-text'}>{children}</button>
      {open && (
        <div className="absolute top-8 left-0 z-30 max-h-72 min-w-48 overflow-y-auto rounded-md border border-line-strong bg-bg p-1 shadow-[var(--mira-shadow-float)]">
          {options.map((o) => (
            <button key={String(o.v)} onClick={(e) => { e.stopPropagation(); onChange(o.v); setOpen(false) }}
              className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-body ${o.v === value ? 'bg-surface-2 text-text' : 'text-text hover:bg-surface-1'}`}>
              {o.icon && <span className="shrink-0">{o.icon}</span>}<span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// a git branch name made from the task : opt-3-wallet-connect
export const branchOf = (t: Task) => `${t.id}-${t.title}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
// the task written out for an agent, to paste anywhere
export const promptOf = (t: Task, project: string, part?: Part) => [`Task ${t.id} of ${project}: ${t.title}`, t.description, part && `Part of the project map: ${part.label}`].filter(Boolean).join('\n\n')

export function TaskRow({ t, project, part, open, parts, agent, agentName, tab, onOpen, onSave, onStart, onDelete, onCopy, drag }: {
  t: Task; project: string; part?: Part; open: boolean; parts: Part[]; agent: string; agentName: string
  tab?: { status?: 'working' | 'needs' | 'done'; seen?: boolean }
  onOpen: () => void; onSave: (t: Partial<Task>) => Promise<Task | null>; onStart: () => void; onDelete: () => void; onCopy: (what: string) => void
  drag: { onStart: () => void; onEnd: () => void; onOver: (e: React.DragEvent) => void; onDrop: () => void; mark: boolean }
}) {
  const [title, setTitle] = useState(t.title)
  const [desc, setDesc] = useState(t.description)
  const [ask, setAsk] = useState(false)
  useEffect(() => { setTitle(t.title); setDesc(t.description) }, [t.title, t.description])
  const statusOpts = STATUS.map((x) => ({ v: x.id, label: x.label, icon: <StatusGlyph s={x.id} /> }))
  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); onCopy(what) }
  const closed = t.status === 'done' || t.status === 'canceled'
  return (
    <div className={`rounded-sm ${open ? 'bg-surface-1' : ''}`} style={drag.mark ? { boxShadow: 'inset 0 2px 0 var(--mira-accent)' } : undefined}
      onDragOver={drag.onOver} onDrop={(e) => { e.preventDefault(); drag.onDrop() }}>
      <div onClick={onOpen} draggable={!open} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); drag.onStart() }} onDragEnd={drag.onEnd}
        className={`group flex h-9 cursor-default items-center gap-3 rounded-sm px-3 text-body ${open ? '' : 'hover:bg-surface-1'}`}>
        <span className="w-4 shrink-0 text-text-3">{t.priority > 0 ? <span title={PRIORITY[t.priority]}><PriorityGlyph p={t.priority} /></span> : <span title="No priority"><PriorityGlyph p={0} /></span>}</span>
        <span className="w-14 shrink-0 font-mono text-meta text-text-3">{t.id}</span>
        <span onClick={(e) => e.stopPropagation()} className="-mx-1"><Pick bare title="Status" value={t.status} options={statusOpts} onChange={(v) => void onSave({ id: t.id, status: v })}><StatusGlyph s={t.status} /></Pick></span>
        <span className={`min-w-0 flex-1 truncate ${closed ? 'text-text-3' : 'text-text'}`}>{t.title}</span>
        {part && <span title="Part of the map" className="hidden h-6 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-2 text-meta text-text-2 sm:flex"><KindIcon kind={part.kind} size={12} /><span className="max-w-40 truncate">{part.label}</span></span>}
        {tab && <span title={`${agentName} has a tab on it`} className="flex shrink-0 items-center gap-1 text-text-2"><AgentIcon id={agent} />{tab.status && <StatusIcon status={tab.status} seen={tab.seen} />}</span>}
      </div>
      {open && (
        <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && void onSave({ id: t.id, title })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-8 rounded-sm border border-line bg-bg px-2 text-body text-text outline-none focus:border-line-strong" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== t.description && void onSave({ id: t.id, description: desc })}
            placeholder="Details, steps, what done looks like" rows={4} spellCheck={false}
            className="resize-y rounded-sm border border-line bg-bg px-2 py-1.5 text-body text-text outline-none placeholder:text-text-3 focus:border-line-strong" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Pick title="Status" value={t.status} options={statusOpts} onChange={(v) => void onSave({ id: t.id, status: v })}><StatusGlyph s={t.status} />{STATUS.find((x) => x.id === t.status)?.label}</Pick>
            <Pick title="Priority" value={t.priority} options={PRIORITY.map((l, i) => ({ v: i, label: l, icon: <PriorityGlyph p={i} /> }))} onChange={(v) => void onSave({ id: t.id, priority: v as Task['priority'] })}><PriorityGlyph p={t.priority} />{PRIORITY[t.priority]}</Pick>
            {parts.length > 0 && <Pick title="Part of the map" value={t.part} options={[{ v: '', label: 'No part' }, ...parts.map((p) => ({ v: p.id, label: p.label, icon: <KindIcon kind={p.kind} /> }))]} onChange={(v) => void onSave({ id: t.id, part: v })}>
              {part ? <><KindIcon kind={part.kind} size={12} />{part.label}</> : 'No part'}
            </Pick>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PrimaryButton size="sm" onClick={onStart} icon={<AgentIcon id={agent} />}>{tab ? 'Go to its tab' : `Start with ${agentName}`}</PrimaryButton>
            <SecondaryButton size="sm" title="Copy the task, to give it to any agent" onClick={() => copy(promptOf(t, project, part), 'Task copied as a prompt')} icon={<Copy size={12} />}>Copy as prompt</SecondaryButton>
            <SecondaryButton size="sm" title={branchOf(t)} onClick={() => copy(branchOf(t), 'Branch name copied')} icon={<GitBranch size={12} />}>Copy branch name</SecondaryButton>
            {ask ? <span className="ml-auto flex items-center gap-1.5 text-meta">
              <button onClick={onDelete} className="h-6 rounded-xs bg-bad px-2 text-accent-text">Delete</button>
              <button onClick={() => setAsk(false)} className="h-6 rounded-xs px-2 text-text-2 hover:text-text">Cancel</button>
            </span> : <SecondaryButton size="sm" className="ml-auto" title="Delete this task" onClick={() => setAsk(true)} icon={<Trash2 size={ICON} />}>Delete</SecondaryButton>}
          </div>
        </div>
      )}
    </div>
  )
}


/* A task opened as a page : its name, its properties in a grid, its description, and on the right what the agent does with it.
   The status moves one step with the arrow, or straight to done with the check. */
const FLOW: TaskStatus[] = ['backlog', 'todo', 'progress', 'review', 'done']
const day = (ms: number) => new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ', ' + new Date(ms).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })

export function TaskPage({ t, project, part, parts, agent, agentName, agents, tab, onSave, onStart, onDelete, onCopy, onClose, onStep }: {
  t: Task; project: string; part?: Part; parts: Part[]; agent: string; agentName: string
  /* the agents installed on this computer, to choose who takes the task */ agents: { id: string; label: string }[]
  tab?: { status?: 'working' | 'needs' | 'done'; seen?: boolean }
  onSave: (t: Partial<Task>) => Promise<Task | null>; onStart: () => void; onDelete: () => void; onCopy: (what: string) => void; onClose: () => void
  onStep?: (d: 1 | -1) => void
}) {
  const [title, setTitle] = useState(t.title)
  const [desc, setDesc] = useState(t.description)
  const [ask, setAsk] = useState(false)
  useEffect(() => { setTitle(t.title); setDesc(t.description); setAsk(false) }, [t.id, t.title, t.description])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); onCopy(what) }
  const next = FLOW[FLOW.indexOf(t.status) + 1]
  const tone = STATUS_COLOR[t.status]
  // who takes it : the agent chosen for this task, or the default one
  const who = t.agent || agent, whoName = agents.find((x) => x.id === who)?.label ?? (who === agent ? agentName : who)
  const plain: React.CSSProperties = { width: 'auto', marginLeft: -8, fontSize: 'var(--mira-body-size)' }
  const empty = <span className="text-text-3">Empty</span>
  const prop = (icon: React.ReactNode, label: string, children: React.ReactNode) => (
    <div className="grid h-9 grid-cols-[124px_minmax(0,1fr)] items-center">
      <span className="flex items-center gap-2 text-body text-text-2">{icon}{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-body text-text">{children}</span>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onMouseDown={onClose}>
      <div className="flex h-[min(720px,calc(100vh-48px))] w-[1040px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-lg border border-line-strong bg-bg shadow-[var(--mira-shadow-float)]" onMouseDown={(e) => e.stopPropagation()}>
        {/* where it is, and what can be done with it */}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
          {onStep && <><IconButton onClick={() => onStep(-1)} title="Previous task"><ChevronUp size={ICON} /></IconButton><IconButton onClick={() => onStep(1)} title="Next task"><ChevronDown size={ICON} /></IconButton></>}
          <span className="ml-1 flex min-w-0 items-center gap-1.5 text-body"><span className="truncate text-text-2">{project}</span><span className="text-text-3">/</span><span className="font-mono text-meta text-text">{t.id}</span></span>
          <span className="ml-auto flex items-center gap-1">
            <IconButton title="Copy the task as a prompt, for any agent" onClick={() => copy(promptOf(t, project, part), 'Task copied as a prompt')}><Copy size={ICON} /></IconButton>
            {ask
              ? <span className="flex items-center gap-1.5 text-meta"><button onClick={onDelete} className="h-6 rounded-xs bg-bad px-2 text-accent-text">Delete</button><button onClick={() => setAsk(false)} className="h-6 rounded-xs px-2 text-text-2 hover:text-text">Cancel</button></span>
              : <IconButton title="Delete this task" onClick={() => setAsk(true)}><Trash2 size={ICON} /></IconButton>}
            <IconButton title="Close (Esc)" onClick={onClose}><X size={ICON} /></IconButton>
          </span>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-10">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && void onSave({ id: t.id, title })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} spellCheck={false} placeholder="Task name"
              className="w-full bg-transparent text-heading font-semibold tracking-[var(--mira-heading-tracking)] text-text outline-none placeholder:text-text-3" />
            <div className="mt-6 grid grid-cols-1 gap-x-12 md:grid-cols-2">
              {prop(<CircleDot size={ICON} />, 'Status', <>
                <span className="flex">
                  <Pick cell title="Status" value={t.status} options={STATUS.map((x) => ({ v: x.id, label: x.label, icon: <StatusGlyph s={x.id} /> }))} onChange={(x) => void onSave({ id: t.id, status: x })}
                    style={{ backgroundColor: tone, color: 'var(--mira-bg)', fontWeight: 600, width: 'auto', borderRadius: next ? '4px 0 0 4px' : 4 }}><StatusGlyph s={t.status} size={12} color="var(--mira-bg)" />{STATUS.find((x) => x.id === t.status)?.label}</Pick>
                  {next && <button onClick={() => void onSave({ id: t.id, status: next })} title={`Move to ${STATUS.find((x) => x.id === next)?.label}`}
                    className="ml-px grid h-6 w-6 place-items-center rounded-r-xs hover:brightness-110" style={{ backgroundColor: tone, color: 'var(--mira-bg)' }}><ChevronRight size={13} /></button>}
                </span>
                {t.status !== 'done' && <button onClick={() => void onSave({ id: t.id, status: 'done' })} title="Mark as done" className="grid h-6 w-6 place-items-center rounded-xs border border-line-strong text-text-2 hover:bg-surface-2 hover:text-text"><Check size={13} /></button>}
              </>)}
              {prop(<UserRound size={ICON} />, 'Agent', <>
                <Pick cell title="Agent that takes this task" value={t.agent} onChange={(x) => void onSave({ id: t.id, agent: x })} style={plain}
                  options={[{ v: '', label: `Default (${agentName})`, icon: <AgentIcon id={agent} /> }, ...agents.map((x) => ({ v: x.id, label: x.label, icon: <AgentIcon id={x.id} /> }))]}>
                  <AgentIcon id={who} /><span className="text-text">{whoName}</span>{!t.agent && <span className="text-text-3">default</span>}</Pick>
                {tab?.status && <StatusIcon status={tab.status} seen={tab.seen} />}
              </>)}
              {prop(<Flag size={ICON} />, 'Priority',
                <Pick cell title="Priority" value={t.priority} options={PRIORITY.map((l, i) => ({ v: i, label: l, icon: <PriorityGlyph p={i} /> }))} onChange={(x) => void onSave({ id: t.id, priority: x as Task['priority'] })}
                  style={t.priority > 0 ? { ...priorityStyle(t.priority), fontWeight: 500, width: 'auto' } : plain}>{t.priority > 0 ? PRIORITY[t.priority] : empty}</Pick>)}
              {prop(<Boxes size={ICON} />, 'Part', parts.length > 0
                ? <Pick cell title="Part of the map" value={t.part} options={[{ v: '', label: 'No part' }, ...parts.map((x) => ({ v: x.id, label: x.label, icon: <KindIcon kind={x.kind} /> }))]} onChange={(x) => void onSave({ id: t.id, part: x })}
                    style={plain}>{part ? <><KindIcon kind={part.kind} size={12} /><span className="truncate text-text">{part.label}</span></> : empty}</Pick>
                : empty)}
              {prop(<GitBranch size={ICON} />, 'Branch', <button onClick={() => copy(branchOf(t), 'Branch name copied')} title="Copy the branch name" className="-ml-2 flex h-6 min-w-0 items-center rounded-xs px-2 font-mono text-meta text-text hover:ring-1 hover:ring-line-strong"><span className="truncate">{branchOf(t)}</span></button>)}
              {prop(<CalendarDays size={ICON} />, 'Created', <span className="text-text-2">{day(t.createdAt)}</span>)}
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== t.description && void onSave({ id: t.id, description: desc })}
                placeholder="Add a description: details, steps, what done looks like" rows={10} spellCheck={false}
                className="w-full resize-none bg-transparent text-body text-text outline-none placeholder:text-text-3" />
            </div>
          </div>
          {/* the agent's side : start it, see where it stands, what happened */}
          <div className="flex w-80 shrink-0 flex-col border-l border-line">
            <div className="flex h-11 shrink-0 items-center border-b border-line px-4 text-body font-semibold text-text">Agent</div>
            <div className="flex flex-col gap-2 p-4">
              <PrimaryButton onClick={onStart} icon={<AgentIcon id={who} />}>{tab ? 'Go to its tab' : `Start with ${whoName}`}</PrimaryButton>
              <SecondaryButton onClick={() => copy(promptOf(t, project, part), 'Task copied as a prompt')} icon={<Copy size={12} />}>Copy as prompt</SecondaryButton>
            </div>
            <div className="mt-auto flex flex-col border-t border-line px-4 pt-3 pb-4">
              <span className="flex h-8 items-center text-body font-semibold text-text">Activity</span>
              {tab && <span className="flex h-8 items-center gap-2 text-body"><AgentIcon id={who} /><span className="font-medium text-text">{whoName}</span><span className="ml-auto text-text-2">has a tab on it</span></span>}
              {t.updatedAt > t.createdAt + 1000 && <span className="flex h-8 items-center justify-between gap-2 text-body"><span className="font-medium text-text">Last change</span><span className="tnum text-text-2">{day(t.updatedAt)}</span></span>}
              <span className="flex h-8 items-center justify-between gap-2 text-body"><span className="font-medium text-text">Created</span><span className="tnum text-text-2">{day(t.createdAt)}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
