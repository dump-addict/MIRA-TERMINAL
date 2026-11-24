/* A project's home view : its map, served by the project's map server */
import { useEffect, useRef, useState } from 'react'
import { PrimaryButton, SecondaryButton } from './ui'
import { settingsNow } from './settings'
import { themeVars } from './appearance'
import type { Analysis, ProjectInfo } from '../../preload'

// the open map's frame : the app talks to it (follow activity, focus a block)
let frame: HTMLIFrameElement | null = null
// messages go only to the map's own origin, and only messages from it are accepted
const originOf = () => { try { return frame ? new URL(frame.src).origin : null } catch { return null } }
export function postToMap(msg: Record<string, unknown>): void { const o = originOf(); if (o) frame?.contentWindow?.postMessage(msg, o) }
export const fromMap = (e: MessageEvent): boolean => !!frame && e.source === frame.contentWindow && e.origin === originOf()

const STAGES = ['Inventory', 'Preparing', 'Reading the code', 'Drawing the diagram', 'Finishing']

type Props = { project: ProjectInfo; visible: boolean; onGitInit: () => void; onTrust: () => void }

export function MapView({ project, visible, onGitInit, onTrust }: Props) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => { frame = ref.current; return () => { if (frame === ref.current) frame = null } })
  // the app's theme reaches the map : same colours, same tint
  useEffect(() => {
    const send = () => postToMap({ type: 'mira:theme', vars: themeVars() })
    window.addEventListener('mira-theme', send)
    return () => window.removeEventListener('mira-theme', send)
  }, [])
  // files that change in the project : the map lights up the block being worked on
  useEffect(() => window.mira.map.onActivity((root, files) => { if (root === project.path && settingsNow()?.mapFollow !== false) postToMap({ type: 'mira:activity', files }) }), [project.path])

  // the diagram : the agent reads the code and replaces the folder map ; this band shows where it is
  const [an, setAn] = useState<Analysis | null>(null)
  const [, tick] = useState(0)
  const [done, setDone] = useState('')
  useEffect(() => {
    let alive = true
    setAn(null); setDone('')
    void window.mira.analysis.get(project.path).then((a) => { if (alive) setAn((c) => c ?? a) })
    const off = window.mira.analysis.onState((root, a) => {
      if (root !== project.path) return
      setAn(a)
      // just finished : say so, with the time it took
      if (a.state === 'done' && a.startedAt) { const sec = Math.round((Date.now() - a.startedAt) / 1000); setDone(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`) }
      if (a.state === 'running') setDone('')
    })
    return () => { alive = false; off() }
  }, [project.path])
  useEffect(() => { if (an?.state !== 'running') return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [an?.state])
  const failed = !!an && an.state === 'error' && an.placeholder, folders = !!an && an.state !== 'running' && an.placeholder && !failed
  // "Diagram ready" stays a few seconds, then leaves the line to what is left to do
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(''), 9000); return () => clearTimeout(t) }, [done])
  const since = an?.state === 'running' ? Math.max(0, Math.round((Date.now() - an.startedAt) / 1000)) : 0
  const clock = `${Math.floor(since / 60)}:${String(since % 60).padStart(2, '0')}`

  useEffect(() => {
    let alive = true
    setUrl(undefined); setError(undefined)
    void window.mira.map.open(project.path).then((r) => { if (!alive) return; if (r.url) setUrl(r.url); else setError(r.error || 'Map unavailable') })
    return () => { alive = false }
  }, [project.path])

  return (
    <div className="absolute inset-0 flex flex-col" style={{ visibility: visible ? 'visible' : 'hidden' }}>
      {/* the diagram being drawn : its name and clock, the five stages across the whole width, what the agent is doing right now */}
      {an?.state === 'running' && (
        <div className="shrink-0 border-b border-line bg-bg px-4 pt-3 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 whitespace-nowrap text-title font-semibold tracking-title text-text">Drawing the diagram</span>
            <span className="ml-auto shrink-0 font-mono text-body text-text tnum">{clock}</span>
            <SecondaryButton size="sm" className="shrink-0" onClick={() => void window.mira.analysis.stop(project.path)}>Stop</SecondaryButton>
          </div>
          <div className="mt-3 flex items-center gap-1">
            {STAGES.map((_, n) => (
              <span key={n} className="h-[3px] flex-1 overflow-hidden rounded-full bg-line-strong">
                <span className={`block h-full rounded-full bg-text ${n + 1 < (an.phase || 1) ? 'w-full' : n + 1 === (an.phase || 1) ? 'mira-stage w-full' : 'w-0'}`} />
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="shrink-0 whitespace-nowrap text-meta font-medium text-text">{STAGES[(an.phase || 1) - 1]}</span>
            <span className="shrink-0 text-meta text-text-3 tnum">{an.phase || 1} of {STAGES.length}</span>
            <span className="min-w-0 flex-1 truncate text-right font-mono text-meta text-text-2">{an.step}</span>
          </div>
        </div>
      )}
      {/* everything else on one line : what the map is right now on the left, what can be done about it on the right */}
      {an?.state !== 'running' && (done || failed || folders || !project.trusted || !project.git) && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-bg px-4">
          <span className="shrink-0 whitespace-nowrap text-body font-medium text-text">{done ? 'Diagram ready' : failed ? 'Diagram failed' : folders ? 'Folders only' : !project.trusted ? 'Checks are off' : 'Not a git repository'}</span>
          <span className={`min-w-0 flex-1 truncate text-meta ${failed && !done ? 'text-bad' : 'text-text-3'}`} title={failed ? an?.error : undefined}>
            {done ? `Drawn in ${done}` : failed ? an?.error : folders ? 'Your agent can draw the real diagram' : !project.trusted ? 'Its map can run commands and network calls' : ''}
          </span>
          {!done && (failed || folders) && <PrimaryButton size="sm" className="shrink-0" onClick={() => void window.mira.analysis.start(project.path)}>{failed ? 'Try again' : 'Generate diagram'}</PrimaryButton>}
          {!project.trusted && <SecondaryButton size="sm" className="shrink-0" title="Run this repository's map checks (shell commands, network calls) and let your agent draw its diagram. Only for code you trust." onClick={onTrust}>Trust project</SecondaryButton>}
          {!project.git && <SecondaryButton size="sm" className="shrink-0" onClick={onGitInit}>Initialize git</SecondaryButton>}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {url && <iframe ref={ref} src={url} onLoad={() => postToMap({ type: 'mira:theme', vars: themeVars() })} title="Project map" className="absolute inset-0 h-full w-full border-0 bg-bg" />}
        {!url && !error && <div className="absolute inset-0 grid place-items-center text-body text-text-3">Loading map</div>}
        {error && <div className="absolute inset-0 grid place-items-center text-body text-text-2">{error}</div>}
      </div>
    </div>
  )
}
