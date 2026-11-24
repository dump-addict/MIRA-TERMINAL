/* Mira Terminal shell : projects on the left, panes of tabs (terminals, agents, notes, the map), status bar */
import { useCallback, useEffect, useRef, useState } from 'react'
import { WifiOff, ChevronLeft, ChevronRight, ChevronsRight, ShieldOff, ListTodo, GitPullRequest, FolderOpen, GitBranch, Map as MapIcon, PanelLeft, Plus, FileText, FileCode2, Search, Settings as Gear, Coffee, Puzzle, Mic, SquareTerminal, Sparkles, X } from 'lucide-react'
import { TerminalView } from './TerminalView'
import { NoteView } from './NoteView'
import { EditorView } from './EditorView'
import { Explorer } from './Explorer'
import { MapView, postToMap, fromMap } from './MapView'
import { Welcome } from './Welcome'
import { IconButton, PrimaryButton, Row, SecondaryButton, ICON } from './ui'
import { AgentIcon, NewMenu, UsageMeters, listAgents } from './agents'
import * as L from './layout'
import { Palette, actionIcons } from './Palette'
import { SettingsPage } from './SettingsPage'
import { PortsMeter } from './Ports'
import { KindIcon } from './kinds'
import { type Part } from './tasks'
import { TodoPage, isOpen, type TodoFilter } from './TodoPage'
import { ReviewsPage } from './ReviewsPage'
import { SideProjects, stClass, projectState } from './SideProjects'
import type { Idea, Pull, Reviews, Task } from '../../preload'
import { useSettings } from './settings'
import { startDictation, stopDictation, isRecording, dictatesInBox, voiceEvent } from './dictation'
import { peek as peekScreen } from './peek'
import type { ProjectInfo } from '../../preload'
import { isMac, kbd, shortcut } from './platform'

type Block = { id: string; label: string; color?: string; dir: string; kind?: string }
type Picked = Block & { kindLabel?: string; summary?: string; status?: string; statusLabel?: string; todos?: number; files?: string[] }
type TermTab = { key: number; title: string; since?: number; live?: string; session?: string; task?: string; cwd?: string; run?: string; projectId?: string; block?: Block; agent?: string; note?: string; yolo?: boolean; file?: string; dirty?: boolean; status?: 'working' | 'needs' | 'done'; seen?: boolean }
// where a dragged tab will land : a side of a pane, a side of the whole screen, or into a pane's tabs
// what is kept between launches : tabs, panes, the open project
type Saved = { current?: string; tabs: TermTab[]; layouts: Record<string, L.Layout> }
type Drop = { target: string; zone: 'right' | 'down' | 'center'; box: L.Rect }
let nextKey = 1
const MAP_KEY = 0
// every tab strip has the same height (the top one doubles as the window title bar) : 40px, a 32px tab, 8px above it
const TOP = 40, STRIP = 40

// launches Claude Code with the prompt of a focused discussion (file kept in .miraterminal/sessions/)
const AGENT_NAME: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' }
const claudeWith = (file: string) => `claude "$(cat '${file.replace(/'/g, `'\\''`)}')"`

