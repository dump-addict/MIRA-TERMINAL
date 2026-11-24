/* Tasks : every project's tasks on one page, as a board (columns by status, left to right) or a list, with each project's state on top of its tasks, and the ideas of projects not created yet.
   Narrowed to one project (and one part of its map) from the sidebar or the map. A task starts the default agent in its own tab. */
import { useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronDown, ChevronRight, CircleCheck, Columns3, Flag, UserRound, Layers, Table2, FolderGit2, FolderOpen, GitBranch, GitPullRequest, Lightbulb, List, Plus, Search, Trash2, X } from 'lucide-react'
import type { Idea, ProjectInfo, Reviews, Task, TaskStatus } from '../../preload'
import { Pick, PRIORITY, priorityStyle, PriorityGlyph, STATUS, STATUS_COLOR, StatusGlyph, TaskPage, TaskRow, type Part } from './tasks'
import { AgentIcon, listAgents } from './agents'
import { KindIcon } from './kinds'
import { IconButton, PrimaryButton, SecondaryButton, ICON } from './ui'
import { kbd } from './platform'

export type TodoFilter = { project?: string; part?: string }
type TabInfo = { status?: 'working' | 'needs' | 'done'; seen?: boolean }

// open work first : in progress, in review, to do, backlog ; then by the order set by hand, then priority, newest first
const RANK: Record<TaskStatus, number> = { progress: 0, review: 1, todo: 2, backlog: 3, done: 4, canceled: 5 }
const sortTasks = (l: Task[]) => [...l].sort((a, b) => RANK[a.status] - RANK[b.status] || (a.order ?? 0) - (b.order ?? 0) || (a.priority || 9) - (b.priority || 9) || b.createdAt - a.createdAt)
export const isOpen = (t: Task) => t.status === 'progress' || t.status === 'review' || t.status === 'todo'
const IDEA = '__idea__'

