/* Home without a project : open a folder, clone a repository, pick up a recent project */
import { useEffect, useState } from 'react'
import { FolderOpen, FolderPlus, GitBranch, SquareTerminal } from 'lucide-react'
import { Label, PrimaryButton, ICON } from './ui'
import { Backdrop } from './Backdrop'
import type { ProjectInfo } from '../../preload'

type Props = { projects: ProjectInfo[]; onOpen: (p: ProjectInfo) => void; onAddFolder: () => void; onNew: () => void; onTerminal: () => void; say: (t: string) => void }

export function Welcome({ projects, onOpen, onAddFolder, onNew, onTerminal, say }: Props) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => window.mira.projects.onCloneProgress((l) => setProgress(l)), [])

  const clone = async () => {
    if (!url.trim() || busy) return
    setBusy(true); setProgress('')
    const r = await window.mira.projects.clone(url)
    setBusy(false); setProgress('')
    if (!r) return
    if ('error' in r) { say(r.error); return }
    setUrl(''); onOpen(r)
  }

  // frosted : a bird passing behind a tile shows through it, blurred
  const frost = 'bg-[color-mix(in_srgb,var(--mira-bg)_72%,transparent)] backdrop-blur-md'
  const tile = `flex h-11 items-center gap-3 rounded-md border border-line ${frost} px-4 text-left hover:border-line-strong`

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Backdrop />
      <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[640px] flex-col justify-center px-6 pt-10 pb-[12vh]">
        {/* what Mira is for : every project, its agents and its tasks in view, as simply as possible, all in one place */}
        <h1 className="-mx-24 text-center text-display font-semibold tracking-[-0.035em] text-balance text-text">All in view.<br /><span className="text-text-2">Your projects, agents and tasks.</span></h1>

        <div className="mt-9 grid grid-cols-3 gap-2">
          <button onClick={onNew} className={tile}><FolderPlus size={16} className="text-text-2" /><span className="text-body font-medium">New project</span></button>
          <button onClick={onAddFolder} className={tile}><FolderOpen size={16} className="text-text-2" /><span className="text-body font-medium">Open folder</span></button>
          <button onClick={onTerminal} className={tile}><SquareTerminal size={16} className="text-text-2" /><span className="text-body font-medium">New terminal</span></button>
        </div>

        <div className={`mt-2 flex h-11 items-center gap-2 rounded-md border border-line ${frost} pr-2 pl-4 focus-within:border-line-strong`}>
          <GitBranch size={16} className="shrink-0 text-text-2" />
          <input id="clone-url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && clone()} disabled={busy}
            placeholder="https://github.com/owner/repo.git" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
          <PrimaryButton onClick={clone} disabled={!url.trim() || busy}>{busy ? 'Cloning' : 'Clone'}</PrimaryButton>
        </div>
        {busy && progress && <div className="mt-2 truncate font-mono text-meta text-text-3">{progress}</div>}

        {projects.length > 0 && (
          <div className="mt-8">
            <Label className="mb-2 block px-1">Recent</Label>
            <div className="flex flex-col gap-px">
              {projects.slice(0, 8).map((p) => (
                <button key={p.id} onClick={() => onOpen(p)} className="flex h-8 items-center justify-between gap-4 rounded-sm px-2 text-left hover:bg-surface-2">
                  <span className="flex items-center gap-2 text-body text-text"><FolderOpen size={ICON} className="text-text-3" />{p.name}</span>
                  <span className="truncate font-mono text-meta text-text-3">{p.path.replace(/^\/Users\/[^/]+/, '~')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