export function App() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [current, setCurrent] = useState<ProjectInfo | null>(null)
  const [tabs, setTabs] = useState<TermTab[]>([])
  const [home, setHome] = useState<string>()
  const [toast, setToast] = useState<string>()
  const [picked, setPicked] = useState<Picked | null>(null)
  const toastT = useRef<number>(0)
  const [menu, setMenu] = useState<string | null>(null)   // id of the pane whose "+" menu is open
  const [side, setSide] = useState(true)   // shown, or hidden by its button (⌘B), as in Claude
  // shown as a narrow rail of icons, when its edge is pulled to the left ; remembered on this computer
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('mira.rail') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('mira.rail', rail ? '1' : '0') } catch { /* private mode */ } }, [rail])
  // sidebar width : drag its edge ; remembered on this computer
  const [sideW, setSideW] = useState(() => { try { return Math.min(420, Math.max(200, Number(localStorage.getItem('mira.sideW')) || 256)) } catch { return 256 } })
  useEffect(() => { try { localStorage.setItem('mira.sideW', String(sideW)) } catch { /* private mode */ } }, [sideW])
  const [fold, setFold] = useState(false)
  // the parts of the current project's map (from the map itself)
  const [parts, setParts] = useState<Part[]>([])
  // read from the map file at once (the map itself may not be open), then kept fresh by the map's own messages
  useEffect(() => { setParts([]); if (current) void window.mira.map.blocks(current.path).then((l) => setParts(l.map((b) => ({ id: b.id, label: b.label, kind: b.kind })))) }, [current?.id])
  // the pages of the sidebar's top : every project's to-do, the pull requests to review
  const [page, setPage] = useState<'todo' | 'reviews' | null>(null)
  const [todoFilter, setTodoFilter] = useState<TodoFilter>({})
  const [tasksBy, setTasksBy] = useState<Record<string, Task[]>>({})
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [reviewsBy, setReviewsBy] = useState<Record<string, Reviews>>({})
  const [reviewsLoading, setReviewsLoading] = useState(false)
  // projects whose open tabs are folded away in the sidebar
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [palette, setPalette] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('general')
  const [version, setVersion] = useState<string>()
  const st = useSettings()
  // keep the computer awake while an agent tab is open (or always, or never : set from the status bar)
  const agentsOpen = tabs.some((t) => t.agent)
  const awakeMode = st?.keepAwake ?? 'agents'
  const awake = awakeMode === 'always' || (awakeMode === 'agents' && agentsOpen)
  useEffect(() => { void window.mira.awake.set(awake) }, [awake])
  // one layout of panes per project (and one for terminals outside any project)
  const [layouts, setLayouts] = useState<Record<string, L.Layout>>({})
  const [drag, setDrag] = useState<number | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const area = useRef<HTMLDivElement>(null)
  // while the right panel's edge is dragged : the sizes at the start
  const panelDrag = useRef<{ main: number; panel: number; ratio: number; id: string } | null>(null)
  const restored = useRef(false)
  const ptys = useRef(new Map<number, string>())   // tab key -> its terminal id, to know what runs in it
  const [closing, setClosing] = useState<{ key: number; what: string } | null>(null)
  // a session the map asks for : it only starts on the user's click here (the map page shows a repository's own data)
  const [asked, setAsked] = useState<{ project: ProjectInfo; key: string; label: string; prompt: string } | null>(null)
  const [voice, setVoice] = useState<'off' | 'listening' | 'working'>('off')
  const mru = useRef<number[]>([])
  // back and forward : every place visited (project and tab), like a browser
  const hist = useRef<{ p: string | null; k: number }[]>([])
  const at = useRef(-1)
  const jumping = useRef(false)
  const [, bump] = useState(0)

  const say = useCallback((t: string) => { setToast(t); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(undefined), 2500) }, [])

  useEffect(() => {
    void window.mira.info().then((i) => { setHome(i.home); setVersion(i.version) })
    void window.mira.projects.list().then(async (l) => {
      // the order the user chose (stored as is) ; the last opened one is only used to start on it
      const sorted = l
      const last = [...l].sort((a, b) => b.openedAt - a.openedAt)[0]
      setProjects(sorted)
      const s = await window.mira.settings.get()
      // reopen the tabs and panes of the last time ; agents continue their conversation if so set
      const saved = s.restoreSession ? (await window.mira.session.load()) as Saved | null : null
      if (saved?.tabs?.length) {
        const known = new Set(sorted.map((p) => p.id))
        const kept = saved.tabs.filter((t) => !t.projectId || known.has(t.projectId))
        const back = await Promise.all(kept.map(async (t) => {
          if (!t.agent) return { ...t, run: undefined }
          const root = sorted.find((p) => p.id === t.projectId)?.path
          // a Claude tab continues its own conversation ; without one (older tabs) or when off, it starts a new one
          const resume = s.resumeAgents && t.agent === 'claude' && !!t.session
          const session = t.agent === 'claude' ? (resume ? t.session : crypto.randomUUID()) : undefined
          const c = await window.mira.agents.command(t.agent, root, { id: session, resume })
          return { ...t, session, run: c?.command, yolo: c?.mode === 'yolo' }
        }))
        nextKey = Math.max(nextKey, ...back.map((t) => t.key + 1))
        const keys = new Set([MAP_KEY, ...back.map((t) => t.key)])
        const lays: Record<string, L.Layout> = {}
        // the map now lives in the right panel : an old map tab is taken out
        for (const [k, v] of Object.entries(saved.layouts ?? {})) { let x = L.repair(v); for (const lf of L.leaves(x.root)) for (const tk of lf.tabs) if (!keys.has(tk) || tk === MAP_KEY) x = L.removeTab(x, tk); lays[k] = x }
        setTabs(back); setLayouts(lays)
        const cur = sorted.find((p) => p.id === saved.current)
        restored.current = true
        if (cur) { setCurrent(cur); return }
      }
      restored.current = true
      // start on the last project, if so set
      if (s.startPage === 'last' && last) setCurrent(last)
    })
  }, [])

  // a layout damaged by an old bug (two panes with one id) is mended as soon as it is seen
  // and a tab left in no pane comes back in its project's first pane
  useEffect(() => {
    const lost = tabs.filter((t) => { const l = layouts[t.projectId ?? '-']; return restored.current && l && !L.leafOf(l.root, t.key) })
    const bad = Object.values(layouts).some((l) => !L.isSound(l))
    if (!bad && !lost.length) return
    setLayouts((all) => {
      const out = Object.fromEntries(Object.entries(all).map(([k, l]) => [k, L.isSound(l) ? l : L.repair(l)]))
      for (const t of lost) { const k = t.projectId ?? '-', l = out[k]; if (l && !L.leafOf(l.root, t.key)) out[k] = L.addTab(l, t.key, L.leaves(l.root)[0].id) }
      return out
    })
  }, [layouts, tabs])
  const lk = current?.id ?? '-'
  const lay: L.Layout = layouts[lk] ?? L.single([], `home-${lk}`)
  const setLay = (f: (l: L.Layout) => L.Layout, key = lk) =>
    setLayouts((all) => ({ ...all, [key]: f(all[key] ?? L.single([], `home-${key}`)) }))
  const focusLeaf = L.findLeaf(lay.root, lay.focus) ?? L.leaves(lay.root)[0]
  const active = focusLeaf?.active ?? -1
  const onScreen = new Set(L.leaves(lay.root).map((l) => l.active))

  const open = useCallback((p: ProjectInfo) => {
    setCurrent(p)
    setPicked(null)
    setPage(null)
    // opening a project never moves it : the sidebar keeps the order chosen by dragging (a new one is added on top)
    setProjects((l) => (l.some((x) => x.id === p.id) ? l : [p, ...l]))
    void window.mira.projects.touch(p.path)
  }, [])

  const visibleTabs = tabs.filter((t) => (t.projectId ?? null) === (current?.id ?? null))
  // a new tab, in the shown project or in another one (a task started from the Tasks page)
  const addTerm = (opts: Partial<TermTab> = {}, into?: string, proj: ProjectInfo | null = current) => {
    // never a key already taken (the counter starts again at 1 when this file is reloaded while the tabs stay)
    nextKey = Math.max(nextKey, ...tabs.map((x) => x.key + 1))
    const t: TermTab = { key: nextKey++, title: 'Terminal', cwd: proj && st?.newTerminalDir !== 'home' ? proj.path : home, projectId: proj?.id, ...opts }
    setTabs((x) => [...x, t])
    setLay((l) => {
      const ls = L.leaves(l.root)
      // never bury the map : a new tab goes to the focused pane, or the first pane without the map
      let target = into ?? l.focus
      const tl = L.findLeaf(l.root, target)
      if (!into && tl?.active === MAP_KEY && ls.length > 1) target = (ls.find((x) => !x.tabs.includes(MAP_KEY)) ?? tl).id
      return L.addTab(l, t.key, target)
    }, proj?.id ?? '-')
  }
  // the command comes from the main process : agent path, permission flags from settings, extra arguments
  const addAgent = async (a: { id: string; label: string }, into?: string) => {
    const session = a.id === 'claude' ? crypto.randomUUID() : undefined
    const c = await window.mira.agents.command(a.id, current?.path, { id: session })
    if (!c) { say(`${a.label} is not installed`); return }
    addTerm({ title: a.label, run: c.command, agent: a.id, session, yolo: c.mode === 'yolo' }, into)
  }
  // a project opened with nothing in it starts on the default agent, once (closing that tab later leaves the project empty)
  const autoStarted = useRef(new Set<string>())
  useEffect(() => {
    if (!current || !st || !restored.current || autoStarted.current.has(current.id)) return
    autoStarted.current.add(current.id)
    if (tabs.some((t) => t.projectId === current.id)) return
    void listAgents().then((l) => { const x = l.find((y) => y.id === st.defaultAgent); if (x?.installed) void addAgent(x) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, !!st, tabs.length])

  // a file opens in its own editor tab, or the tab it already has
  const openFile = (path: string) => {
    const found = tabs.find((t) => t.file === path && (t.projectId ?? null) === (current?.id ?? null))
    if (found) { select(found.key); return }
    addTerm({ title: path.split('/').pop() ?? 'File', file: path })
  }
  const addNote = async (into?: string) => { const f = await window.mira.notes.create(current?.path); addTerm({ title: f.split('/').pop()!, note: f }, into) }
  // a click on a part's tab, even the one already open : the map selects that part and moves to it
  const showBlock = (key: number) => { const b = tabs.find((x) => x.key === key)?.block; if (b) setTimeout(() => postToMap({ type: 'mira:show', id: b.id }), 80) }
  const select = (key: number) => { setForceHome(false); setLay((l) => L.selectTab(l, key)); showBlock(key) }
  // the map lives in the right panel ; it moves into a pane only when asked from a pane's + menu
  const showMap = (into?: string) => {
    if (!into && !L.leafOf(lay.root, MAP_KEY)) { void window.mira.settings.set({ rightPanel: 'map' }); return }
    if (into) void window.mira.settings.set({ rightPanel: st?.rightPanel === 'map' ? 'off' : st?.rightPanel ?? 'off' })
    showMapPane(into)
  }
  const showMapPane = (into?: string) => setLay((l) => {
    if (L.leafOf(l.root, MAP_KEY)) return L.selectTab(l, MAP_KEY)
    if (!L.leaves(l.root).some((x) => x.tabs.length)) return L.single([MAP_KEY])
    // the map was closed : it comes back in the pane asked for, or on the right of the whole screen
    if (into) return L.addTab(l, MAP_KEY, into)
    const m = L.leaf([MAP_KEY])
    return { root: { id: `m${Date.now()}`, dir: 'right', ratio: 60, a: l.root, b: m }, focus: m.id }
  })
  const doClose = (key: number) => {
    // the tab's own project layout : it can be closed from the sidebar while another project is shown
    const owner = key === MAP_KEY ? lk : tabs.find((t) => t.key === key)?.projectId ?? '-'
    if (key !== MAP_KEY) setTabs((x) => x.filter((t) => t.key !== key))
    ptys.current.delete(key)
    setLay((l) => L.removeTab(l, key), owner)
  }
  // a terminal still running something (an agent, a server) : ask first, if so set
  const closeTab = async (key: number, force = false) => {
    const ft = tabs.find((t) => t.key === key)
    if (!force && ft?.file && ft.dirty) { setClosing({ key, what: 'unsaved changes' }); return }
    const pty = ptys.current.get(key)
    if (!force && st?.confirmCloseRunning !== false && pty) {
      const what = await window.mira.term.busy(pty)
      if (what) { setClosing({ key, what: what.split('/').pop() ?? what }); return }
    }
    doClose(key)
  }
  /* a part of the map opens in its own tab : with the default agent (it is told what the part is, nothing is sent), or a plain terminal */
  const developBlock = async (b: Picked, withAgent: boolean) => {
    if (!current) return
    setPicked(null)
    const found = tabs.find((t) => t.projectId === current.id && t.block?.id === b.id && !!t.agent === withAgent)
    if (found) { select(found.key); return }
    const block: Block = { id: b.id, label: b.label, color: b.color, dir: b.dir, kind: b.kind }
    if (!withAgent) { addTerm({ title: b.label, cwd: b.dir ? `${current.path}/${b.dir}` : current.path, block }); return }
    const id = st?.defaultAgent ?? 'claude'
    const a = (await listAgents()).find((x) => x.id === id)
    const session = id === 'claude' ? crypto.randomUUID() : undefined
    const c = a?.installed ? await window.mira.agents.command(id, current.path, { id: session }) : null
    if (!a || !c) { say(`${a?.label ?? 'The default agent'} is not installed`); return }
    let run = c.command
    if (id === 'claude') {
      const ctx = [
        `In Mira, the user opened the part "${b.label}"${b.kindLabel ? ` (${b.kindLabel})` : ''} of the project map of ${current.name}. Work on this part unless asked otherwise.`,
        b.summary && `What it is: ${b.summary}`,
        b.dir && `Its folder: ${b.dir}`,
        b.files?.length && `Its files: ${b.files.slice(0, 30).join(', ')}`,
        b.todos ? `It has ${b.todos} open point${b.todos === 1 ? '' : 's'} on the map.` : ''
      ].filter(Boolean).join('\n')
      run += ` --append-system-prompt '${ctx.replace(/'/g, `'\\''`)}'`
    }
    addTerm({ title: b.label, cwd: current.path, run, agent: id, session, yolo: c.mode === 'yolo', block })
  }
  /* the default agent in its own tab of a project, told what to work on (nothing is sent : it waits for you) */
  const agentWith = async (p: ProjectInfo, ctx: string, opts: Partial<TermTab>, agentId?: string) => {
    const id = agentId || (st?.defaultAgent ?? 'claude')
    const a = (await listAgents()).find((x) => x.id === id)
    const session = id === 'claude' ? crypto.randomUUID() : undefined
    const c = a?.installed ? await window.mira.agents.command(id, p.path, { id: session }) : null
    if (!a || !c) { say(`${a?.label ?? 'This agent'} is not installed`); return false }
    const run = id === 'claude' ? `${c.command} --append-system-prompt '${ctx.replace(/'/g, `'\\''`)}'` : c.command
    if (current?.id !== p.id) open(p)
    setPage(null)
    addTerm({ cwd: p.path, run, agent: id, session, yolo: c.mode === 'yolo', ...opts }, undefined, p)
    return true
  }
  /* a task started from the Tasks page : its own tab, the task and its part as context, the task moves to In progress */
  const startTask = async (p: ProjectInfo, t: Task, fresh = false) => {
    const found = tabs.find((x) => x.projectId === p.id && x.task === t.id)
    if (found) { setPage(null); goTab(p, found.key); return }
    const ps = p.id === current?.id && parts.length ? parts : await window.mira.map.blocks(p.path).then((l) => l.map((b) => ({ id: b.id, label: b.label, kind: b.kind })))
    const part = ps.find((x) => x.id === t.part)
    const ctx = [
      `In Mira, the user started task ${t.id} of ${p.name} with you: "${t.title}".`,
      t.description && `Details: ${t.description}`,
      part && `It belongs to the part "${part.label}" of the project map.`,
      fresh && 'This is a new project: its folder was just created and is empty. Help the user set it up from scratch, starting with what they want to build.',
      `The project's tasks are in .miraterminal/tasks.json. When this task is done, set its status to "review" there. You may add sub-tasks with "parent": "${t.id}".`,
      'Wait for the user before you start.'
    ].filter(Boolean).join('\n')
    const block = part ? { id: part.id, label: part.label, dir: '', kind: part.kind } : undefined
    const ok = await agentWith(p, ctx, { title: `${t.id} ${t.title}`.slice(0, 60), task: t.id, block }, t.agent)
    if (ok && (t.status === 'todo' || t.status === 'backlog')) void window.mira.tasks.save(p.path, { id: t.id, status: 'progress' })
  }
  /* an idea becomes a project : its folder is created where the user chooses, the idea becomes its first task, the agent starts there */
  const startIdea = async (i: Idea) => {
    const r = await window.mira.ideas.start(i.id)
    if (!r) return
    setProjects((l) => [r.project, ...l.filter((x) => x.id !== r.project.id)])
    const t = await window.mira.tasks.save(r.project.path, { title: i.title, description: i.description, status: 'todo' })
    if (t) await startTask(r.project, t, true)
  }
  /* a pull request : the agent reads it with gh, without checking it out or changing anything unless asked */
  const reviewPull = (p: ProjectInfo, pr: Pull) => void agentWith(p, [
    `In Mira, the user wants to review pull request #${pr.number} of ${p.name}: "${pr.title}" by ${pr.author || 'someone'}, branch ${pr.branch}.`,
    `Read it with \`gh pr view ${pr.number}\` and \`gh pr diff ${pr.number}\`. Do not check it out, push, comment, approve or merge unless the user asks.`,
    'Wait for the user before you start.'
  ].join('\n'), { title: `PR #${pr.number} ${pr.title}`.slice(0, 60) })

  // each project's own icon (its favicon or logo), found once
  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => { for (const p of projects) if (!(p.id in icons)) void window.mira.projects.icon(p.path).then((i) => setIcons((x) => ({ ...x, [p.id]: i }))) }, [projects.map((p) => p.id).join()])
  // every project's tasks, kept fresh when any of them changes (Mira, an agent, git)
  const projKey = projects.map((p) => p.id).join()
  useEffect(() => {
    const load = (p: ProjectInfo) => void window.mira.tasks.list(p.path).then((r) => setTasksBy((x) => ({ ...x, [p.id]: r?.tasks ?? [] })))
    projects.forEach(load)
    return window.mira.tasks.onChanged((root) => { const p = projects.find((x) => x.path === root); if (p) load(p) })
  }, [projKey])
  useEffect(() => { void window.mira.ideas.list().then(setIdeas); return window.mira.ideas.onChanged(() => void window.mira.ideas.list().then(setIdeas)) }, [])
  // pull requests : read when Mira opens, every 5 minutes, and when asked
  const loadReviews = useCallback(async (list: ProjectInfo[]) => {
    setReviewsLoading(true)
    const out = await Promise.all(list.filter((p) => p.git).map(async (p) => [p.id, await window.mira.reviews.list(p.path)] as const))
    setReviewsBy(Object.fromEntries(out)); setReviewsLoading(false)
  }, [])
  useEffect(() => { if (!projects.length) return; void loadReviews(projects); const t = setInterval(() => void loadReviews(projects), 5 * 60_000); return () => clearInterval(t) }, [projKey])
  const openCount = (pid: string) => (tasksBy[pid] ?? []).filter(isOpen).length
  const prCount = (pid: string) => (reviewsBy[pid]?.state === 'ok' ? reviewsBy[pid].pulls.length : 0)
  const todoTotal = projects.reduce((n, p) => n + openCount(p.id), 0)
  const prTotal = projects.reduce((n, p) => n + prCount(p.id), 0)
  const showTodo = (f: TodoFilter = {}) => { setTodoFilter(f); setPage('todo'); setPicked(null) }

  // a tab of any project : the sidebar goes there
  const goTab = (p: ProjectInfo, key: number) => { setPage(null); if (current?.id !== p.id) open(p); setLay((l) => L.selectTab(l, key), p.id); showBlock(key) }
  const rename = (key: number, title: string) => setTabs((x) => x.map((t) => (t.key === key ? { ...t, title } : t)))

  // messages from the map : a click on a block shows a small panel, the user decides whether to develop it in a terminal
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (!fromMap(e) || !current) return
      const d = e.data || {}
      if (d.type === 'mira:block' && d.id) {
        setPicked({ id: String(d.id), label: String(d.label || d.id), color: d.color, kind: String(d.kind || ''), dir: String(d.dir || '').replace(/^\/+|\/+$/g, ''),
          kindLabel: d.kindLabel, summary: d.summary, status: d.status, statusLabel: d.statusLabel, todos: Number(d.todos) || 0, files: Array.isArray(d.files) ? d.files : [] })
      }
      if (d.type === 'mira:blank') setPicked(null)
      // the map's parts : tabs opened before (restored) get their kind, so their icon
      if (d.type === 'mira:parts' && Array.isArray(d.parts)) {
        const ok = d.parts.filter((x: { id?: unknown }) => typeof x?.id === 'string') as { id: string; kind?: unknown; label?: unknown }[]
        setParts(ok.map((x) => ({ id: x.id, kind: String(x.kind ?? ''), label: String(x.label ?? x.id).slice(0, 80) })))
        const kinds = new Map<string, string>(ok.map((x) => [x.id, String(x.kind ?? '')]))
        setTabs((l) => l.some((t) => t.projectId === current.id && t.block && kinds.has(t.block.id) && t.block.kind !== kinds.get(t.block.id))
          ? l.map((t) => (t.projectId === current.id && t.block && kinds.has(t.block.id) ? { ...t, block: { ...t.block, kind: kinds.get(t.block.id) } } : t)) : l)
      }
      if (d.type === 'mira:session') {
        // never started from a message alone : the user confirms it in Mira's own window first
        setAsked({ project: current, key: String(d.key).slice(0, 80), label: String(d.label || '').slice(0, 80), prompt: String(d.prompt || '').slice(0, 20000) })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  })

  // shortcuts
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicked(null)
      // ⌃Tab : the next tab, by recent use or by order (Settings, General)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const keys = [...(current ? [MAP_KEY] : []), ...visibleTabs.map((t) => t.key)]
        if (keys.length < 2) return
        const order = st?.tabOrder === 'fixed' ? keys : [...mru.current.filter((k) => keys.includes(k)), ...keys.filter((k) => !mru.current.includes(k))]
        const i = order.indexOf(active)
        const next = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]
        if (next !== undefined) select(next)
        return
      }
      // ⌘ on macOS, Ctrl+Shift on Windows and Linux (see platform.ts)
      const { plain, shifted, alt, key } = shortcut(e)
      if (!plain && !shifted && !alt) return
      if (plain && (key === 'k' || key === 'p')) { e.preventDefault(); setPalette((v) => !v) }
      if (shifted && key === 'e' && current) { e.preventDefault(); void window.mira.settings.set({ rightPanel: st?.rightPanel === 'files' ? 'off' : 'files' }) }
      if (shifted && key === 'm' && current) { e.preventDefault(); void window.mira.settings.set({ rightPanel: st?.rightPanel === 'map' ? 'off' : 'map' }) }
      if (alt && key === 't') { e.preventDefault(); void listAgents().then((l) => { const a = l.find((x) => x.id === (st?.defaultAgent ?? 'claude')); if (a?.installed) addAgent(a) }); return }
      if (shifted && /^[1-6]$/.test(key)) { e.preventDefault(); void listAgents().then((l) => { const a = l[Number(key) - 1]; if (a?.installed) addAgent(a) }) }
      if (!plain) return
      if (key === ',') { e.preventDefault(); setSettingsOpen(true) }
      if (key === 't') { e.preventDefault(); addTerm() }
      if (key === 'b') { e.preventDefault(); setSide((v) => !v) }
      if (key === '[') { e.preventDefault(); go(-1) }
      if (key === ']') { e.preventDefault(); go(1) }
      if (key === 'w' && active !== -1) { e.preventDefault(); closeTab(active) }
      if (key === '1' && current) { e.preventDefault(); showMap() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  useEffect(() => {
    const here = { p: current?.id ?? null, k: active }
    if (jumping.current) { jumping.current = false; bump((x) => x + 1); return }
    const last = hist.current[at.current]
    if (last && last.p === here.p && last.k === here.k) return
    hist.current = [...hist.current.slice(0, at.current + 1), here].slice(-100)
    at.current = hist.current.length - 1
    bump((x) => x + 1)
  }, [current?.id, active])
  const canBack = at.current > 0, canFwd = at.current < hist.current.length - 1
  const go = (d: number) => {
    let i = at.current + d
    // skip places that no longer exist (closed tab, removed project)
    while (hist.current[i]) {
      const h = hist.current[i]
      const proj = h.p ? projects.find((x) => x.id === h.p) : null
      const tabOk = h.k === MAP_KEY ? !!proj : h.k === -1 || tabs.some((t) => t.key === h.k)
      if ((!h.p || proj) && tabOk) {
        at.current = i; jumping.current = true
        setCurrent(proj ?? null); setPicked(null)
        if (h.k !== -1) setLay((l) => L.selectTab(l, h.k), h.p ?? '-')
        return
      }
      i += d
    }
  }

  // offline : the Wi-Fi or the cable is gone, said in the status bar
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  // dictation : ⌘E starts and stops (or hold ⌘E while you speak, if so set)
  const dictate = async (on: boolean) => {
    if (on && !isRecording()) { const err = await startDictation(); if (err) { say(err); return } setVoice('listening'); return }
    if (!on && isRecording()) { setVoice('working'); const r = await stopDictation(); setVoice('off'); if (r.error) say(r.error); else if (r.text === '') say('Nothing heard') }
  }
  useEffect(() => { voiceEvent(voice) }, [voice])
  // the main process catches ⌘E (see before-input-event) and tells the page when it goes down and up
  // a ⌘E the main process did not catch still lands here
  useEffect(() => {
    const down = (e: KeyboardEvent) => { const sc = shortcut(e); if (sc.plain && sc.key === 'e' && !e.repeat) { e.preventDefault(); if (st?.voiceMode === 'hold') void dictate(true); else void dictate(!isRecording()) } }
    const up = (e: KeyboardEvent) => { if (st?.voiceMode === 'hold' && (e.key === 'e' || e.key === 'E' || e.key === 'Meta' || e.key === 'Control') && isRecording()) void dictate(false) }
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
  })
  // full screen : no window buttons, so no room kept for them
  const [full, setFull] = useState(false)
  // sidebar hidden : its buttons (sidebar, back, forward) sit right after the window buttons, as in Claude
  const lights = full || (side && rail) ? 'ml-0' : 'ml-[72px]'
  const navOut = !side || rail
  useEffect(() => { void window.mira.fullscreen().then(setFull); return window.mira.onMenu((a) => { if (a === 'fullscreen-on') setFull(true); if (a === 'fullscreen-off') setFull(false) }) }, [])
  useEffect(() => window.mira.onMenu((a) => {
    if (a === 'voice-down') { if (st?.voiceMode === 'hold') void dictate(true); else void dictate(!isRecording()) }
    if (a === 'voice-up' && st?.voiceMode === 'hold' && isRecording()) void dictate(false)
  }))

  // agents say when they work, wait for you or finish (their hooks, see agentevents.ts) : the tab shows it, a notification tells you
  useEffect(() => window.mira.onAgentEvent((pty, kind) => {
    const key = [...ptys.current.entries()].find(([, id]) => id === pty)?.[0]
    if (key == null) return
    const t = tabs.find((x) => x.key === key)
    setTabs((x) => x.map((y) => (y.key === key ? { ...y, status: kind, seen: kind === 'working' || (key === active && document.hasFocus()), since: kind === 'working' ? (y.status === 'working' && y.since ? y.since : Date.now()) : y.since } : y)))
    // an agent working on a task finished its turn : the task waits for your review
    const tt = tabs.find((y) => y.key === key)
    const proj = projects.find((p) => p.id === tt?.projectId)
    if (kind === 'done' && tt?.task && proj) void window.mira.tasks.list(proj.path).then((r) => { const k = r?.tasks.find((z) => z.id === tt.task); if (k?.status === 'progress') void window.mira.tasks.save(proj.path, { id: k.id, status: 'review' }) })
    if (!t || kind === 'working') return
    if ((kind === 'done' && st?.notifyDone === false) || (kind === 'needs' && st?.notifyNeeds === false)) return
    const where = projects.find((p) => p.id === t.projectId)?.name
    void window.mira.notify(kind === 'needs' ? `${t.title} needs you` : `${t.title} is done`, where ? `In ${where}` : 'In Mira')
  }))
  /* an agent started by hand in a plain terminal (typing claude, codex…) : the tab takes its logo while it runs, and loses it when it quits */
  useEffect(() => {
    const AGENT_OF: Record<string, string> = { claude: 'claude', codex: 'codex', gemini: 'gemini', 'cursor-agent': 'cursor', copilot: 'copilot', grok: 'grok' }
    const look = async () => {
      const plain = tabs.filter((t) => !t.agent && !t.file && !t.note && ptys.current.has(t.key))
      if (!plain.length) return
      const found = await Promise.all(plain.map(async (t) => {
        const p = (await window.mira.term.busy(ptys.current.get(t.key)!))?.split('/').pop() ?? ''
        // Claude Code shows its version number as its process name
        return [t.key, AGENT_OF[p] ?? (/^\d+\.\d+\.\d+$/.test(p) ? 'claude' : undefined)] as const
      }))
      const m = new Map(found)
      if (plain.some((t) => t.live !== m.get(t.key))) setTabs((x) => x.map((t) => (m.has(t.key) && t.live !== m.get(t.key) ? { ...t, live: m.get(t.key) } : t)))
    }
    const i = setInterval(() => void look(), 2000)
    return () => clearInterval(i)
  }, [tabs])
  // looking at a tab clears its "done"
  useEffect(() => { setTabs((x) => x.map((y) => (y.key === active && y.status && !y.seen ? { ...y, seen: true } : y))) }, [active])
  // the Dock shows how many agents wait for you or finished unseen
  const waiting = tabs.filter((t) => t.status === 'needs' || (t.status === 'done' && !t.seen)).length
  useEffect(() => { void window.mira.badge(st?.dockBadge === false ? 0 : waiting) }, [waiting, st?.dockBadge])

  // the session is saved a second after any change, once the last one has been restored
  useEffect(() => {
    if (!restored.current) return
    const t = setTimeout(() => void window.mira.session.save({ current: current?.id, tabs: tabs.map(({ run: _r, ...t }) => t), layouts } satisfies Saved), 1000)
    return () => clearTimeout(t)
  }, [tabs, layouts, current?.id])
  // recently used tabs, for ⌃Tab
  useEffect(() => { if (active !== -1) mru.current = [active, ...mru.current.filter((k) => k !== active)].slice(0, 50) }, [active])
  // the menu bar icon asks for a terminal or an agent
  useEffect(() => window.mira.onMenu((a) => {
    if (a === 'terminal') addTerm()
    if (a === 'agent') void listAgents().then((l) => { const x = l.find((y) => y.id === (st?.defaultAgent ?? 'claude')); if (x?.installed) void addAgent(x) })
  }))

  // opening a block's tab : the map shows that block
  useEffect(() => { const t = tabs.find((x) => x.key === active); if (t?.block) postToMap({ type: 'mira:show', id: t.block.id }) }, [active])

  const goHome = () => { setCurrent(null); setPicked(null); setPage(null) }
  const addFolder = async () => { const p = await window.mira.projects.openFolder(); if (p) open(p) }
  const newProject = async () => { const p = await window.mira.projects.create(); if (p && !('error' in p)) open(p); else if (p) setAddError(p.error) }
  const cloneRepo = () => { goHome(); setForceHome(true); setTimeout(() => document.getElementById('clone-url')?.focus(), 50) }
  // the "+" of the projects list shows the home page : new project, open a folder, clone a repository, recent projects
  const [forceHome, setForceHome] = useState(false)
  const addProject = () => { goHome(); setForceHome(true) }
  useEffect(() => { if (current || page) setForceHome(false) }, [current, page])
  const [addError, setAddError] = useState('')
  useEffect(() => { if (!addError) return; const t = setTimeout(() => setAddError(''), 5000); return () => clearTimeout(t) }, [addError])
  const empty = !L.leaves(lay.root).some((l) => l.tabs.length)
  const showWelcome = !current && (empty || forceHome)

  // where the map is : in a pane (from a + menu), else in the right panel
  const mapInPane = !!L.leafOf(lay.root, MAP_KEY)
  // the right panel : the map (or the files) ; hidden while a page of the sidebar's top is shown
  const rp = st?.rightPanel === 'tasks' ? 'map' : st?.rightPanel ?? 'map'
  const panel = !current || page ? 'off' : rp === 'map' && (mapInPane || st?.mapEnabled === false) ? 'off' : rp
  const mapNode = (visible: boolean) => current && (
    <>
      {visible && picked && (
        <BlockPanel b={picked} open={tabs.find((t) => t.projectId === current.id && t.block?.id === picked.id)}
          root={current.name} path={current.path} onTasks={() => showTodo({ project: current.id, part: picked.id })} agent={st?.defaultAgent ?? 'claude'} onDevelop={(withAgent) => void developBlock(picked, withAgent)} onClose={() => setPicked(null)} />
      )}
      <MapView key={`${current.id}${current.trusted ? '-t' : ''}`} project={current} visible={visible}
        onTrust={async () => { await window.mira.projects.trust(current.path, true); await window.mira.map.restart(current.path); const q = { ...current, trusted: true }; setCurrent(q); setProjects((l) => l.map((x) => (x.id === q.id ? q : x))); say('Project trusted') }}
        onGitInit={async () => { if (await window.mira.projects.gitInit(current.path)) { const q = { ...current, git: true }; setCurrent(q); setProjects((l) => l.map((x) => (x.id === q.id ? q : x))); say('Git repository created') } }} />
    </>
  )

  // panes on screen
  const boxes = L.rects(lay.root)
  const panes = L.leaves(lay.root)
  const stripH = (r: L.Rect) => (r.t === 0 ? TOP : STRIP)
  const css = (r: L.Rect, dy = 0): React.CSSProperties => ({ left: `${r.l}%`, top: `calc(${r.t}% + ${dy}px)`, width: `${r.w}%`, height: `calc(${r.h}% - ${dy}px)` })
  const paneOf = (key: number) => panes.find((p) => p.active === key)

  // where a dragged tab would land
  const dropAt = (x: number, y: number): Drop | null => {
    const a = area.current!.getBoundingClientRect()
    const px = ((x - a.left) / a.width) * 100, py = ((y - a.top) / a.height) * 100
    // the lower part or the right edge of the whole screen : a new row under all the panes, or a column right of them all
    // (the band is wide enough to find : the bottom fifth, the right twelfth)
    if (panes.length > 1 && py > 80) return { target: lay.root.id, zone: 'down', box: { l: 0, t: 60, w: 100, h: 40 } }
    if (panes.length > 1 && px > 92) return { target: lay.root.id, zone: 'right', box: { l: 60, t: 0, w: 40, h: 100 } }
    const p = panes.find((q) => { const r = boxes.get(q.id)!; return px >= r.l && px <= r.l + r.w && py >= r.t && py <= r.t + r.h })
    if (!p) return null
    const r = boxes.get(p.id)!, rx = (px - r.l) / r.w, ry = (py - r.t) / r.h
    if (rx > 0.5 && rx - 0.5 >= ry - 0.5) return { target: p.id, zone: 'right', box: { ...r, l: r.l + r.w / 2, w: r.w / 2 } }
    if (ry > 0.5) return { target: p.id, zone: 'down', box: { ...r, t: r.t + r.h / 2, h: r.h / 2 } }
    return { target: p.id, zone: 'center', box: r }
  }
  const dropTab = (key: number, d: Drop) => setLay((l) => {
    if (d.zone === 'center') {
      const from = L.leafOf(l.root, key)
      if (from?.id === d.target) return L.selectTab(l, key)
      const out = L.removeTab(l, key)
      return L.findLeaf(out.root, d.target) ? L.addTab(out, key, d.target) : l
    }
    return L.splitWith(l, key, d.target, d.zone, d.target === l.root.id ? 60 : 50)
  })

  // the icon says what the tab is : an agent's logo, a file, a note or a terminal
  // a part of the map opened in a terminal is still a terminal : its icon is the terminal's (the part shows in the tab's header)
  const tabIcon = (t: TermTab) => t.file ? <FileCode2 size={ICON} /> : t.agent || t.live ? <AgentIcon id={(t.agent || t.live)!} /> : t.note ? <FileText size={ICON} /> : t.run && !t.block ? <Sparkles size={ICON} /> : <SquareTerminal size={ICON} />
  // and on its right, what is going on : the agent works, waits for you, is done, or skips every prompt
  const tabBadge = (t: TermTab) => t.yolo ? <span title="Skips all prompts" className="shrink-0 text-bad"><ShieldOff size={12} /></span> : null
  const tabTip = (t: TermTab) => [current?.name, t.block && t.block.label !== t.title ? t.block.label : null, t.title].filter(Boolean).join(' › ')
  const tabEl = (key: number, pane: L.Leaf) => {
    const focused = pane.id === lay.focus
    const on = pane.active === key
    const here = (before: boolean) => { if (drag != null && drag !== key) setLay((l) => L.moveTab(l, drag, pane.id, key, before)); setDrag(null); setDrop(null) }
    if (key === MAP_KEY) return current ? <Tab key="map" onDropHere={here} active={on} dim={!focused} onSelect={() => select(MAP_KEY)}
      onClose={panes.length > 1 || pane.tabs.length > 1 ? () => closeTab(MAP_KEY) : undefined}
      onDrag={(d) => setDrag(d ? MAP_KEY : null)} icon={<MapIcon size={ICON} />} title="Map" /> : null
    const t = visibleTabs.find((x) => x.key === key)
    if (!t) return null
    return <Tab key={t.key} onDropHere={here} active={on} dim={!focused} onSelect={() => select(t.key)} onClose={() => closeTab(t.key)} onDrag={(d) => setDrag(d ? t.key : null)}
      icon={tabIcon(t)} st={stClass(projectState([t]))} badge={tabBadge(t)} tip={tabTip(t)} prefix={t.block ? current?.name : undefined} title={t.dirty ? `${t.title} •` : t.title} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* sidebar */}
        {side && !rail ? <aside className="relative flex shrink-0 flex-col border-r border-line bg-chrome" style={{ width: sideW }}>
          {/* title bar : sidebar toggle and back / forward next to the macOS window buttons, the app name stays small */}
          <div className={`drag flex h-10 shrink-0 items-center gap-1 pr-3 ${full || !isMac ? 'pl-2' : 'pl-[80px]'}`}>
            <Nav side={side} onSide={() => setSide(false)} back={canBack} fwd={canFwd} go={go} />
            {st?.showAppName !== false && <button onClick={goHome} className="nodrag ml-auto rounded-xs px-1 text-body font-medium text-text-3 hover:text-text">Mira</button>}
          </div>
          {/* search : opens the ⌘K palette */}
          <div className="px-2 pt-1 pb-2">
            <button onClick={() => setPalette(true)} title={kbd('Search (⌘K)')} className="flex h-8 w-full items-center gap-2.5 rounded-sm border border-line px-2 text-left text-body text-text-3 hover:border-line-strong hover:text-text-2">
              <Search size={16} />Search
            </button>
          </div>
          <div className="flex flex-col gap-0.5 px-2">
            <Row onClick={() => addTerm()} icon={<SquareTerminal size={16} />} title={kbd('New terminal (⌘T)')}>New terminal</Row>
            <Row onClick={addFolder} icon={<FolderOpen size={16} />}>Open folder</Row>
            <Row onClick={cloneRepo} icon={<GitBranch size={16} />}>Clone repository</Row>
          </div>
          {/* the work of every project : tasks to do, pull requests to review (one list with the actions above) */}
          <div className="mt-0.5 flex flex-col gap-0.5 px-2">
            <Row active={page === 'todo'} onClick={() => showTodo()} icon={<ListTodo size={16} />} hint={todoTotal || undefined}>Tasks</Row>
            <Row active={page === 'reviews'} onClick={() => { setPage('reviews'); setPicked(null) }} icon={<GitPullRequest size={16} />} hint={prTotal || undefined}>Reviews</Row>
          </div>
          <div className="group mt-6 flex h-8 items-center gap-1 pr-2 pl-[17px]">
            {/* the section's title : same type as the rows, white, a small filled arrow after it */}
            <button onClick={() => setFold((f) => !f)} className="flex items-center gap-2 text-body text-text hover:text-text">
              Projects
              <svg width="8" height="8" viewBox="0 0 8 8" className={`text-text-2 transition-transform ${fold ? '-rotate-90' : ''}`} aria-hidden><path d="M1 2.2h6L4 6.2z" fill="currentColor" /></svg>
            </button>
            <IconButton onClick={addProject} title="Add project" className="ml-auto"><Plus size={ICON} /></IconButton>
          </div>
          {addError && <div className="px-[17px] pb-1 text-meta text-bad">{addError}</div>}
          {!fold && <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            {projects.length === 0 && <div className="px-2 py-1.5 text-body text-text-3">No projects yet</div>}
            <SideProjects icons={icons} projects={projects} tabs={tabs} current={current?.id} active={active} onScreen={onScreen} page={!!page}
              collapsed={collapsed} onToggle={(id) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })}
              onOpen={open} onTab={goTab} onClose={(k) => void closeTab(k)} icon={(t) => tabIcon(t as TermTab)} tip={(t) => tabTip(t as TermTab)}
              openCount={openCount} onTasks={(id) => showTodo({ project: id })} peek={(t) => peekScreen(ptys.current.get(t.key))}
              onMove={(id, to, before) => setProjects((l) => {
                const moving = l.find((x) => x.id === id); if (!moving || id === to) return l
                const rest = l.filter((x) => x.id !== id), at = rest.findIndex((x) => x.id === to) + (before ? 0 : 1)
                const next = [...rest.slice(0, at), moving, ...rest.slice(at)]
                void window.mira.projects.reorder(next.map((x) => x.id))
                return next
              })} />
          </div>}
          {/* the section folded : Settings stays at the bottom */}
          {fold && <div className="flex-1" />}
          <div className="shrink-0 border-t border-line px-2 py-2">
            <Row onClick={() => setSettingsOpen(true)} icon={<Gear size={16} />} title={kbd('Settings (⌘,)')}>Settings</Row>
          </div>
          {/* pulled to its narrowest, it becomes a rail of icons */}
          <SideEdge onDrag={(x) => { if (x < 150) setRail(true); else setSideW(Math.min(420, Math.max(200, x))) }} />
        </aside> : side ? (
          /* the sidebar pulled to its narrowest : a rail of icons ; the arrow or its edge opens it again */
          <aside className="relative flex w-[72px] shrink-0 flex-col items-center bg-chrome">
            {/* its right line starts below the title bar : the window buttons sit across the top */}
            <i className="pointer-events-none absolute top-10 right-0 bottom-0 w-px bg-line" />
            <div className="drag h-10 w-full shrink-0" />
            <div className="flex flex-col items-center gap-1 pt-1">
              <RailButton title={kbd('Search (⌘K)')} onClick={() => setPalette(true)}><Search size={16} /></RailButton>
              <RailButton title={kbd('New terminal (⌘T)')} onClick={() => addTerm()}><SquareTerminal size={16} /></RailButton>
              <RailButton title="Open folder" onClick={addFolder}><FolderOpen size={16} /></RailButton>
              <RailButton title="Clone repository" onClick={cloneRepo}><GitBranch size={16} /></RailButton>
              <div className="my-1 h-px w-6 bg-line" />
              <RailButton title={`Tasks${todoTotal ? ` (${todoTotal})` : ''}`} active={page === 'todo'} onClick={() => showTodo()}><ListTodo size={16} /></RailButton>
              <RailButton title={`Reviews${prTotal ? ` (${prTotal})` : ''}`} active={page === 'reviews'} onClick={() => setPage('reviews')}><GitPullRequest size={16} /></RailButton>
            </div>
            <div className="my-3 h-px w-8 bg-line" />
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
              {projects.map((p) => (
                <RailButton key={p.id} title={p.name} active={current?.id === p.id} onClick={() => open(p)}>
                  {/* the project's most pressing tab : waits for you, works, finished */}
                  <span className={stClass(projectState(tabs.filter((t) => t.projectId === p.id)))}><span className="mira-ic h-5 w-5">
                    {icons[p.id] ? <img src={icons[p.id]} alt="" className="h-5 w-5 rounded-xs object-contain" /> : <span className="text-meta font-semibold">{p.name.slice(0, 2)}</span>}
                  </span></span>
                </RailButton>
              ))}
            </div>
            <RailButton title={kbd('Settings (⌘,)')} onClick={() => setSettingsOpen(true)}><Gear size={16} /></RailButton>
            <RailButton title="Widen the sidebar" onClick={() => setRail(false)} className="mb-3"><ChevronsRight size={16} /></RailButton>
            <SideEdge onDrag={(x) => { if (x > 150) { setRail(false); setSideW(Math.min(420, Math.max(200, x))) } }} />
          </aside>
        ) : null}

        {/* main area : panes, each with its own tabs ; the top row of tabs is also the window title bar */}
        <main ref={area} className="relative min-w-0 flex-1 bg-bg"
          onDragOver={(e) => { if (drag == null) return; e.preventDefault(); setDrop(dropAt(e.clientX, e.clientY)) }}
          onDragLeave={(e) => { if (!area.current?.contains(e.relatedTarget as Node)) setDrop(null) }}
          onDrop={(e) => { e.preventDefault(); if (drag != null && drop) dropTab(drag, drop); setDrag(null); setDrop(null) }}>
          {showWelcome && (
            <>
              <div className={`drag absolute top-0 right-0 left-0 flex h-10 items-center border-b border-line pl-2`}>
                {navOut && <div className={`flex items-center gap-1 ${lights}`}><Nav side={side && !rail} onSide={() => setSide((v) => !v)} back={canBack} fwd={canFwd} go={go} /></div>}
              </div>
              <div className="absolute inset-x-0 top-10 bottom-0 z-20 bg-bg"><Welcome projects={projects} onOpen={open} onAddFolder={addFolder} onNew={newProject} onTerminal={() => { setForceHome(false); addTerm() }} say={say} /></div>
            </>
          )}

          {/* tab strips */}
          {!showWelcome && panes.map((p) => {
            const r = boxes.get(p.id)!, h = stripH(r), first = r.l === 0 && r.t === 0
            return (
              <div key={p.id} className={`absolute flex items-end gap-1 border-b border-line pr-2 ${r.t === 0 ? 'drag' : ''} ${r.l > 0 ? 'border-l' : ''} pl-2`}
                style={{ left: `${r.l}%`, top: `${r.t}%`, width: `${r.w}%`, height: h }} onMouseDown={() => setLay((l) => ({ ...l, focus: p.id }))}>
                {first && navOut && <div className={`mr-2 flex shrink-0 items-center gap-1 self-center ${lights}`}><Nav side={side && !rail} onSide={() => setSide((v) => !v)} back={canBack} fwd={canFwd} go={go} /></div>}
                <div className="flex min-w-0 items-end gap-1">{p.tabs.map((k) => tabEl(k, p))}</div>
                <div className="relative mb-1 shrink-0">
                  <IconButton onClick={() => setMenu((m) => (m === p.id ? null : p.id))} title="New tab" className={menu === p.id ? 'bg-surface-2 text-text' : ''}><Plus size={ICON} /></IconButton>
                  {menu === p.id && <NewMenu onAddAgent={() => { setSettingsSection('agents'); setSettingsOpen(true) }} onClose={() => setMenu(null)} onTerminal={() => addTerm({}, p.id)} onAgent={(a) => addAgent(a, p.id)} onNote={() => addNote(p.id)}
                    onMap={current ? () => showMap(p.id) : undefined} tabs={visibleTabs} onTab={select} />}
                </div>
              </div>
            )
          })}

          {/* contents : every tab stays mounted (terminals keep running), only the active tab of each pane shows */}
          {/* the map in a pane, when it was put there from a + menu */}
          {current && mapInPane && (() => {
            const p = paneOf(MAP_KEY), r = p && boxes.get(p.id)
            return (
              <div className="absolute overflow-hidden" onMouseDownCapture={() => p && setLay((l) => ({ ...l, focus: p.id }))}
                style={r ? css(r, stripH(r)) : { inset: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                {mapNode(!!r)}
              </div>
            )
          })()}
          {/* a project with nothing open : start something */}
          {current && empty && !showWelcome && (
            <div className="absolute inset-x-0 top-10 bottom-0 grid place-items-center">
              <div className="flex w-80 flex-col gap-1.5">
                <div className="mb-3 text-title font-semibold text-text">{current.name}</div>
                <Row onClick={() => addTerm()} icon={<SquareTerminal size={16} />} hint={kbd('⌘T')}>New terminal</Row>
                <Row onClick={() => void listAgents().then((l) => { const x = l.find((y) => y.id === (st?.defaultAgent ?? 'claude')); if (x?.installed) void addAgent(x) })} icon={<AgentIcon id={st?.defaultAgent ?? 'claude'} size={16} />} hint={kbd('⌘⌥T')}>New agent</Row>
                <Row onClick={() => setPalette(true)} icon={<Search size={16} />} hint={kbd('⌘P')}>Open a file</Row>
                {st?.rightPanel !== 'map' && <Row onClick={() => showMap()} icon={<MapIcon size={16} />} hint={kbd('⌘⇧M')}>Show the map</Row>}
              </div>
            </div>
          )}
          {tabs.map((t) => {
            const mine = (t.projectId ?? null) === (current?.id ?? null)
            const p = mine && onScreen.has(t.key) ? paneOf(t.key) : undefined, r = p && boxes.get(p.id)
            return (
              <div key={t.key} className="absolute overflow-hidden" onMouseDownCapture={() => p && setLay((l) => ({ ...l, focus: p.id }))}
                style={r ? { ...css(r, stripH(r)), opacity: panes.length > 1 && p?.id !== lay.focus ? 'calc(1 - var(--mira-inactive-dim, 0))' : undefined } : { inset: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                {t.file ? <EditorView file={t.file} active={!!r} onDirty={(d) => setTabs((x) => x.map((y) => (y.key === t.key && !!y.dirty !== d ? { ...y, dirty: d } : y)))} /> : t.note ? <NoteView file={t.note} active={!!r} /> : t.block ? <BlockPane tab={t} project={current} active={!!r} focus={!!r && p?.id === lay.focus} onPty={(id) => ptys.current.set(t.key, id)} onExit={() => doClose(t.key)} />
                  : <TerminalView composer={t.agent || t.live ? { agent: (t.agent || t.live)!, placeholder: `Message ${AGENT_NAME[(t.agent || t.live)!] ?? 'the agent'}` } : undefined} cwd={t.cwd} run={t.run} agent={t.agent} label={`${t.title}${current ? `  ${current.name}` : ''}`} active={!!r} focus={!!r && p?.id === lay.focus} onTitle={(s) => !t.agent && rename(t.key, s)} onPty={(id) => ptys.current.set(t.key, id)} onExit={() => doClose(t.key)} />}
              </div>
            )
          })}

          {current && panel === 'off' && !page && (
            <IconButton onClick={() => void window.mira.settings.set({ rightPanel: 'map' })} title={kbd('Show the panel (⌘⇧M)')} className={`absolute top-2 z-10 ${isMac ? 'right-2' : 'right-[146px]'}`}><PanelIcon open={false} /></IconButton>
          )}

          {page === 'todo' && <TodoPage projects={projects} tasks={tasksBy} ideas={ideas} reviews={reviewsBy} filter={todoFilter} onFilter={setTodoFilter}
            tabOf={(pid, id) => tabs.find((t) => t.projectId === pid && t.task === id)} agent={st?.defaultAgent ?? 'claude'} agentName={AGENT_NAME[st?.defaultAgent ?? 'claude'] ?? 'the agent'}
            onStart={(p, t) => void startTask(p, t)} onStartIdea={(i) => void startIdea(i)} onReviews={() => setPage('reviews')} say={say}
            lead={navOut ? <div className={`nodrag mr-2 flex items-center gap-1 ${lights}`}><Nav side={side && !rail} onSide={() => setSide((v) => !v)} back={canBack} fwd={canFwd} go={go} /></div> : undefined} />}
          {page === 'reviews' && <ReviewsPage projects={projects} reviews={reviewsBy} loading={reviewsLoading} onRefresh={() => void window.mira.reviews.recheck().then(() => loadReviews(projects))}
            onReview={reviewPull} onRun={(command, title) => addTerm({ title, run: command })} agent={st?.defaultAgent ?? 'claude'} agentName={AGENT_NAME[st?.defaultAgent ?? 'claude'] ?? 'the agent'}
            lead={navOut ? <div className={`nodrag mr-2 flex items-center gap-1 ${lights}`}><Nav side={side && !rail} onSide={() => setSide((v) => !v)} back={canBack} fwd={canFwd} go={go} /></div> : undefined} />}

          {/* lines between panes : drag to resize */}
          {!showWelcome && L.splits(lay.root).map((s) => <Divider key={s.id} split={s} box={boxes.get(s.id)!} area={area} onRatio={(ratio) => setLay((l) => L.setRatio(l, s.id, ratio))} />)}

          {/* while a tab is dragged : where it will open */}
          {drag != null && drop && (
            <div className="pointer-events-none absolute inset-0 z-20">
              <div className="absolute rounded-md border border-accent-line bg-accent-soft transition-all" style={{ left: `calc(${drop.box.l}% + 6px)`, top: `calc(${drop.box.t}% + 6px)`, width: `calc(${drop.box.w}% - 12px)`, height: `calc(${drop.box.h}% - 12px)` }} />
            </div>
          )}
        </main>
        {/* right panel : the project's map or its files, open or closed at will (⌘⇧M, ⌘⇧E) */}
        {current && panel !== 'off' && (
          <aside className="relative flex shrink-0 flex-col border-l border-line bg-bg" style={{ width: st?.rightWidth ?? 420 }}>
            <div className={`drag flex h-10 shrink-0 items-center gap-1 border-b border-line pl-2 ${isMac ? 'pr-2' : 'pr-[146px]'}`}>
              <div className="nodrag flex rounded-sm border border-line-strong p-0.5">
                {([['map', 'Map', <MapIcon key="m" size={13} />], ['files', 'Files', <FileCode2 key="f" size={13} />]] as const).map(([id, label, icon]) => (
                  <button key={id} onClick={() => void window.mira.settings.set({ rightPanel: id })}
                    className={`flex h-6 items-center gap-1.5 rounded-xs px-2.5 text-meta ${panel === id ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'}`}>{icon}{label}</button>
                ))}
              </div>
              <span className="ml-auto truncate px-2 text-meta text-text">{current.name}</span>
              <IconButton onClick={() => void window.mira.settings.set({ rightPanel: 'off' })} title={kbd('Hide the panel (⌘⇧M)')}><PanelIcon open /></IconButton>
            </div>
            <div className="relative min-h-0 flex-1">
              {panel === 'map' ? mapNode(true)
                : <Explorer root={current.path} current={tabs.find((t) => t.key === active)?.file} onOpen={openFile} />}
            </div>
            <PanelEdge onEnd={() => { panelDrag.current = null }} onDrag={(w) => {
              const next = Math.round(Math.min(900, Math.max(260, w)))
              // only the pane next to the panel gives or takes the room : the panes further left keep their width
              const r = lay.root
              if (!panelDrag.current) panelDrag.current = { main: area.current?.getBoundingClientRect().width ?? 0, panel: st?.rightWidth ?? 420, ratio: L.isLeaf(r) ? 0 : r.ratio, id: !L.isLeaf(r) && r.dir === 'right' ? r.id : '' }
              const d = panelDrag.current
              if (d.id && d.main > 0) setLay((l) => L.setRatio(l, d.id, Math.min(85, Math.max(15, (d.ratio * d.main) / (d.main - (next - d.panel))))))
              void window.mira.settings.set({ rightWidth: next })
            }} />
          </aside>
        )}
      </div>

      {/* status bar */}
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-chrome px-4 text-meta text-text-3">
        {st?.showUsage !== false && <UsageMeters />}
        <span className="ml-auto" />
        {/* no dots : what is on is said in white, what is off stays grey */}
        {st?.showAwake !== false && <button className={`flex items-center gap-1.5 hover:text-text ${awake ? 'text-text' : ''}`} title={`Keep awake: ${awakeMode === 'off' ? 'off' : awakeMode === 'always' ? 'always' : 'while an agent tab is open'}. Click to change.`}
          onClick={() => void window.mira.settings.set({ keepAwake: awakeMode === 'off' ? 'agents' : awakeMode === 'agents' ? 'always' : 'off' })}>
          <Coffee size={12} />
          {awakeMode === 'off' ? 'Sleep allowed' : awakeMode === 'always' ? 'Awake' : 'Awake with agents'}
        </button>}
        {st?.showPorts !== false && <PortsMeter />}
        {/* the network is only spoken of when it is gone */}
        {!online && <span className="flex items-center gap-1.5 text-bad" title="This Mac has no network. Agents cannot reach their services until it is back."><WifiOff size={12} />Offline</span>}
        {current?.git && <span className="flex items-center gap-1"><GitBranch size={12} />git</span>}
        <button className="max-w-[40%] truncate hover:text-text" title={current ? `Open in ${st?.openIn ?? 'Finder'}` : undefined}
          onClick={() => current && void window.mira.openIn(current.path).then((r) => r && say(r))}>{(current?.path ?? home ?? '').replace(/^\/Users\/[^/]+/, '~')}</button>
        <span className="tnum">v0.1</span>
      </footer>
      {asked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onMouseDown={() => setAsked(null)}>
          <div className="w-[520px] max-w-[92vw] rounded-md border border-line-strong bg-bg p-4 shadow-[var(--mira-shadow-float)]" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-title font-semibold text-text">Start Claude on {asked.label || 'this part'}?</div>
            <pre className="mt-3 max-h-56 overflow-auto rounded-sm border border-line bg-surface-1 p-3 font-mono text-meta whitespace-pre-wrap text-text-2">{asked.prompt.slice(0, 1200)}{asked.prompt.length > 1200 ? '…' : ''}</pre>
            <div className="mt-4 flex justify-end gap-2">
              <SecondaryButton onClick={() => setAsked(null)}>Cancel</SecondaryButton>
              <button autoFocus onClick={async () => {
                const a = asked; setAsked(null)
                const file = await window.mira.map.saveSession(a.project.path, a.key, a.prompt)
                addTerm({ title: `Claude ${a.label}`.trim(), run: claudeWith(file) }, undefined, a.project)
              }} className="h-7 rounded-sm bg-accent px-3 text-body text-accent-text hover:bg-accent-hover">Start</button>
            </div>
          </div>
        </div>
      )}
      {closing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onMouseDown={() => setClosing(null)}>
          <div className="w-96 rounded-md border border-line-strong bg-bg p-4 shadow-[var(--mira-shadow-float)]" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-title font-semibold text-text">Close this tab?</div>
            <p className="mt-1 text-body text-text-2">{closing.what === 'unsaved changes' ? 'This file has unsaved changes. Closing loses them.' : <><span className="font-mono text-text">{closing.what}</span> is still running in it. Closing stops it.</>}</p>
            <div className="mt-4 flex justify-end gap-2">
              <SecondaryButton onClick={() => setClosing(null)}>Cancel</SecondaryButton>
              <button autoFocus onClick={() => { doClose(closing.key); setClosing(null) }} className="h-7 rounded-sm bg-bad px-3 text-body text-accent-text">Close</button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsPage onClose={() => { setSettingsOpen(false); setSettingsSection('general') }} version={version} initial={settingsSection} project={current} onRun={(command, title) => addTerm({ title, run: command })} />}
      {palette && (
        <Palette onClose={() => setPalette(false)} projects={projects} current={current}
          tabs={[...(current ? [{ key: MAP_KEY, title: 'Map', icon: <MapIcon size={ICON} /> }] : []), ...visibleTabs.map((t) => ({ key: t.key, title: t.title, icon: tabIcon(t) }))]}
          onProject={open} onFile={openFile} onTab={(k) => (k === MAP_KEY ? showMap() : select(k))} onAgent={(a) => addAgent(a)}
          onBlock={(id) => { showMap(); setTimeout(() => postToMap({ type: 'mira:pick', id }), 60) }}
          actions={[
            { id: 'x-todo', group: 'Actions', label: 'Tasks', icon: <ListTodo size={ICON} />, run: () => showTodo() },
            { id: 'x-reviews', group: 'Actions', label: 'Reviews', icon: <GitPullRequest size={ICON} />, run: () => setPage('reviews') },
            { id: 'x-window', group: 'Actions', label: 'New window', hint: kbd('⌘⇧N'), icon: actionIcons.terminal, run: () => void window.mira.newWindow() },
            { id: 'x-term', group: 'Actions', label: 'New terminal', hint: kbd('⌘T'), icon: actionIcons.terminal, run: () => addTerm() },
            { id: 'x-note', group: 'Actions', label: 'New markdown note', icon: <FileText size={ICON} />, run: () => void addNote() },
            ...(current ? [{ id: 'x-map', group: 'Actions', label: 'Show map', hint: kbd('⌘1'), icon: actionIcons.map, run: () => showMap() }] : []),
            { id: 'x-open', group: 'Actions', label: 'Open folder', icon: actionIcons.folder, run: () => void addFolder() },
            { id: 'x-clone', group: 'Actions', label: 'Clone repository', icon: actionIcons.clone, run: cloneRepo },
            ...(current ? [{ id: 'x-openin', group: 'Actions', label: `Open ${current.name} in ${st?.openIn ?? 'Finder'}`, icon: <FolderOpen size={ICON} />, run: () => void window.mira.openIn(current.path).then((r) => r && say(r)) }] : []),
            { id: 'x-files', group: 'Actions', label: st?.rightPanel === 'files' ? 'Hide files' : 'Show files', hint: kbd('⌘⇧E'), icon: <FileCode2 size={ICON} />, run: () => void window.mira.settings.set({ rightPanel: st?.rightPanel === 'files' ? 'off' : 'files' }) },
            { id: 'x-custom', group: 'Actions', label: 'Customize agents', hint: 'plugins, MCP, skills', icon: <Puzzle size={ICON} />, run: () => { setSettingsSection('customize'); setSettingsOpen(true) } },
            { id: 'x-voice', group: 'Actions', label: 'Dictate', hint: kbd('⌘E'), icon: <Mic size={ICON} />, run: () => void dictate(true) },
            { id: 'x-settings', group: 'Actions', label: 'Settings', hint: kbd('⌘,'), icon: <Gear size={ICON} />, run: () => setSettingsOpen(true) },
            { id: 'x-side', group: 'Actions', label: side ? 'Hide sidebar' : 'Show sidebar', hint: kbd('⌘B'), icon: <PanelLeft size={ICON} />, run: () => setSide((v) => !v) }
          ]} />
      )}
      {voice !== 'off' && !dictatesInBox() && (
        <div className="fixed bottom-10 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-line-strong bg-bg px-4 py-2 text-body text-text shadow-[var(--mira-shadow-float)]">
          {voice === 'listening' ? <><i className="h-2 w-2 animate-pulse rounded-full bg-bad" />Listening<span className="text-text-3">{st?.voiceMode === 'hold' ? kbd('release ⌘E to stop') : kbd('⌘E to stop')}</span></> : <>Writing</>}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-10 left-1/2 -translate-x-1/2 rounded-md border border-line-strong bg-bg px-3 py-1.5 text-body text-text shadow-[var(--mira-shadow-float)]">{toast}</div>}
    </div>
  )
}

/* the line between two panes : drag it to resize */
function Divider({ split, box, area, onRatio }: { split: L.Split; box: L.Rect; area: React.RefObject<HTMLElement | null>; onRatio: (r: number) => void }) {
  const right = split.dir === 'right'
  const start = (e: React.MouseEvent) => {
    e.preventDefault()
    const a = area.current!.getBoundingClientRect()
    const move = (m: MouseEvent) => {
      const v = right ? (((m.clientX - a.left) / a.width) * 100 - box.l) / box.w : (((m.clientY - a.top) / a.height) * 100 - box.t) / box.h
      // every pane keeps room for its tabs and a few lines (less only when the window itself is too small)
      const total = right ? (a.width * box.w) / 100 : (a.height * box.h) / 100
      const lo = Math.min(45, (L.minSize(split.a, split.dir) / total) * 100), hi = 100 - Math.min(45, (L.minSize(split.b, split.dir) / total) * 100)
      onRatio(Math.min(Math.min(hi, 85), Math.max(Math.max(lo, 15), v * 100)))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.classList.remove('mira-resizing') }
    document.body.style.cursor = right ? 'col-resize' : 'row-resize'
    document.body.classList.add('mira-resizing')
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const at = right ? box.l + (box.w * split.ratio) / 100 : box.t + (box.h * split.ratio) / 100
  return (
    <div onMouseDown={start} className={`nodrag group absolute z-10 ${right ? 'w-2 -translate-x-1 cursor-col-resize' : 'h-2 -translate-y-1 cursor-row-resize'}`}
      style={right ? { left: `${at}%`, top: `${box.t}%`, height: `${box.h}%` } : { top: `${at}%`, left: `${box.l}%`, width: `${box.w}%` }}>
      <div className={`absolute bg-line group-hover:bg-line-strong ${right ? 'top-0 bottom-0 left-1' : 'right-0 left-0 top-1'}`} style={right ? { width: 'var(--mira-divider, 1px)' } : { height: 'var(--mira-divider, 1px)' }} />
    </div>
  )
}

function Tab({ active, dim, onSelect, onClose, onDrag, onDropHere, icon, badge, tip, title, prefix, st = '' }: { st?: string; prefix?: string; onDropHere?: (before: boolean) => void; active: boolean; dim?: boolean; onSelect: () => void; onClose?: () => void; onDrag: (on: boolean) => void; icon: React.ReactNode; badge?: React.ReactNode; tip?: string; title: string }) {
  // active tab : outlined, open at the bottom, it flows into the content below ; drag it onto the content to split
  const [mark, setMark] = useState<'l' | 'r' | null>(null)
  return (
    <div onMouseDown={onSelect} title={tip} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', title); onDrag(true) }} onDragEnd={() => onDrag(false)}
      // another tab dropped on this one : it takes this place in the bar (left half before, right half after)
      onDragOver={(e) => { if (!onDropHere) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMark(e.clientX < r.left + r.width / 2 ? 'l' : 'r') }}
      onDragLeave={() => setMark(null)}
      onDrop={(e) => { if (!onDropHere) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onDropHere(e.clientX < r.left + r.width / 2); setMark(null) }}
      style={mark ? { boxShadow: `inset ${mark === 'l' ? '2px' : '-2px'} 0 0 var(--mira-accent)` } : undefined}
      className={`nodrag group relative z-[1] -mb-px flex h-8 max-w-60 min-w-0 items-center gap-2 rounded-t-md border px-3 text-body ${active ? `border-line border-b-bg bg-bg ${dim ? 'text-text-2' : 'text-text'}` : 'border-transparent text-text-2 hover:text-text'}`}>
      <span className={`shrink-0 ${st}`}><span className="mira-ic">{icon}</span></span>
      <span className="truncate">{prefix && <span className="text-text-3">{prefix} / </span>}{title}</span>
      {badge}
      {onClose && (
        <button onMouseDown={(e) => { e.stopPropagation(); onClose() }} title={kbd('Close (⌘W)')}
          className="-mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-xs text-text-3 hover:bg-surface-3 hover:text-text"><X size={12} /></button>
      )}
    </div>
  )
}

/* the sidebar's right edge : drag it to resize, or far left to fold it */
function SideEdge({ onDrag }: { onDrag: (x: number) => void }) {
  const start = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (m: MouseEvent) => onDrag(m.clientX)
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.classList.remove('mira-resizing') }
    document.body.style.cursor = 'col-resize'
    document.body.classList.add('mira-resizing')
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  return <div onMouseDown={start} className="nodrag absolute top-0 -right-1 bottom-0 z-20 w-2 cursor-col-resize hover:bg-line-strong/40" />
}

/* the right panel's button : the panel's side is filled when it is open */
function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.65" y="2.65" width="12.7" height="10.7" rx="2" />
      <path d="M10 2.65v10.7" />
      {open && <rect x="10" y="2.65" width="4.35" height="10.7" rx="0" fill="currentColor" stroke="none" style={{ clipPath: 'inset(0 0 0 0 round 0 2px 2px 0)' }} />}
    </svg>
  )
}

/* the right panel's left edge : drag to resize */
function PanelEdge({ onDrag, onEnd }: { onDrag: (width: number) => void; onEnd?: () => void }) {
  const start = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (m: MouseEvent) => onDrag(window.innerWidth - m.clientX)
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.classList.remove('mira-resizing'); onEnd?.() }
    document.body.style.cursor = 'col-resize'
    document.body.classList.add('mira-resizing')
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  return <div onMouseDown={start} className="nodrag absolute top-0 -left-1 bottom-0 z-20 w-2 cursor-col-resize hover:bg-line-strong/40" />
}

