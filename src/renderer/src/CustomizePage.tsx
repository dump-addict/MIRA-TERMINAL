/* Customize : everything your agents can use, read from their own config, in one place (like Cursor's Customize) */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Bot, Command, FileText, Plug, Puzzle, Search, Server, Webhook, RefreshCw } from 'lucide-react'
import { AgentIcon } from './agents'
import { SecondaryButton } from './ui'
import type { CustomItem, ProjectInfo } from '../../preload'

const KINDS: { id: CustomItem['kind'] | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'plugin', label: 'Plugins', icon: <Puzzle size={14} /> },
  { id: 'mcp', label: 'MCP servers', icon: <Server size={14} /> },
  { id: 'skill', label: 'Skills', icon: <BookOpen size={14} /> },
  { id: 'subagent', label: 'Subagents', icon: <Bot size={14} /> },
  { id: 'rule', label: 'Rules', icon: <FileText size={14} /> },
  { id: 'command', label: 'Commands', icon: <Command size={14} /> },
  { id: 'hook', label: 'Hooks', icon: <Webhook size={14} /> }
]
const iconOf = (k: CustomItem['kind']) => KINDS.find((x) => x.id === k)?.icon ?? <Plug size={14} />

export function CustomizePage({ project, embedded = false }: { project: ProjectInfo | null; embedded?: boolean }) {
  const [items, setItems] = useState<CustomItem[]>([])
  const [kind, setKind] = useState<CustomItem['kind'] | 'all'>('all')
  const [agent, setAgent] = useState<'all' | 'claude' | 'codex'>('all')
  const [q, setQ] = useState('')
  const load = () => void window.mira.customize.list(project?.path).then(setItems)
  useEffect(load, [project?.path])

  const shown = useMemo(() => {
    const w = q.trim().toLowerCase()
    return items.filter((x) => (kind === 'all' || x.kind === kind) && (agent === 'all' || x.agent === agent) && (!w || `${x.name} ${x.detail} ${x.scope}`.toLowerCase().includes(w)))
  }, [items, kind, agent, q])
  const attention = shown.filter((x) => x.status === 'auth')
  const rest = shown.filter((x) => x.status !== 'auth')
  const count = (k: string) => items.filter((x) => (k === 'all' || x.kind === k) && (agent === 'all' || x.agent === agent)).length

  const row = (x: CustomItem, i: number) => (
    <div key={`${x.kind}${x.name}${x.scope}${i}`} className="group flex min-h-14 items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-line text-text-2">
        {iconOf(x.kind)}
        <i className={`absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-bg ${x.status === 'auth' ? 'bg-warn' : x.status === 'off' ? 'bg-text-3' : 'bg-ok'}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-body text-text">
          <span className="truncate">{x.name}</span>
          <span className="shrink-0 rounded-xs border border-line px-1.5 text-meta text-text-3">{x.scope}</span>
          <span className="shrink-0 opacity-70"><AgentIcon id={x.agent} size={12} /></span>
        </div>
        {x.detail && <div className="truncate text-meta text-text-3">{x.status === 'off' ? 'Turned off' : x.detail}</div>}
      </div>
      {x.status === 'auth' && <span className="shrink-0 text-meta text-warn">Sign in from {x.agent === 'claude' ? 'Claude Code with /mcp' : 'Codex'}</span>}
      {x.path && <SecondaryButton size="sm" className="shrink-0 opacity-0 group-hover:opacity-100" onClick={() => void window.mira.customize.open(x.path!)}>Open</SecondaryButton>}
    </div>
  )

  return (
    <div className={embedded ? '' : 'absolute inset-0 overflow-y-auto bg-bg'}>
      <div className={embedded ? 'px-6 pb-4' : 'px-6 pt-4 pb-16'}>
        <div className="flex items-center gap-3">
          {!embedded && <h1 className="text-heading font-semibold tracking-title text-text">Customize</h1>}
          <span className="text-body text-text-3">What your agents can use{project ? `, in ${project.name}` : ''}. Read from their own config.</span>
          <SecondaryButton size="sm" className="ml-auto" icon={<RefreshCw size={12} />} onClick={load}>Refresh</SecondaryButton>
        </div>
        <div className="mt-5 flex h-9 items-center gap-2 rounded-sm border border-line px-3 focus-within:border-line-strong">
          <Search size={16} className="text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins, MCP servers, skills, rules" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <div className="mr-2 flex rounded-sm border border-line-strong p-0.5">
            {(['all', 'claude', 'codex'] as const).map((a) => (
              <button key={a} onClick={() => setAgent(a)} className={`flex h-7 items-center gap-1.5 rounded-xs px-2.5 text-meta ${agent === a ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'}`}>
                {a !== 'all' && <AgentIcon id={a} size={12} />}{a === 'all' ? 'All agents' : a === 'claude' ? 'Claude Code' : 'Codex'}
              </button>
            ))}
          </div>
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)}
              className={`flex h-7 items-center gap-1.5 rounded-full border px-3 text-meta ${kind === k.id ? 'border-text-3 bg-surface-2 text-text' : 'border-line text-text-2 hover:border-line-strong hover:text-text'}`}>
              {k.icon}{k.label}<span className="text-text-3 tnum">{count(k.id)}</span>
            </button>
          ))}
        </div>

        {attention.length > 0 && (
          <>
            <div className="mt-6 mb-2 text-body text-text">Needs attention <span className="text-text-3 tnum">{attention.length}</span></div>
            <div className="rounded-md border border-line">{attention.map(row)}</div>
          </>
        )}
        <div className="mt-6 mb-2 text-body text-text">Ready <span className="text-text-3 tnum">{rest.length}</span></div>
        <div className="rounded-md border border-line">
          {rest.length ? rest.map(row) : <div className="px-4 py-8 text-center text-body text-text-3">Nothing here yet</div>}
        </div>
      </div>
    </div>
  )
}
