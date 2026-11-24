/* Files panel : the project's tree on the right, opened folder by folder, with a filter by name */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, File, FileCode2, FileText, Folder, FolderOpen, RefreshCw, Search } from 'lucide-react'
import { ICON } from './ui'

type Entry = { name: string; path: string; dir: boolean }
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|sol|rs|go|sh|css|scss|html|json|toml|ya?ml|sql|java|rb|php|swift|kt|c|h|cpp)$/i
const iconOf = (e: Entry, open: boolean) => e.dir ? (open ? <FolderOpen size={ICON} /> : <Folder size={ICON} />) : CODE.test(e.name) ? <FileCode2 size={ICON} /> : /\.(md|txt)$/i.test(e.name) ? <FileText size={ICON} /> : <File size={ICON} />

export function Explorer({ root, current, onOpen }: { root: string; current?: string; onOpen: (path: string) => void }) {
  const [kids, setKids] = useState<Record<string, Entry[]>>({})
  const [open, setOpen] = useState<Set<string>>(new Set([root]))
  const [q, setQ] = useState('')
  const [all, setAll] = useState<string[]>([])
  const load = (dir: string) => void window.mira.files.list(dir).then((l) => setKids((k) => ({ ...k, [dir]: l })))
  const refresh = () => { setKids({}); load(root); open.forEach((d) => d !== root && load(d)); if (q) void window.mira.files.all(root).then(setAll) }
  useEffect(() => { setKids({}); setOpen(new Set([root])); load(root) }, [root])
  useEffect(() => { if (q && !all.length) void window.mira.files.all(root).then(setAll) }, [q, root])
  const toggle = (d: string) => setOpen((o) => { const n = new Set(o); if (n.has(d)) n.delete(d); else { n.add(d); if (!kids[d]) load(d) } return n })

  // filter : every letter in order (like ⌘P), shortest paths first
  const hits = useMemo(() => {
    const w = q.trim().toLowerCase()
    if (!w) return []
    const fit = (p: string) => { let i = 0; const l = p.toLowerCase(); for (const c of l) if (c === w[i]) i++; return i === w.length }
    return all.filter(fit).sort((a, b) => Number(!a.toLowerCase().includes(w)) - Number(!b.toLowerCase().includes(w)) || a.length - b.length).slice(0, 200)
  }, [q, all])

  const row = 'flex h-7 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-body'
  const tree = (dir: string, depth: number): React.ReactNode => (kids[dir] ?? []).map((e) => {
    const isOpen = open.has(e.path)
    return (
      <div key={e.path}>
        <button onClick={() => (e.dir ? toggle(e.path) : onOpen(e.path))} title={e.path.slice(root.length + 1)}
          className={`${row} ${current === e.path ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-1 hover:text-text'}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {e.dir ? <ChevronRight size={12} className={`shrink-0 text-text-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} /> : <i className="w-3 shrink-0" />}
          <span className="shrink-0 text-text-3">{iconOf(e, isOpen)}</span>
          <span className="truncate">{e.name}</span>
        </button>
        {e.dir && isOpen && tree(e.path, depth + 1)}
      </div>
    )
  })

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <div className="flex h-8 items-center gap-2 rounded-sm border border-line px-2 focus-within:border-line-strong">
          <Search size={14} className="shrink-0 text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a file" spellCheck={false} onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) onOpen(`${root}/${hits[0]}`); if (e.key === 'Escape') setQ('') }}
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {q ? (hits.length ? hits.map((h) => (
          <button key={h} onClick={() => onOpen(`${root}/${h}`)} title={h} className={`${row} pl-2 text-text-2 hover:bg-surface-1 hover:text-text`}>
            <span className="shrink-0 text-text-3">{iconOf({ name: h, path: h, dir: false }, false)}</span>
            <span className="truncate">{h.split('/').pop()}</span>
            <span className="ml-auto truncate pl-2 text-meta text-text-3">{h.split('/').slice(0, -1).join('/')}</span>
          </button>
        )) : <div className="px-2 py-2 text-body text-text-3">No file found</div>) : tree(root, 0)}
      </div>
      <button onClick={refresh} className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-3 text-meta text-text-3 hover:text-text"><RefreshCw size={12} />Refresh</button>
    </div>
  )
}
