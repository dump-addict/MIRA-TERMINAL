/* Search (⌘K) : one box for actions, open tabs, projects, map blocks and agents */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box, FileCode2, FolderGit2, FolderOpen, GitBranch, Map as MapIcon, Search, SquareTerminal } from 'lucide-react'
import { AgentIcon, listAgents } from './agents'
import { ICON } from './ui'
import type { AgentInfo, ProjectInfo } from '../../preload'

export type PaletteItem = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }
type BlockInfo = { id: string; label: string; kind: string; summary: string }

type Props = {
  onClose: () => void
  projects: ProjectInfo[]; current: ProjectInfo | null
  tabs: { key: number; title: string; icon: ReactNode }[]
  onProject: (p: ProjectInfo) => void; onTab: (key: number) => void; onBlock: (id: string) => void; onFile?: (path: string) => void
  onAgent: (a: AgentInfo) => void; actions: PaletteItem[]
}

const GROUPS = ['Files', 'Actions', 'Tabs', 'Blocks', 'Projects', 'Agents']

export function Palette({ onClose, projects, current, tabs, onProject, onTab, onBlock, onFile, onAgent, actions }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [files, setFiles] = useState<string[]>([])
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { void listAgents().then(setAgents) }, [])
  useEffect(() => { if (current) { void window.mira.map.blocks(current.path).then(setBlocks); void window.mira.files.all(current.path).then(setFiles) } else { setBlocks([]); setFiles([]) } }, [current])

  const items = useMemo(() => {
    const all: PaletteItem[] = [
      ...actions,
      ...tabs.map((t) => ({ id: `t${t.key}`, group: 'Tabs', label: t.title, icon: t.icon, run: () => onTab(t.key) })),
      ...blocks.map((b) => ({ id: `b${b.id}`, group: 'Blocks', label: b.label, hint: b.kind, icon: <Box size={ICON} />, run: () => onBlock(b.id) })),
      ...projects.map((p) => ({ id: `p${p.id}`, group: 'Projects', label: p.name, hint: p.path.replace(/^\/Users\/[^/]+/, '~'),
        icon: p.git ? <FolderGit2 size={ICON} /> : <FolderOpen size={ICON} />, run: () => onProject(p) })),
      ...agents.filter((a) => a.installed).map((a) => ({ id: `a${a.id}`, group: 'Agents', label: `New ${a.label}`, icon: <AgentIcon id={a.id} />, run: () => onAgent(a) }))
    ]
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    // files of the project : letters in order, like ⌘P in an editor ; shown once you type
    const w0 = q.trim().toLowerCase().replace(/\s+/g, '')
    const fileHits: PaletteItem[] = w0 && current && onFile ? files.filter((f) => { let i = 0; for (const c of f.toLowerCase()) if (c === w0[i]) i++; return i === w0.length })
      .sort((a, b) => Number(!a.toLowerCase().includes(w0)) - Number(!b.toLowerCase().includes(w0)) || a.length - b.length).slice(0, 30)
      .map((f) => ({ id: `f${f}`, group: 'Files', label: f.split('/').pop() ?? f, hint: f.split('/').slice(0, -1).join('/'), icon: <FileCode2 size={ICON} />, run: () => onFile(`${current.path}/${f}`) })) : []
    if (!words.length) return all.filter((x) => x.group !== 'Blocks' || all.filter((y) => y.group === 'Blocks').indexOf(x) < 6)
    // every word must appear somewhere ; a match at the start of the name ranks first
    return [...fileHits, ...all.filter((x) => { const t = `${x.label} ${x.hint ?? ''}`.toLowerCase(); return words.every((w) => t.includes(w)) })]
      .sort((a, b) => Number(!b.label.toLowerCase().startsWith(words[0])) - Number(!a.label.toLowerCase().startsWith(words[0])) || GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))
  }, [q, actions, tabs, blocks, projects, agents, files, current, onFile, onTab, onBlock, onProject, onAgent])

  useEffect(() => setSel(0), [q])
  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const pick = (x?: PaletteItem) => { if (x) { onClose(); x.run() } }

  const ordered = q.trim() ? items : GROUPS.flatMap((g) => items.filter((x) => x.group === g))
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/50 pt-[14vh]" onMouseDown={onClose}>
      <div className="h-fit w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-line-strong bg-bg shadow-[var(--mira-shadow-float)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-text-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} placeholder="Search files, tabs, blocks, projects, agents"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(ordered.length - 1, s + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              if (e.key === 'Enter') pick(ordered[sel])
            }}
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none focus-visible:outline-none placeholder:text-text-3" />
          <kbd className="text-meta text-text-3">esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
          {!ordered.length && <div className="px-3 py-6 text-center text-body text-text-3">No match</div>}
          {ordered.map((x, i) => (
            <div key={x.id}>
              {(i === 0 || ordered[i - 1].group !== x.group) && <div className="mira-label px-2.5 pt-2 pb-1">{x.group}</div>}
              <button data-i={i} onMouseMove={() => setSel(i)} onClick={() => pick(x)}
                className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-body text-text ${i === sel ? 'bg-surface-2' : ''}`}>
                <span className="shrink-0 text-text-2">{x.icon}</span>
                <span className="truncate">{x.label}</span>
                {x.hint && <span className="ml-auto shrink-0 truncate pl-4 text-meta text-text-3">{x.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const actionIcons = { terminal: <SquareTerminal size={ICON} />, folder: <FolderOpen size={ICON} />, clone: <GitBranch size={ICON} />, map: <MapIcon size={ICON} /> }
