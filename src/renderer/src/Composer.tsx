/* The message box under an agent's terminal : only a front. The keyboard stays in the terminal, so every command,
   shortcut and menu of the agent works as in a plain terminal (/, @, !, history, Esc, Ctrl C, Shift Tab…).
   The box shows, live, what the agent has in its own input line (read from its screen), in the shape of the agent's app
   (Claude's box, ChatGPT's pill for Codex, Gemini's box) and in the colours of Mira's theme.
   Files, screenshots and dictation are typed into the agent's input like a paste. */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, LoaderCircle, Mic, Paperclip, Plus, ScanLine, Square, SquareTerminal } from 'lucide-react'
import { isMac, kbd } from './platform'

export type Span = { text: string; dim: boolean; tone?: 'warn' | 'bad' | 'ok' | 'accent' }
export type InputView = { lines: Span[][]; caret: { line: number; col: number } | null; footer: Span[][] }
export type Status = { model?: string; effort?: string; mode?: string }

// a path as the agent reads it : inside the project as @relative/path, else the full path (quoted when it has spaces)
const IMG = /\.(png|jpe?g|gif|webp)$/i
export const refOf = (p: string, cwd?: string) => (cwd && p.startsWith(cwd + '/') && !IMG.test(p) ? '@' + p.slice(cwd.length + 1) : /\s/.test(p) ? `"${p}"` : p)