/* sidebar toggle, back, forward */
function Nav({ side, onSide, back, fwd, go }: { side: boolean; onSide: () => void; back: boolean; fwd: boolean; go: (d: number) => void }) {
  return (
    <>
      <IconButton onClick={onSide} title={side ? kbd('Hide sidebar (⌘B)') : kbd('Show sidebar (⌘B)')}><PanelLeft size={16} /></IconButton>
      <IconButton onClick={() => go(-1)} disabled={!back} title={kbd('Back (⌘[)')}><ChevronLeft size={16} /></IconButton>
      <IconButton onClick={() => go(1)} disabled={!fwd} title={kbd('Forward (⌘])')}><ChevronRight size={16} /></IconButton>
    </>
  )
}

/* a part of the map in its own tab : just its terminal or agent ; the tab itself says the project and the part */
function BlockPane({ tab, project, active, focus, onPty, onExit }: { tab: TermTab; project: ProjectInfo | null; active: boolean; focus: boolean; onPty: (id: string) => void; onExit: () => void }) {
  const b = tab.block!
  return (
    <div className="absolute inset-0" style={{ visibility: active ? 'visible' : 'hidden' }}>
      <TerminalView composer={tab.agent || tab.live ? { agent: (tab.agent || tab.live)!, placeholder: `Message ${AGENT_NAME[(tab.agent || tab.live)!] ?? 'the agent'}` } : undefined} cwd={tab.cwd} run={tab.run} agent={tab.agent} label={`${b.label}  ${project?.name ?? ''}`} active={active} focus={focus} onPty={onPty} onExit={onExit} />
    </div>
  )
}