export function TodoPage({ projects, tasks, ideas, reviews, filter, onFilter, tabOf, agent, agentName, onStart, onStartIdea, onReviews, say, lead }: {
  projects: ProjectInfo[]; tasks: Record<string, Task[]>; ideas: Idea[]; reviews: Record<string, Reviews>
  filter: TodoFilter; onFilter: (f: TodoFilter) => void
  tabOf: (projectId: string, taskId: string) => TabInfo | undefined
  agent: string; agentName: string
  onStart: (p: ProjectInfo, t: Task) => void; onStartIdea: (i: Idea) => void; onReviews: () => void
  say: (s: string) => void; lead?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  // the window that creates a task (or the idea of a new project) : opened by Add task
  const [creating, setCreating] = useState<{ title: string; desc: string; status: TaskStatus; priority: Task['priority']; part: string; agent: string } | null>(null)
  const openCreate = (status: TaskStatus = 'todo') => setCreating({ title: '', desc: '', status, priority: 0, part: filter.part ?? '', agent: '' })
  // the agents installed here : a task can name the one that takes it, otherwise the default agent does
  const [installed, setInstalled] = useState<{ id: string; label: string }[]>([])
  useEffect(() => { void listAgents().then((l) => setInstalled(l.filter((a) => a.installed).map((a) => ({ id: a.id, label: a.label })))) }, [])
  const whoOf = (t: Task) => t.agent || agent
  const nameOf = (id: string) => installed.find((x) => x.id === id)?.label ?? (id === agent ? agentName : id)
  const agentOpts = [{ v: '', label: `Default (${agentName})`, icon: <AgentIcon id={agent} /> }, ...installed.map((x) => ({ v: x.id, label: x.label, icon: <AgentIcon id={x.id} /> }))]
  const [target, setTarget] = useState<string>(filter.project ?? projects[0]?.id ?? IDEA)
  const [openId, setOpenId] = useState<string | null>(null)
  const [shut, setShut] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState<Set<string>>(new Set())
  const [parts, setParts] = useState<Record<string, Part[]>>({})
  const [branches, setBranches] = useState<Record<string, string>>({})
  const [drag, setDrag] = useState<{ pid: string; id: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // board (columns, like Trello) or list ; remembered on this computer
  const [view, setView] = useState<'board' | 'list' | 'table'>(() => { try { const v = localStorage.getItem('mira.tasksView'); return v === 'list' || v === 'table' ? v : 'board' } catch { return 'board' } })
  // done and canceled tasks, shown or left out of every view
  const [closedOn, setClosedOn] = useState(() => { try { return localStorage.getItem('mira.tasksClosed') !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('mira.tasksClosed', closedOn ? '1' : '0') } catch { /* private mode */ } }, [closedOn])
  useEffect(() => { try { localStorage.setItem('mira.tasksView', view) } catch { /* private mode */ } }, [view])
  const [detail, setDetail] = useState<{ pid: string; id: string } | null>(null)
  // the list is grouped by status (every project together, like the board) or by project ; remembered on this computer
  const [group, setGroup] = useState<'status' | 'project'>(() => { try { return localStorage.getItem('mira.tasksGroup') === 'project' ? 'project' : 'status' } catch { return 'status' } })
  useEffect(() => { try { localStorage.setItem('mira.tasksGroup', group) } catch { /* private mode */ } }, [group])
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)
  // a new task typed straight into a column of the board : it lands there, with that status
  const [colDraft, setColDraft] = useState<{ s: TaskStatus; text: string } | null>(null)

  useEffect(() => { if (filter.project) setTarget(filter.project) }, [filter.project])
  // each project's map parts (names and icons for the tasks) and its git branch
  useEffect(() => {
    for (const p of projects) {
      void window.mira.map.blocks(p.path).then((l) => setParts((x) => ({ ...x, [p.id]: l.map((b) => ({ id: b.id, label: b.label, kind: b.kind })) })))
      if (p.git) void window.mira.projects.branch(p.path).then((b) => setBranches((x) => ({ ...x, [p.id]: b })))
    }
  }, [projects.map((p) => p.id).join()])

  const shown = filter.project ? projects.filter((p) => p.id === filter.project) : projects
  const word = q.trim().toLowerCase()
  const match = (t: Task, pid: string) => (!filter.part || t.part === filter.part) &&
    (!word || `${t.id} ${t.title} ${t.labels.join(' ')} ${parts[pid]?.find((x) => x.id === t.part)?.label ?? ''}`.toLowerCase().includes(word))
  // projects with open work come first
  const ordered = useMemo(() => [...shown].sort((a, b) => Number((tasks[b.id] ?? []).some(isOpen)) - Number((tasks[a.id] ?? []).some(isOpen))), [shown, tasks])

  const create = async (start: boolean) => {
    const c = creating; const title = c?.title.trim(); if (!c || !title) return
    setCreating(null)
    if (target === IDEA) { const i = await window.mira.ideas.save({ title, description: c.desc }); if (i && start) onStartIdea(i); return }
    const p = projects.find((x) => x.id === target); if (!p) return
    const t = await window.mira.tasks.save(p.path, { title, description: c.desc, status: c.status, priority: c.priority, part: c.part, agent: c.agent })
    if (t && start) onStart(p, t)
  }

  const addIn = async (s: TaskStatus) => {
    const title = colDraft?.text.trim(); if (!title) { setColDraft(null); return }
    setColDraft({ s, text: '' })   // stays open for the next one
    const p = projects.find((x) => x.id === (filter.project ?? target)) ?? projects[0]; if (!p) return
    await window.mira.tasks.save(p.path, { title, status: s, part: filter.project === p.id ? filter.part ?? '' : '' })
  }

  // a task dropped on another : it takes that one's status and its place, just before it
  const dropOn = (p: ProjectInfo, on: Task) => {
    const from = drag; setDrag(null); setOver(null)
    if (!from || from.pid !== p.id || from.id === on.id) return
    const l = sortTasks(tasks[p.id] ?? []).filter((t) => t.id !== from.id)
    const i = l.findIndex((t) => t.id === on.id)
    const prev = l[i - 1]
    const order = prev && prev.status === on.status ? ((prev.order ?? 0) + (on.order ?? 0)) / 2 : (on.order ?? 0) - 1
    void window.mira.tasks.save(p.path, { id: from.id, status: on.status, order })
  }

  const fp = filter.project ? projects.find((p) => p.id === filter.project) : undefined
  const fpart = fp && filter.part ? parts[fp.id]?.find((x) => x.id === filter.part) : undefined
  const targets = [...projects.map((p) => ({ v: p.id, label: p.name, icon: p.git ? <FolderGit2 size={ICON} /> : <FolderOpen size={ICON} /> })), { v: IDEA, label: 'New project idea', icon: <Lightbulb size={ICON} /> }]
  const tgt = targets.find((x) => x.v === target) ?? targets[0]

  return (
    <div className="absolute inset-0 z-[15] flex flex-col bg-bg">
      <div className="drag flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        {lead}
        <span className="text-body text-text-2">Tasks</span>
        <span className="text-text-3">/</span>
        <span className="nodrag"><Pick bare={false} title="Show one project, or all of them" value={filter.project ?? ''} onChange={(v) => onFilter(v ? { project: v } : {})}
          options={[{ v: '', label: 'All projects', icon: <Layers size={ICON} /> }, ...projects.map((p) => ({ v: p.id, label: p.name, icon: p.git ? <FolderGit2 size={ICON} /> : <FolderOpen size={ICON} /> }))]}>
          <span className="font-medium text-text">{fp ? fp.name : 'All projects'}</span><ChevronDown size={12} className="text-text-3" /></Pick></span>
        {fpart && <span className="nodrag flex h-6 items-center gap-1.5 rounded-full border border-line-strong pr-1 pl-2 text-meta text-text-2">
          <KindIcon kind={fpart.kind} size={11} />{fpart.label}
          <button onClick={() => onFilter({ project: filter.project })} title="Show the whole project" className="grid h-4 w-4 place-items-center rounded-full hover:bg-surface-3 hover:text-text"><X size={11} /></button>
        </span>}
      </div>
      {/* the views, as tabs */}
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-line px-4">
        {([['board', 'Board', <Columns3 key="b" size={13} />], ['list', 'List', <List key="l" size={13} />], ['table', 'Table', <Table2 key="t" size={13} />]] as const).map(([id, label, ic]) => (
          <button key={id} onClick={() => setView(id)}
            className={`relative z-[1] -mb-px flex h-8 items-center gap-2 rounded-t-md border px-3 text-body ${view === id ? 'border-line border-b-bg bg-bg text-text' : 'border-transparent text-text-2 hover:text-text'}`}>{ic}{label}</button>
        ))}
      </div>
      {/* the tools of the view */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        {view === 'list'
          ? <button onClick={() => setGroup((g) => (g === 'status' ? 'project' : 'status'))} title="Change how the list is grouped"
              className="flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-body text-text hover:bg-surface-2"><Layers size={13} />Group: {group}</button>
          : view === 'board' && <span className="flex h-7 items-center gap-1.5 rounded-sm border border-line px-2.5 text-body text-text-2"><Layers size={13} />Group: status</span>}
        <button onClick={() => setClosedOn((v) => !v)} title={closedOn ? 'Hide done and canceled tasks' : 'Show done and canceled tasks'}
          className={`ml-auto flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-body ${closedOn ? 'border-line-strong bg-surface-2 text-text' : 'border-line text-text-2 hover:text-text'}`}><CircleCheck size={13} />Closed</button>
        <div className="flex h-7 w-56 items-center gap-2 rounded-sm border border-line px-2 focus-within:border-line-strong">
          <Search size={13} className="shrink-0 text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task" spellCheck={false} onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
        </div>
        <PrimaryButton onClick={() => openCreate()} icon={<Plus size={ICON} />}>Add task</PrimaryButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-1 pb-16">
          {view === 'board' && (() => {
            // every task shown, with its project, in columns by status ; ideas first, done last
            const all = ordered.flatMap((p) => (tasks[p.id] ?? []).filter((t) => match(t, p.id) && t.status !== 'canceled').map((t) => ({ p, t })))
            const cols: TaskStatus[] = [...(all.some((x) => x.t.status === 'backlog') ? ['backlog' as TaskStatus] : []), 'todo', 'progress', 'review', ...(closedOn ? ['done' as TaskStatus] : [])]
            const dropCol = (s: TaskStatus, before?: Task) => {
              const from = drag; setDrag(null); setOver(null); setOverCol(null)
              if (!from) return
              const p = projects.find((x) => x.id === from.pid); if (!p) return
              const col = sortTasks((tasks[p.id] ?? []).filter((t) => t.status === s && t.id !== from.id))
              let order = (col[col.length - 1]?.order ?? 0) + 1
              if (before) { const i = col.findIndex((t) => t.id === before.id); const prev = col[i - 1]; order = prev ? ((prev.order ?? 0) + (before.order ?? 0)) / 2 : (before.order ?? 0) - 1 }
              void window.mira.tasks.save(p.path, { id: from.id, status: s, order })
            }
            return (
              <div className="-mx-4 flex min-h-[60vh] items-start gap-3 overflow-x-auto px-4 pb-4">
                {!filter.project && ideas.length > 0 && (
                  <div className="flex w-72 shrink-0 flex-col rounded-md bg-surface-1/50">
                    <div className="flex h-10 items-center gap-2 px-3 text-body text-text"><Lightbulb size={14} className="text-text-2" />Ideas<span className="text-meta text-text-3 tnum">{ideas.length}</span></div>
                    <div className="flex flex-col gap-2 px-2 pb-2">
                      {ideas.filter((i) => !word || i.title.toLowerCase().includes(word)).map((i) => (
                        <div key={i.id} className="group rounded-md border border-line bg-bg p-3">
                          <div className="text-meta text-text-3">New project</div>
                          <div className="mt-1 text-body text-text">{i.title}</div>
                          <div className="mt-3 flex items-center gap-2">
                            <PrimaryButton size="sm" onClick={() => onStartIdea(i)}>Start</PrimaryButton>
                            <button onClick={() => void window.mira.ideas.remove(i.id)} title="Remove this idea" className="ml-auto grid h-6 w-6 place-items-center rounded-xs text-text-3 opacity-0 hover:bg-surface-3 hover:text-text group-hover:opacity-100"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {cols.map((s) => {
                  const l = all.filter((x) => x.t.status === s).sort((a, b) => (a.t.order ?? 0) - (b.t.order ?? 0) || (a.t.priority || 9) - (b.t.priority || 9) || b.t.createdAt - a.t.createdAt)
                  return (
                    <div key={s} onDragOver={(e) => { if (drag) { e.preventDefault(); setOverCol(s) } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
                      onDrop={(e) => { e.preventDefault(); dropCol(s) }}
                      style={{ backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[s]} ${overCol === s ? 16 : 7}%, transparent)` }}
                      className="group/col flex w-72 shrink-0 flex-col rounded-lg transition-colors">
                      <div className="flex h-11 items-center gap-2 px-2.5">
                        <span className="flex h-6 items-center gap-1.5 rounded-sm px-2 text-meta font-semibold" style={{ backgroundColor: STATUS_COLOR[s], color: 'var(--mira-bg)' }}>
                          <StatusGlyph s={s} size={13} color="var(--mira-bg)" />{STATUS.find((x) => x.id === s)?.label}</span>
                        <span className="text-body font-medium tnum" style={{ color: STATUS_COLOR[s] }}>{l.length}</span>
                        <button onClick={() => setColDraft({ s, text: '' })} title={`New task in ${STATUS.find((x) => x.id === s)?.label}`}
                          className="ml-auto grid h-6 w-6 place-items-center rounded-xs opacity-0 hover:bg-surface-3 group-hover/col:opacity-100" style={{ color: STATUS_COLOR[s] }}><Plus size={ICON} /></button>
                      </div>
                      <div className="flex flex-col gap-2 px-2 pb-2">
                        {l.map(({ p, t }) => {
                          const part = parts[p.id]?.find((x) => x.id === t.part)
                          const tab = tabOf(p.id, t.id)
                          const k = `${p.id}:${t.id}`
                          return (
                            <div key={k} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDrag({ pid: p.id, id: t.id }) }}
                              onDragEnd={() => { setDrag(null); setOver(null); setOverCol(null) }}
                              onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver(k); setOverCol(s) } }}
                              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropCol(s, t) }}
                              onClick={() => setDetail({ pid: p.id, id: t.id })}
                              style={over === k && drag?.id !== t.id ? { boxShadow: '0 -2px 0 var(--mira-accent)' } : undefined}
                              className={`cursor-default rounded-md border border-line bg-bg p-3 hover:border-line-strong ${drag?.id === t.id ? 'opacity-40' : ''}`}>
                              <div className={`text-body font-medium ${s === 'done' ? 'text-text-3' : 'text-text'}`}>{t.title}</div>
                              <div className="mt-2 flex items-center gap-1.5">
                                <span title={tab ? `${nameOf(whoOf(t))} works on it` : t.agent ? `For ${nameOf(t.agent)}` : 'No agent chosen: the default one takes it'} className="grid h-6 w-6 place-items-center rounded-xs border border-line text-text-3">{tab || t.agent ? <AgentIcon id={whoOf(t)} /> : <UserRound size={12} />}</span>
                                <span className="flex h-6 items-center gap-1.5 rounded-xs border border-line px-2 text-meta text-text-2"><StatusGlyph s={t.status} size={12} />{STATUS.find((x) => x.id === t.status)?.label}</span>
                                <span className="ml-auto font-mono text-meta text-text-3">{t.id}</span>
                              </div>
                              <div className="mt-2 flex flex-col gap-1 text-meta text-text-2">
                                <div className="flex h-6 items-center gap-2.5"><span className="grid w-6 place-items-center text-text-3"><Boxes size={13} /></span>{part ? <span className="flex min-w-0 items-center gap-1.5"><KindIcon kind={part.kind} size={12} /><span className="truncate">{part.label}</span></span> : <span className="text-text-3">–</span>}</div>
                                <div className="flex h-6 items-center gap-2.5"><span className="grid w-6 place-items-center text-text-3"><Flag size={13} /></span>{t.priority > 0 ? <span className="flex h-5 items-center rounded-xs px-2 font-medium" style={priorityStyle(t.priority)}>{PRIORITY[t.priority]}</span> : <span className="text-text-3">–</span>}</div>
                                {!filter.project && <div className="flex h-6 items-center gap-2.5"><span className="grid w-6 place-items-center text-text-3"><FolderOpen size={13} /></span><span className="truncate">{p.name}</span></div>}
                              </div>
                            </div>
                          )
                        })}
                        {!l.length && drag && <div className="grid h-16 place-items-center rounded-md border border-dashed border-line-strong text-meta text-text-3">Drop here</div>}
                        {colDraft?.s === s
                          ? <div className="rounded-md border border-line-strong bg-bg p-3">
                              <input autoFocus value={colDraft.text} onChange={(e) => setColDraft({ s, text: e.target.value })} spellCheck={false} placeholder="Task name"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addIn(s) } if (e.key === 'Escape') setColDraft(null) }}
                                onBlur={() => { if (!colDraft.text.trim()) setColDraft(null) }}
                                className="w-full bg-transparent text-body text-text outline-none placeholder:text-text-3" />
                              <div className="mt-2 flex items-center gap-2 text-meta text-text-3">
                                <span className="truncate">{(projects.find((x) => x.id === (filter.project ?? target)) ?? projects[0])?.name}</span>
                                <span className="ml-auto">Enter to add</span>
                              </div>
                            </div>
                          : <button onClick={() => setColDraft({ s, text: '' })} className="flex h-8 items-center gap-2 rounded-sm px-1.5 text-body hover:bg-surface-3/60" style={{ color: STATUS_COLOR[s] }}><Plus size={ICON} />Add task</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {view === 'table' && (() => {
            const all = ordered.flatMap((p) => sortTasks((tasks[p.id] ?? []).filter((t) => match(t, p.id) && (closedOn || (t.status !== 'done' && t.status !== 'canceled')))).map((t) => ({ p, t })))
            const GRID = 'grid grid-cols-[44px_minmax(0,1fr)_140px_180px_120px_120px_150px] items-center'
            const cell = 'flex h-9 min-w-0 items-center gap-1.5 border-r border-line px-3 last:border-r-0'
            const none = <span className="text-text-3">–</span>
            return (
              <div className="mt-1 overflow-x-auto rounded-md border border-line">
                <div className={`${GRID} border-b border-line bg-surface-1 text-meta text-text-3`}>
                  {['', 'Name', 'Status', 'Part', 'Priority', 'Agent', 'Project'].map((h, i) => <span key={i} className={cell}>{h}</span>)}
                </div>
                {all.map(({ p, t }, i) => {
                  const part = parts[p.id]?.find((x) => x.id === t.part), tab = tabOf(p.id, t.id)
                  return (
                    <div key={`${p.id}:${t.id}`} onClick={() => setDetail({ pid: p.id, id: t.id })} className={`${GRID} cursor-default border-b border-line text-body last:border-b-0 hover:bg-surface-1`}>
                      <span className={`${cell} justify-center text-meta text-text-3 tnum`}>{i + 1}</span>
                      <span className={cell}><span className="truncate text-text">{t.title}</span><span className="shrink-0 font-mono text-meta text-text-3">{t.id}</span></span>
                      <span className={cell}><span className="flex h-5 items-center gap-1.5 rounded-xs px-2 text-meta font-medium" style={{ backgroundColor: STATUS_COLOR[t.status], color: 'var(--mira-bg)' }}><StatusGlyph s={t.status} size={12} color="var(--mira-bg)" />{STATUS.find((x) => x.id === t.status)?.label}</span></span>
                      <span className={`${cell} text-meta text-text-2`}>{part ? <><KindIcon kind={part.kind} size={12} /><span className="truncate">{part.label}</span></> : none}</span>
                      <span className={`${cell} text-meta`}>{t.priority > 0 ? <span className="flex h-5 items-center rounded-xs px-2 font-medium" style={priorityStyle(t.priority)}>{PRIORITY[t.priority]}</span> : none}</span>
                      <span className={`${cell} text-meta text-text-2`}>{tab || t.agent ? <><AgentIcon id={whoOf(t)} />{nameOf(whoOf(t))}</> : none}</span>
                      <span className={`${cell} text-meta text-text-2`}><span className="truncate">{p.name}</span></span>
                    </div>
                  )
                })}
                {!all.length && <div className="px-3 py-6 text-center text-body text-text-3">No task yet</div>}
              </div>
            )
          })()}

          {view === 'list' && <>
          {group === 'status' && (() => {
            const all = ordered.flatMap((p) => (tasks[p.id] ?? []).filter((t) => match(t, p.id)).map((t) => ({ p, t })))
            const groups: TaskStatus[] = ['progress', 'review', 'todo', 'backlog', ...(closedOn ? ['done' as TaskStatus, ...(all.some((x) => x.t.status === 'canceled') ? ['canceled' as TaskStatus] : [])] : [])]
            // the project has its own column while every project is shown ; it goes away once one is picked
            const GRID = `grid ${filter.project ? 'grid-cols-[minmax(0,1fr)_120px_190px_140px_150px]' : 'grid-cols-[minmax(0,1fr)_150px_120px_190px_140px_150px]'} items-center gap-3`
            const statusOpts = STATUS.map((x) => ({ v: x.id, label: x.label, icon: <StatusGlyph s={x.id} /> }))
            const none = <span className="text-text-3">–</span>
            return (
              <div className="mt-1">
                <div className={`${GRID} h-8 border-b border-line px-3 text-meta text-text-3`}><span>Name</span>{!filter.project && <span>Project</span>}<span className="px-2">Agent</span><span className="px-2">Part</span><span className="px-2">Priority</span><span className="px-2">Status</span></div>
                {groups.map((s) => {
                  const l = all.filter((x) => x.t.status === s).sort((a, b) => (a.t.order ?? 0) - (b.t.order ?? 0) || (a.t.priority || 9) - (b.t.priority || 9) || b.t.createdAt - a.t.createdAt)
                  const key = `st:${s}`, folded = shut.has(key) && !word
                  const label = STATUS.find((x) => x.id === s)?.label
                  if (word && !l.length) return null
                  return (
                    <section key={s} className="mt-4">
                      <div className="group flex h-9 items-center gap-2">
                        <button onClick={() => setShut((x) => { const n = new Set(x); if (n.has(key)) n.delete(key); else n.add(key); return n })} title={folded ? 'Show' : 'Hide'}
                          className="grid h-6 w-5 place-items-center text-text-3 hover:text-text"><ChevronRight size={13} className={`transition-transform ${folded ? '' : 'rotate-90'}`} /></button>
                        <span className="flex h-6 items-center gap-1.5 rounded-sm px-2 text-meta font-semibold" style={{ backgroundColor: STATUS_COLOR[s], color: 'var(--mira-bg)' }}>
                          <StatusGlyph s={s} size={13} color="var(--mira-bg)" />{label}</span>
                        <span className="text-body text-text-2 tnum">{l.length}</span>
                        <button onClick={() => setColDraft({ s, text: '' })} title={`New task in ${label}`} className="grid h-6 w-6 place-items-center rounded-xs text-text-3 opacity-0 hover:bg-surface-2 hover:text-text group-hover:opacity-100"><Plus size={ICON} /></button>
                      </div>
                      {!folded && <>
                        {l.map(({ p, t }) => {
                          const part = parts[p.id]?.find((x) => x.id === t.part), tab = tabOf(p.id, t.id), closed = s === 'done' || s === 'canceled'
                          return (
                            <div key={`${p.id}:${t.id}`} onClick={() => setDetail({ pid: p.id, id: t.id })} className={`${GRID} h-9 cursor-default border-b border-line px-3 text-body hover:bg-surface-1`}>
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span className="shrink-0"><StatusGlyph s={t.status} /></span>
                                <span className={`truncate ${closed ? 'text-text-3' : 'text-text'}`}>{t.title}</span>
                                <span className="shrink-0 font-mono text-meta text-text-3">{t.id}</span>
                              </span>
                              {!filter.project && <span className="flex min-w-0 items-center gap-1.5 text-meta text-text">{p.git ? <FolderGit2 size={12} className="shrink-0 text-text-2" /> : <FolderOpen size={12} className="shrink-0 text-text-2" />}<span className="truncate">{p.name}</span></span>}
                              <span onClick={(e) => e.stopPropagation()} className="flex min-w-0"><Pick cell title="Agent that takes this task" value={t.agent} options={agentOpts} onChange={(v) => void window.mira.tasks.save(p.path, { id: t.id, agent: v })}>
                                {tab || t.agent ? <><AgentIcon id={whoOf(t)} /><span className="truncate text-text-2">{nameOf(whoOf(t))}</span></> : none}</Pick></span>
                              <span onClick={(e) => e.stopPropagation()} className="flex min-w-0"><Pick cell title="Part of the map" value={t.part} onChange={(v) => void window.mira.tasks.save(p.path, { id: t.id, part: v })}
                                options={[{ v: '', label: 'No part' }, ...(parts[p.id] ?? []).map((x) => ({ v: x.id, label: x.label, icon: <KindIcon kind={x.kind} /> }))]}>
                                {part ? <><KindIcon kind={part.kind} size={12} /><span className="truncate text-text-2">{part.label}</span></> : none}</Pick></span>
                              <span onClick={(e) => e.stopPropagation()} className="flex min-w-0"><Pick cell title="Priority" value={t.priority} onChange={(v) => void window.mira.tasks.save(p.path, { id: t.id, priority: v as Task['priority'] })}
                                options={PRIORITY.map((x, i) => ({ v: i, label: x, icon: <PriorityGlyph p={i} /> }))}
                                style={t.priority > 0 ? { ...priorityStyle(t.priority), fontWeight: 500 } : undefined}>{t.priority > 0 ? PRIORITY[t.priority] : none}</Pick></span>
                              <span onClick={(e) => e.stopPropagation()} className="flex min-w-0"><Pick cell title="Status" value={t.status} options={statusOpts} onChange={(v) => void window.mira.tasks.save(p.path, { id: t.id, status: v })}
                                style={{ backgroundColor: STATUS_COLOR[t.status], color: 'var(--mira-bg)', fontWeight: 600, width: 'auto' }}><StatusGlyph s={t.status} size={12} color="var(--mira-bg)" />{STATUS.find((x) => x.id === t.status)?.label}</Pick></span>
                            </div>
                          )
                        })}
                        {colDraft?.s === s
                          ? <div className="flex h-9 items-center gap-2.5 border-b border-line px-3">
                              <StatusGlyph s={s} />
                              <input autoFocus value={colDraft.text} onChange={(e) => setColDraft({ s, text: e.target.value })} spellCheck={false} placeholder="Task name"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addIn(s) } if (e.key === 'Escape') setColDraft(null) }}
                                onBlur={() => { if (!colDraft.text.trim()) setColDraft(null) }}
                                className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
                              <span className="text-meta text-text-3">{(projects.find((x) => x.id === (filter.project ?? target)) ?? projects[0])?.name}</span>
                            </div>
                          : <button onClick={() => setColDraft({ s, text: '' })} className="flex h-9 w-full items-center gap-2.5 border-b border-line px-3 text-left text-body text-text-3 hover:bg-surface-1 hover:text-text-2"><StatusGlyph s={s} />Add task</button>}
                      </>}
                    </section>
                  )
                })}
              </div>
            )
          })()}
          {group === 'project' && ordered.map((p) => {
            const all = tasks[p.id] ?? []
            const mine = sortTasks(all.filter((t) => match(t, p.id)))
            const live = mine.filter((t) => t.status !== 'done' && t.status !== 'canceled')
            const closed = mine.filter((t) => t.status === 'done' || t.status === 'canceled')
            const count = (s: TaskStatus) => all.filter((t) => t.status === s).length
            const pr = reviews[p.id]?.state === 'ok' ? reviews[p.id].pulls.length : 0
            const folded = shut.has(p.id) && !word
            if (word && !mine.length) return null
            return (
              <section key={p.id} className="mt-6">
                <div className="group flex h-9 items-center gap-2 border-b border-line px-1">
                  <button onClick={() => setShut((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} className="flex min-w-0 items-center gap-2 text-text hover:text-text">
                    <ChevronRight size={13} className={`shrink-0 text-text-3 transition-transform ${folded ? '' : 'rotate-90'}`} />
                    <span className="shrink-0 text-text-2">{p.git ? <FolderGit2 size={15} /> : <FolderOpen size={15} />}</span>
                    <span className="truncate text-body font-medium">{p.name}</span>
                  </button>
                  {branches[p.id] && <span title="Git branch" className="flex items-center gap-1 font-mono text-meta text-text-3"><GitBranch size={11} />{branches[p.id]}</span>}
                  <span className="ml-auto flex items-center gap-3 text-meta text-text-3 tnum">
                    {count('progress') > 0 && <span className="flex items-center gap-1.5"><StatusGlyph s="progress" size={12} />{count('progress')} in progress</span>}
                    {count('review') > 0 && <span className="flex items-center gap-1.5"><StatusGlyph s="review" size={12} />{count('review')} in review</span>}
                    {count('todo') > 0 && <span className="flex items-center gap-1.5"><StatusGlyph s="todo" size={12} />{count('todo')} to do</span>}
                    {pr > 0 && <button onClick={onReviews} title="Pull requests waiting" className="flex items-center gap-1.5 hover:text-text"><GitPullRequest size={12} />{pr} PR</button>}
                    {!all.some(isOpen) && <span>Nothing to do</span>}
                  </span>
                  <IconButton onClick={() => { setTarget(p.id); openCreate() }} title={`New task in ${p.name}`}><Plus size={ICON} /></IconButton>
                </div>
                {!folded && (
                  <div className="pt-1" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}>
                    {live.map((t) => (
                      <TaskRow key={t.id} t={t} project={p.name} part={parts[p.id]?.find((x) => x.id === t.part)} parts={parts[p.id] ?? []}
                        open={openId === `${p.id}:${t.id}`} agent={agent} agentName={agentName} tab={tabOf(p.id, t.id)}
                        onOpen={() => setOpenId((o) => (o === `${p.id}:${t.id}` ? null : `${p.id}:${t.id}`))}
                        onSave={(x) => window.mira.tasks.save(p.path, x)} onStart={() => onStart(p, t)} onCopy={say}
                        onDelete={async () => { await window.mira.tasks.remove(p.path, t.id); setOpenId(null) }}
                        drag={{ onStart: () => setDrag({ pid: p.id, id: t.id }), onEnd: () => { setDrag(null); setOver(null) }, mark: over === `${p.id}:${t.id}` && drag?.id !== t.id,
                          onOver: (e) => { if (drag?.pid === p.id) { e.preventDefault(); setOver(`${p.id}:${t.id}`) } }, onDrop: () => dropOn(p, t) }} />
                    ))}
                    {closed.length > 0 && (
                      <>
                        <button onClick={() => setShowDone((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                          className="flex h-8 items-center gap-2 px-3 text-meta text-text-3 hover:text-text-2">
                          <ChevronRight size={12} className={`transition-transform ${showDone.has(p.id) ? 'rotate-90' : ''}`} /><StatusGlyph s="done" size={12} />Done<span className="tnum">{closed.length}</span>
                        </button>
                        {showDone.has(p.id) && closed.map((t) => (
                          <TaskRow key={t.id} t={t} project={p.name} part={parts[p.id]?.find((x) => x.id === t.part)} parts={parts[p.id] ?? []}
                            open={openId === `${p.id}:${t.id}`} agent={agent} agentName={agentName} tab={tabOf(p.id, t.id)}
                            onOpen={() => setOpenId((o) => (o === `${p.id}:${t.id}` ? null : `${p.id}:${t.id}`))}
                            onSave={(x) => window.mira.tasks.save(p.path, x)} onStart={() => onStart(p, t)} onCopy={say}
                            onDelete={async () => { await window.mira.tasks.remove(p.path, t.id); setOpenId(null) }}
                            drag={{ onStart: () => undefined, onEnd: () => undefined, onOver: () => undefined, onDrop: () => undefined, mark: false }} />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </section>
            )
          })}

          {/* ideas : projects that do not exist yet ; Start creates the folder and opens the agent in it */}
          {view === 'list' && !filter.project && (ideas.length > 0 || target === IDEA) && (
            <section className="mt-6">
              <div className="flex h-9 items-center gap-2 border-b border-line px-1">
                <span className="text-text-2"><Lightbulb size={15} /></span>
                <span className="text-body font-medium text-text">Ideas</span>
                <span className="ml-auto text-meta text-text-3">Not created yet</span>
              </div>
              <div className="pt-1">
                {!ideas.length && <div className="px-3 py-2 text-body text-text-3">Add one with Add task</div>}
                {ideas.filter((i) => !word || i.title.toLowerCase().includes(word)).map((i) => (
                  <div key={i.id} className="group flex h-9 items-center gap-3 rounded-sm px-3 text-body hover:bg-surface-1">
                    <span className="w-4 shrink-0 text-text-3"><Lightbulb size={14} /></span>
                    <span className="min-w-0 flex-1 truncate text-text">{i.title}</span>
                    <button onClick={() => void window.mira.ideas.remove(i.id).then(() => say('Idea removed'))} title="Remove this idea"
                      className="grid h-6 w-6 place-items-center rounded-xs text-text-3 opacity-0 hover:bg-surface-3 hover:text-text group-hover:opacity-100"><Trash2 size={13} /></button>
                    <PrimaryButton size="sm" onClick={() => onStartIdea(i)} title="Choose where its folder goes, then start the agent in it">Start</PrimaryButton>
                  </div>
                ))}
              </div>
            </section>
          )}

          </>}
          {!projects.length && !ideas.length && <div className="py-16 text-center text-body text-text-3">Open a folder, or type a new project idea above</div>}
        </div>
      </div>
      {/* a new task : every property one click away, then create it or create it and start the agent */}
      {creating && (() => {
        const c = creating, set = (x: Partial<typeof c>) => setCreating({ ...c, ...x })
        const proj = projects.find((x) => x.id === target), pparts = proj ? parts[proj.id] ?? [] : [], part = pparts.find((x) => x.id === c.part)
        const idea = target === IDEA
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onMouseDown={() => setCreating(null)}>
            <div className="w-[600px] max-w-[calc(100vw-32px)] rounded-lg border border-line-strong bg-bg shadow-[var(--mira-shadow-float)]" onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Escape') setCreating(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void create(true) }}>
              <div className="flex h-11 items-center gap-1.5 px-3">
                <Pick title="Where it goes" value={target} options={targets} onChange={(v) => { setTarget(v); set({ part: '' }) }}>{tgt?.icon}<span className="max-w-44 truncate text-text">{tgt?.label}</span></Pick>
                {!idea && pparts.length > 0 && <><ChevronRight size={12} className="text-text-3" />
                  <Pick title="Part of the map" value={c.part} options={[{ v: '', label: 'No part' }, ...pparts.map((x) => ({ v: x.id, label: x.label, icon: <KindIcon kind={x.kind} /> }))]} onChange={(v) => set({ part: v })}>
                    {part ? <><KindIcon kind={part.kind} size={12} /><span className="max-w-44 truncate text-text">{part.label}</span></> : 'No part'}</Pick></>}
                <IconButton onClick={() => setCreating(null)} title="Close (Esc)" className="ml-auto"><X size={ICON} /></IconButton>
              </div>
              <div className="px-4">
                <input autoFocus value={c.title} onChange={(e) => set({ title: e.target.value })} spellCheck={false} placeholder={idea ? 'Name of the new project' : 'Task name'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); void create(false) } }}
                  className="h-9 w-full bg-transparent text-title font-semibold text-text outline-none placeholder:text-text-3" />
                <textarea value={c.desc} onChange={(e) => set({ desc: e.target.value })} rows={3} spellCheck={false} placeholder="Details, steps, what done looks like"
                  className="mt-1 w-full resize-none bg-transparent text-body text-text outline-none placeholder:text-text-3" />
                {!idea && <div className="flex flex-wrap items-center gap-1.5 pb-3">
                  <Pick title="Status" value={c.status} options={STATUS.map((x) => ({ v: x.id, label: x.label, icon: <StatusGlyph s={x.id} /> }))} onChange={(v) => set({ status: v })}><StatusGlyph s={c.status} /><span className="text-text">{STATUS.find((x) => x.id === c.status)?.label}</span></Pick>
                  <Pick title="Priority" value={c.priority} options={PRIORITY.map((l, i) => ({ v: i, label: l, icon: <PriorityGlyph p={i} /> }))} onChange={(v) => set({ priority: v as Task['priority'] })}><PriorityGlyph p={c.priority} /><span className={c.priority ? 'text-text' : ''}>{PRIORITY[c.priority]}</span></Pick>
                  <Pick title="Agent that takes this task" value={c.agent} options={agentOpts} onChange={(v) => set({ agent: v })}><AgentIcon id={c.agent || agent} /><span className="text-text">{nameOf(c.agent || agent)}</span></Pick>
                </div>}
              </div>
              <div className="flex h-12 items-center gap-2 border-t border-line px-3">
                <span className="text-meta text-text-3">Enter to create</span>
                <SecondaryButton className="ml-auto" disabled={!c.title.trim()} onClick={() => void create(false)}>Create</SecondaryButton>
                <PrimaryButton disabled={!c.title.trim()} onClick={() => void create(true)} icon={<AgentIcon id={c.agent || agent} />} title={kbd(`Create it and start ${nameOf(c.agent || agent)} on it (⌘Enter)`)}>Create and start</PrimaryButton>
              </div>
            </div>
          </div>
        )
      })()}
      {/* a card opened from the board : the whole task */}
      {detail && (() => {
        const p = projects.find((x) => x.id === detail.pid), t = p && (tasks[p.id] ?? []).find((x) => x.id === detail.id)
        if (!p || !t) return null
        const near = sortTasks((tasks[p.id] ?? []).filter((x) => match(x, p.id)))
        return (
          <TaskPage t={t} project={p.name} part={parts[p.id]?.find((x) => x.id === t.part)} parts={parts[p.id] ?? []} agent={agent} agentName={agentName} agents={installed} tab={tabOf(p.id, t.id)}
            onSave={(x) => window.mira.tasks.save(p.path, x)} onStart={() => { setDetail(null); onStart(p, t) }} onCopy={say} onClose={() => setDetail(null)}
            onDelete={async () => { await window.mira.tasks.remove(p.path, t.id); setDetail(null) }}
            onStep={near.length > 1 ? (d) => { const k = near.findIndex((x) => x.id === t.id), n = near[(k + d + near.length) % near.length]; if (n) setDetail({ pid: p.id, id: n.id }) } : undefined} />
        )
      })()}
    </div>
  )
}