/* one line of the agent's input ; every piece says its row and where it starts, so a click can be turned into a cursor move */
function Line({ spans, caret, row }: { spans: Span[]; caret?: number; row: number }) {
  if (caret === undefined) {
    let at = 0
    return <div className="min-h-5" data-r={row}>{spans.map((s, j) => { const c = at; at += [...s.text].length; return <span key={j} data-c={c} className={s.dim ? 'text-text-3' : ''}>{s.text}</span> })}</div>
  }
  // the caret drawn where the agent has it
  const flat = spans.flatMap((s) => [...s.text].map((ch) => ({ ch, dim: s.dim })))
  const at = Math.min(caret, flat.length)
  return (
    <div className="min-h-5" data-r={row}>
      {flat.slice(0, at).map((c, k) => <span key={k} data-c={k} className={c.dim ? 'text-text-3' : ''}>{c.ch}</span>)}
      <span className="relative inline-block w-0 align-top"><span className="mira-caret absolute top-[3px] -left-px h-[15px] w-px bg-text" /></span>
      {flat.slice(at).map((c, k) => <span key={k + at} data-c={k + at} className={c.dim ? 'text-text-3' : ''}>{c.ch}</span>)}
    </div>
  )
}
// the key a typed key stands for in a terminal, for the first key after a selection
const SEQ: Record<string, string> = { Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b', ArrowLeft: '\x1b[D', ArrowRight: '\x1b[C', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', Delete: '\x1b[3~' }

const toneCls = (s: Span) => (s.tone === 'warn' ? 'text-warn' : s.tone === 'bad' ? 'text-bad' : s.tone === 'ok' ? 'text-ok' : s.tone === 'accent' ? 'text-text' : s.dim ? 'text-text-3' : 'text-text-2')
/* the agent's footer, word for word (mode, warnings, context left, hints…), its left and right parts kept apart */
function Footer({ lines }: { lines: Span[][] }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 pt-1 pb-0.5 text-meta">
      {lines.map((l, i) => {
        // a run of 3+ spaces splits the line into its left and right parts, as the agent lays them out
        const parts: Span[][] = [[]]
        for (const sp of l) {
          const bits = sp.text.split(/(\s{3,})/)
          bits.forEach((b, k) => { if (k % 2) parts.push([]); else if (b) parts[parts.length - 1].push({ ...sp, text: b }) })
        }
        const kept = parts.filter((p) => p.length)
        return (
          <div key={i} className="flex min-h-4 items-center justify-between gap-4 whitespace-pre">
            {kept.map((p, k) => <span key={k} className="truncate">{p.map((sp, j) => <span key={j} className={toneCls(sp)}>{sp.text}</span>)}</span>)}
          </div>
        )
      })}
    </div>
  )
}

export function Composer({ agent, view, status, focused, showFooter, paste, keys, focusTerm, cwd, voice, onRaw }: {
  agent: string; view: InputView | null; status: Status; focused: boolean; showFooter?: boolean; paste: (t: string) => void; keys: (seq: string) => void
  focusTerm: () => void; cwd?: string; voice: 'off' | 'listening' | 'working'; onRaw: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  // while you dictate : the words heard so far, in grey after what is typed ; gone when the final text is written
  const [heard, setHeard] = useState('')
  useEffect(() => { const h = (e: Event) => setHeard((e as CustomEvent<string>).detail); window.addEventListener('mira-voice-partial', h); return () => window.removeEventListener('mira-voice-partial', h) }, [])
  useEffect(() => { if (voice === 'off') setHeard('') }, [voice])
  const add = (paths: string[]) => { const t = paths.filter(Boolean).map((p) => refOf(p, cwd)).join(' '); if (t) paste(t + ' '); focusTerm() }
  const ready = !!view?.lines.some((l) => l.some((s) => !s.dim && s.text.trim()))
  const codex = agent === 'codex', gemini = agent === 'gemini', pill = codex || gemini
  const lines = view?.lines.length ? view.lines : [[{ text: '', dim: true }]]

  /* the mouse in the text : a click puts the agent's cursor there (as left and right arrows : the up arrow would bring back its history),
     a drag selects, and ⌘C copies ; the next key goes back to the agent */
  const boxRef = useRef<HTMLDivElement>(null)
  const [ghost, setGhost] = useState<{ line: number; col: number; at: number; until: number } | null>(null)
  const real = !!view?.lines.some((l) => l.some((s) => !s.dim && s.text))
  const offsetOf = (row: number, col: number) => (view ? view.lines.slice(0, row).reduce((a, l) => a + l.reduce((b, s) => b + [...s.text].length, 0), 0) + col : 0)
  const place = (x: number, y: number) => {
    if (!view?.caret || !real) return
    const r = document.caretRangeFromPoint?.(x, y), node = r?.startContainer
    const span = (node?.nodeType === 3 ? node.parentElement : (node as HTMLElement | null))?.closest('[data-c]') as HTMLElement | null
    const line = span?.closest('[data-r]') as HTMLElement | null
    if (!span || !line || !r) return
    const row = Number(line.dataset.r), col = Number(span.dataset.c) + (node?.nodeType === 3 ? r.startOffset : 0)
    const diff = offsetOf(row, col) - offsetOf(view.caret.line, view.caret.col)
    if (diff) setGhost({ line: row, col, at: offsetOf(row, col), until: Date.now() + 1500 })
    // in small bursts : an agent reading a long burst of arrows at once drops some of them
    const step = diff > 0 ? '\x1b[C' : '\x1b[D'
    let left = Math.min(2000, Math.abs(diff))
    const burst = () => { const n = Math.min(6, left); left -= n; keys(step.repeat(n)); if (left > 0) setTimeout(burst, 14) }
    if (left) burst()
  }
  const up = (e: React.MouseEvent) => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && boxRef.current?.contains(sel.anchorNode)) { boxRef.current.focus({ preventScroll: true }); return }
    place(e.clientX, e.clientY); focusTerm()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if ((isMac ? e.metaKey : e.ctrlKey) && (e.key === 'c' || e.key === 'C')) return   // the browser copies the selection
    if ((isMac ? e.metaKey : e.ctrlKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); const r = document.createRange(); r.selectNodeContents(boxRef.current!); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); return }
    const seq = SEQ[e.key] ?? (e.key.length === 1 && !e.metaKey && !e.ctrlKey ? e.key : null)
    window.getSelection()?.removeAllRanges(); focusTerm()
    if (seq) { e.preventDefault(); keys(seq) }
  }
  // the click's caret stays until the agent's caret reaches it (or a moment has passed)
  const agentAt = view?.caret ? offsetOf(view.caret.line, view.caret.col) : -1
  useEffect(() => {
    if (!ghost) return
    if (agentAt === ghost.at) { setGhost(null); return }
    const t = setTimeout(() => setGhost(null), Math.max(0, ghost.until - Date.now()))
    return () => clearTimeout(t)
  }, [ghost, agentAt])
  const caretAt = ghost ?? view?.caret ?? null
  const text = (
    <div ref={boxRef} tabIndex={-1} onMouseUp={up} onKeyDown={onKey} className="min-w-0 flex-1 cursor-text py-[3px] text-body whitespace-pre-wrap break-words text-text outline-none select-text">
      {lines.map((l, i) => <Line key={i} row={i} spans={l} caret={focused && caretAt?.line === i ? caretAt.col : undefined} />)}
      {heard && voice !== 'off' && <div className="min-h-5 text-text-3">{heard}</div>}
    </div>
  )
  const btn = pill ? 'grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-2 hover:bg-surface-3 hover:text-text' : 'grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-2 hover:bg-surface-3 hover:text-text'
  const plus = (
    <div className="relative shrink-0">
      <button onClick={() => setMenu((m) => !m)} title="Add files and more" className={`${btn} ${menu ? 'bg-surface-3 text-text' : ''}`}><Plus size={16} strokeWidth={1.75} /></button>
      {menu && (
        <div onMouseLeave={() => setMenu(false)} className="absolute bottom-10 left-0 z-30 w-64 rounded-lg border border-line-strong bg-surface-2 p-1 shadow-[var(--mira-shadow-float)]">
          <button onClick={() => { setMenu(false); void window.mira.composer.pick(cwd).then(add) }} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body text-text hover:bg-surface-3">
            <Paperclip size={15} className="text-text-2" />Add files and photos
          </button>
          <button onClick={() => { setMenu(false); void window.mira.composer.screenshot().then((p) => p && add([p])) }} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body text-text hover:bg-surface-3">
            <ScanLine size={15} className="text-text-2" />Take a screenshot
          </button>
        </div>
      )}
    </div>
  )
  const dictate = () => { focusTerm(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: isMac, ctrlKey: !isMac, shiftKey: !isMac })) }
  const mic = voice === 'listening'
    ? <button onClick={dictate} title={kbd('Stop and write (⌘E)')} className="flex h-7 shrink-0 items-center gap-2 rounded-full bg-bad/15 px-2.5 text-meta text-bad hover:bg-bad/25"><span className="relative grid h-2.5 w-2.5 place-items-center"><span className="absolute h-full w-full animate-ping rounded-full bg-bad/60" /><Square size={9} fill="currentColor" /></span>Listening</button>
    : voice === 'working' ? <span title="Writing what you said" className="grid h-7 w-7 shrink-0 place-items-center text-text-2"><LoaderCircle size={15} className="animate-spin" /></span>
    : <button onClick={dictate} title={kbd('Dictate (⌘E)')} className={btn}><Mic size={15} strokeWidth={1.75} /></button>
  const raw = <button onClick={onRaw} title="Show the plain terminal" className={btn}><SquareTerminal size={15} strokeWidth={1.75} /></button>
  const send = (
    <button onClick={() => { keys('\r'); focusTerm() }} disabled={!ready} title="Send (↵)"
      className={`grid shrink-0 place-items-center disabled:bg-surface-3 disabled:text-text-3 ${agent === 'claude' ? 'bg-[var(--mira-agent-claude)] text-white hover:brightness-110' : 'bg-accent text-accent-text hover:bg-accent-hover'} ${pill ? 'h-8 w-8 rounded-full' : 'h-7 w-7 rounded-md'}`}><ArrowUp size={16} strokeWidth={2} /></button>
  )
  const model = status.model && (
    <button onClick={() => { paste('/model'); keys('\r'); focusTerm() }} title="Change the model"
      className={`flex shrink-0 items-center gap-1.5 text-body hover:text-text ${pill ? 'h-8 rounded-full pr-2.5 pl-3 text-text-2 hover:bg-surface-3' : 'h-6 rounded-md px-2 text-text hover:bg-surface-2'}`}>
      {status.model}{status.effort && <span className="text-text-3">{status.effort}</span>}{pill && <ChevronDown size={13} />}
    </button>
  )
  const drop = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files].map((f) => window.mira.composer.pathOf(f))) }
  }

  // Codex and Gemini : a pill (ChatGPT's and Gemini's shape)
  if (pill) return (
    <div className="shrink-0 px-3 pt-2 pb-3" {...drop}>
      <div className={`flex items-end gap-1 border bg-surface-2 ${gemini ? 'min-h-[52px] p-2.5' : 'min-h-[44px] p-1.5'} ${lines.length > 1 ? 'rounded-[26px]' : 'rounded-full'} ${over || focused ? 'border-line-strong' : 'border-line'}`}>
        {plus}
        <div className="flex min-w-0 flex-1 self-center px-1.5">{text}</div>
        {model}
        {/* Gemini's app : the send button only shows once there is something to send */}
        {raw}{mic}{(!gemini || ready) && send}
      </div>
      {showFooter && !!view?.footer.length && <Footer lines={view.footer} />}
    </div>
  )

  // Claude (and the others) : Claude's box, with the project, the model, its effort and the mode under it
  return (
    <div className="shrink-0 px-3 pt-2 pb-1.5" {...drop}>
      <div className={`rounded-xl border bg-surface-2 p-1.5 ${over || focused ? 'border-line-strong' : 'border-line'}`}>
        <div className="flex min-h-[40px] px-2 pt-1">{text}</div>
        <div className="flex items-center gap-1 pt-1">
          {plus}
          <span className="ml-auto" />
          {raw}{mic}{send}
        </div>
      </div>
      {(status.model || (showFooter && !!view?.footer.length)) && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{showFooter && !!view?.footer.length && <Footer lines={view.footer} />}</div>
          {agent === 'claude' && model && <div className="shrink-0 pt-0.5 pr-1">{model}</div>}
        </div>
      )}
    </div>
  )
}