/* small panel shown when a block is clicked on the map : what it is, and the choice to develop it in its own terminal */
function BlockPanel({ b, open, root, path, agent, onTasks, onDevelop, onClose }: { b: Picked; open?: TermTab; root: string; path: string; agent: string; onTasks: () => void; onDevelop: (withAgent: boolean) => void; onClose: () => void }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => { void window.mira.tasks.list(path).then((r) => setCount(r ? r.tasks.filter((t) => t.part === b.id && t.status !== 'done' && t.status !== 'canceled').length : null)) }, [path, b.id])
  const tone = b.status === 'fail' || b.status === 'broken' ? 'text-bad' : b.status === 'warn' ? 'text-warn' : b.status === 'ok' || b.status === 'live' ? 'text-ok' : 'text-text-3'
  return (
    <div className="absolute top-4 right-4 z-10 w-80 rounded-md border border-line-strong bg-bg p-4 shadow-[var(--mira-shadow-float)]">
      <div className="flex items-center gap-2">
        <span className="text-text-2"><KindIcon kind={b.kind} /></span>
        <span className="text-meta text-text-3">{b.kindLabel || 'Part'}</span>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto -mr-1"><X size={ICON} /></IconButton>
      </div>
      <div className="mt-1.5 text-title font-semibold tracking-title text-text">{b.label}</div>
      {b.summary && <p className="mt-1 text-body text-text-2">{b.summary}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-meta">
        {b.statusLabel && <span className={`flex h-5 items-center gap-1.5 rounded-xs border border-line-strong px-1.5 ${tone}`}><i className="h-1.5 w-1.5 rounded-full bg-current" />{b.statusLabel}</span>}
        {!!b.todos && <span className="flex h-5 items-center rounded-xs border border-line-strong px-1.5 text-text-2">{b.todos} to do</span>}
        {!!b.files?.length && <span className="flex h-5 items-center rounded-xs border border-line-strong px-1.5 text-text-2">{b.files.length} file{b.files.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="mt-3 truncate font-mono text-meta text-text-3">{b.dir ? `${root}/${b.dir}` : root}</div>
      <button onClick={onTasks} className="mt-3 flex h-8 w-full items-center gap-2 rounded-sm border border-line px-2.5 text-body text-text-2 hover:bg-surface-1 hover:text-text">
        <ListTodo size={ICON} />Tasks<span className="ml-auto text-meta text-text-3 tnum">{count ? `${count} open` : 'None yet'}</span>
      </button>
      <div className="mt-4 flex items-center gap-2">
        {open ? <PrimaryButton onClick={() => onDevelop(!!open.agent)} icon={open.agent ? <AgentIcon id={open.agent} /> : <SquareTerminal size={ICON} />} className="flex-1">Go to its tab</PrimaryButton> : <>
          <PrimaryButton onClick={() => onDevelop(true)} icon={<AgentIcon id={agent} />} className="flex-1">Develop with {AGENT_NAME[agent] ?? 'the agent'}</PrimaryButton>
        </>}
      </div>
    </div>
  )
}

function RailButton({ title, active, onClick, className = '', children }: { title: string; active?: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className={`nodrag grid h-9 w-9 place-items-center rounded-sm ${active ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-1 hover:text-text'} ${className}`}>{children}</button>
  )
}