/* what the agent shows at the bottom of its screen : its model, its effort, its permission mode */
const MODES: [RegExp, string][] = [[/bypass permissions on/i, 'Bypass'], [/auto mode on/i, 'Auto'], [/accept edits on/i, 'Accept edits'], [/plan mode on/i, 'Plan']]
const lastOf = (t: string, re: RegExp) => { let m: RegExpExecArray | null = null, x: RegExpExecArray | null; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((x = g.exec(t))) m = x; return m }
const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : undefined)
export function statusOf(agent: string, t: string, tail: string): Status {
  if (agent === 'claude') {
    return {
      model: lastOf(t, /\b(Opus|Sonnet|Haiku|Fable) \d+(?:\.\d+)?/)?.[0],
      effort: cap(lastOf(t, /\b(low|medium|high|xhigh|max) · \/effort/)?.[1]),
      mode: MODES.find(([re]) => re.test(tail))?.[1] ?? 'Ask'
    }
  }
  if (agent === 'codex') {
    // its footer : "GPT-6.2-Sol default · ~/project" (older versions : "model: gpt-5 high")
    const m = lastOf(t, /([A-Za-z][\w.-]*)\s+(default|minimal|low|medium|high|xhigh)\s+\S\s+[~/]/) ?? lastOf(t, /model:\s+([\w.-]+)(?:\s+(minimal|low|medium|high|xhigh))?/)
    return { model: m?.[1], effort: m?.[2] && m[2] !== 'default' ? cap(m[2]) : undefined }
  }
  if (agent === 'gemini') {
    // its footer names the model in use, in its own words : "Auto (Gemini 3)", "Auto", or a model id
    const m = lastOf(tail, /\b(Auto(?: \(Gemini [\d.]+\))?|gem(?:ini|ma)-[\w.-]+)(?![-\w])/)
    return { model: m?.[1] }
  }
  return {}
}
