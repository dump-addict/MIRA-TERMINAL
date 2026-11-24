/* A terminal: xterm.js wired to a pty in the main process */
import { useEffect, useRef, useState } from 'react'
import { settingsNow, useSettings } from './settings'
import { terminalTheme, WEIGHTS } from './appearance'
import { setDictationTarget } from './dictation'
import { keepScreen } from './peek'
import { Composer, statusOf, type InputView, type Status, type Span } from './Composer'
import { MessageSquare } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { isMac } from './platform'

// the terminal font chosen in settings, then the design's code font as a fallback
const fontOf = (f?: string) => {
  const base = getComputedStyle(document.documentElement).getPropertyValue('--mira-font-code').trim() || 'Menlo, monospace'
  return f ? `"${f}", ${base}` : base
}

type Props = { composer?: { agent: string; placeholder: string }; onPty?: (id: string) => void; cwd?: string; run?: string; agent?: string; label?: string; active: boolean; focus?: boolean; onTitle?: (t: string) => void; onExit?: () => void }

export function TerminalView({ composer, onPty, cwd, run, agent, label, active, focus = active, onTitle, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ term: Terminal; fit: FitAddon; id?: string } | null>(null)
  const pasting = useRef(false)
  const [ring, setRing] = useState(false)
  const labelRef = useRef(label)
  labelRef.current = label
  const [ask, setAsk] = useState<string | null>(null)
  // with a message box (a front on the agent's own input) : the plain terminal can come back at any time
  const [raw, setRaw] = useState(false)
  // a pane too short for the box and a few lines above it : the plain terminal shows instead, the box comes back when there is room
  const wrap = useRef<HTMLDivElement>(null)
  const [short, setShort] = useState(false)
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => { const h = el.clientHeight, w = el.clientWidth; if (h && w) setShort((s) => (s ? h < 300 || w < 260 : h < 280 || w < 240)) })
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const front = !!composer && !raw && !short
  const frontRef = useRef<{ agent: string } | null>(null)
  frontRef.current = front && composer ? { agent: composer.agent } : null
  // the agent's input box on screen, covered by Mira's (its rows, in pixels) ; its menus and suggestions stay visible
  const [cover, setCover] = useState<{ top: number; height: number | null } | null>(null)
  const [view, setView] = useState<InputView | null>(null)
  // a pane too short to show anything above the agent's box : the last lines before it (from the scrollback) are shown in its place
  const [above, setAbove] = useState<string[] | null>(null)
  const [status, setStatus] = useState<Status>({})
  const [voice, setVoice] = useState<'off' | 'listening' | 'working'>('off')
  const st = useSettings()
  // a theme change made outside settings (macOS switching light or dark) : recolour
  useEffect(() => {
    const re = () => { const t = api.current?.term; if (t) t.options.theme = terminalTheme(settingsNow()) }
    window.addEventListener('mira-theme', re)
    return () => window.removeEventListener('mira-theme', re)
  }, [])
  // hide the mouse while typing, back as soon as it moves
  const [typing, setTyping] = useState(false)
  // settings change : open terminals follow at once
  useEffect(() => {
    const t = api.current?.term
    if (!t || !st) return
    t.options.fontSize = st.fontSize; t.options.lineHeight = st.lineHeight; t.options.cursorStyle = st.cursorStyle
    t.options.cursorBlink = st.cursorBlink; t.options.scrollback = st.scrollback; t.options.macOptionIsMeta = st.optionAsMeta
    t.options.fontFamily = fontOf(st.fontFamily); t.options.letterSpacing = st.letterSpacing; t.options.minimumContrastRatio = st.minContrast
    t.options.scrollSensitivity = st.scrollSpeed; t.options.scrollOnUserInput = st.scrollOnInput
    t.options.theme = terminalTheme(st); t.options.fontWeight = WEIGHTS[st.fontWeight].n; t.options.fontWeightBold = WEIGHTS[st.fontWeight].b
    api.current?.fit.fit()
  }, [st])

  useEffect(() => {
    const el = host.current!
    const st = settingsNow()
    const term = new Terminal({
      fontFamily: fontOf(st?.fontFamily), letterSpacing: st?.letterSpacing ?? 0, minimumContrastRatio: st?.minContrast ?? 1,
      fontSize: st?.fontSize ?? 13, lineHeight: st?.lineHeight ?? 1.25, cursorBlink: st?.cursorBlink ?? true, cursorStyle: st?.cursorStyle ?? 'block',
      scrollback: st?.scrollback ?? 10000, scrollSensitivity: st?.scrollSpeed ?? 1, scrollOnUserInput: st?.scrollOnInput ?? true, macOptionIsMeta: st?.optionAsMeta ?? false, allowProposedApi: true, theme: terminalTheme(st), fontWeight: WEIGHTS[st?.fontWeight ?? 'normal'].n, fontWeightBold: WEIGHTS[st?.fontWeight ?? 'normal'].b
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri)))
    term.open(el)
    // Windows and Linux : Ctrl+Shift+C copies, Ctrl+Shift+V pastes (Ctrl+C stays the shell's interrupt) ; macOS uses ⌘
    if (!isMac) term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown' || !ev.ctrlKey || !ev.shiftKey || ev.altKey) return true
      if (ev.code === 'KeyC' && term.hasSelection()) { void navigator.clipboard.writeText(term.getSelection()); return false }
      if (ev.code === 'KeyV') { void navigator.clipboard.readText().then((t) => { if (t) { pasting.current = true; term.paste(t) } }); return false }
      // the app's own shortcuts (Ctrl+Shift+T, +K…) are not typed into the shell
      return false
    })
    fit.fit()
    api.current = { term, fit }
    let id: string | undefined
    let alive = true
    let unkeep = () => {}
    const offData = window.mira.term.onData((tid, data) => { if (tid === id) term.write(data) })
    const offExit = window.mira.term.onExit((tid) => { if (tid === id) onExit?.() })
    window.mira.term.create({ cwd, run, agent, cols: term.cols, rows: term.rows }).then((r) => {
      if (!alive) { window.mira.term.kill(r.id); return }
      id = r.id; api.current!.id = r.id; onPty?.(r.id)
      unkeep = keepScreen(r.id, term)
      if (!run) onTitle?.(r.shell.split('/').pop() || 'terminal')
    })
    term.onData((d) => {
      if (settingsNow()?.hideMouse) setTyping(true)
      if (!id) return
      // a pasted block of several lines waits for the user's OK (it would run each line as a command)
      if (settingsNow()?.confirmPaste !== false && d.length > 1 && /[\r\n]./.test(d.replace(/[\r\n]+$/, '') + '') && pasting.current) {
        pasting.current = false; setAsk(d); return
      }
      pasting.current = false
      window.mira.term.write(id, d)
    })
    el.addEventListener('paste', () => { pasting.current = true }, true)
    // right click pastes, when set (like iTerm and Windows terminals)
    el.addEventListener('contextmenu', (ev) => {
      if (!settingsNow()?.rightClickPaste) return
      ev.preventDefault()
      void navigator.clipboard.readText().then((t) => { if (t) { pasting.current = true; term.paste(t) } })
    })
    // the bell : agents ring it when they finish or need you
    // after each redraw, read the agent's input box on screen : where it is, what is typed in it, where its caret is
    let raf = 0
    const FOOT = /shift\+tab|for shortcuts|\? for|auto mode|accept edits|plan mode|bypass permissions|\/effort|transcript saving|context left|esc to|ctrl\+|for agents|f2 to view|⚠|·\s+~|tokens|update available/i
    const findInput = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const c = frontRef.current
        if (!c) { setCover(null); return }
        const b = term.buffer.active, rows = term.rows
        const L = (r: number) => b.getLine(b.viewportY + r)
        const line = (r: number) => L(r)?.translateToString(true) ?? ''
        const rule = (r: number) => r >= 0 && /^\s*[─━]{8,}\s*$/.test(line(r))
        let start = -1, first = -1, last = -1, end = -1
        for (let r = rows - 1; r >= 1 && start < 0; r--) {
          const t = line(r).trimStart()
          // Claude : "❯ …" right under a rule, closed by the next rule (a numbered "❯ 1." is a menu, left alone)
          if (c.agent !== 'codex' && t.startsWith('❯') && !/^❯\s*\d+\./.test(t) && rule(r - 1)) {
            let k = r + 1; while (k < rows && !rule(k)) k++
            if (k < rows) { start = r - 1; first = r; last = k - 1; end = k }
          }
          // Codex : "› …" in its shaded box, its footer below
          if (c.agent === 'codex' && t.startsWith('›') && !/^›\s*\d+\./.test(t)) {
            let k = r + 1; while (k < rows && line(k).trim() && !FOOT.test(line(k))) k++
            // its box starts a row above ; a rule may sit a few rows higher, covered too
            start = r - 1; for (let u = r - 2; u >= Math.max(0, r - 4); u--) if (rule(u)) { start = u; break }
            first = r; last = k - 1; end = Math.min(k, rows - 1)
          }
        }
        if (start < 0) { setCover(null); setView(null); setAbove(null); return }
        if (start <= 1 && b.viewportY === b.baseY) {
          const out: string[] = []
          for (let i = b.viewportY + start - 1; i >= 0 && out.length < rows; i--) {
            const t = b.getLine(i)?.translateToString(true) ?? ''
            if (!out.length && !t.trim()) continue   // the blank lines right above the box are dropped
            out.unshift(t)
          }
          setAbove((o) => (o && o.length === out.length && o.every((x, k) => x === out[k]) ? o : out))
        } else setAbove(null)
        // what is typed, cell by cell : the agent's own placeholder is dim ; its caret is an inverted cell (or the terminal cursor)
        const lines: Span[][] = []
        let caret: InputView['caret'] = null
        const cell = b.getNullCell()
        for (let r = first; r <= last; r++) {
          const ln = L(r); if (!ln) continue
          const spans: Span[] = []
          const width = ln.translateToString(true).length
          for (let x = 2; x < Math.max(width, 2); x++) {
            ln.getCell(x, cell)
            const ch = cell.getChars() || ' ', dim = !!cell.isDim()
            if (cell.isInverse() && !caret) caret = { line: lines.length, col: x - 2 }
            const lastSpan = spans[spans.length - 1]
            if (lastSpan && lastSpan.dim === dim) lastSpan.text += ch; else spans.push({ text: ch, dim })
          }
          if (!caret && b.cursorY === r && b.viewportY === b.baseY) caret = { line: lines.length, col: Math.max(0, b.cursorX - 2) }
          // trailing spaces off
          const lt = spans[spans.length - 1]; if (lt) lt.text = lt.text.replace(/\s+$/, '')
          lines.push(spans.filter((x) => x.text))
        }
        while (lines.length > 1 && !lines[lines.length - 1].length && caret?.line !== lines.length - 1) lines.pop()
        // the footer under the box, cell by cell with its colours (shown under Mira's box when covered)
        const footer: Span[][] = []
        for (let r = end + 1; r < rows; r++) {
          const ln = L(r); if (!ln) continue
          const width = ln.translateToString(true).length
          if (!width) continue
          const spans: Span[] = []
          for (let x = 0; x < width; x++) {
            ln.getCell(x, cell)
            const ch = cell.getChars() || ' ', dim = !!cell.isDim()
            const p = cell.isFgPalette() ? cell.getFgColor() : -1, rgb = cell.isFgRGB() ? cell.getFgColor() : -1
            const yellowish = rgb >= 0 && ((rgb >> 16) & 255) > 180 && ((rgb >> 8) & 255) > 130 && (rgb & 255) < 120
            const tone: Span['tone'] = p === 3 || p === 11 || yellowish ? 'warn' : p === 1 || p === 9 ? 'bad' : p === 2 || p === 10 ? 'ok' : undefined
            const ls = spans[spans.length - 1]
            if (ls && ls.dim === dim && ls.tone === tone) ls.text += ch; else spans.push({ text: ch, dim, tone })
          }
          // the indent the agent gives its footer is dropped, the rest is kept as is
          if (spans[0]) spans[0].text = spans[0].text.replace(/^\s+/, '')
          footer.push(spans.filter((x) => x.text))
        }
        setView({ lines, caret, footer })
        // below the box : only its footer (then covered too), or a menu or suggestions (then left visible)
        let onlyFoot = true
        for (let r = end + 1; r < rows; r++) { const t = line(r).trim(); if (t && !FOOT.test(t) && !rule(r)) onlyFoot = false }
        const core = (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { height?: number } } } } } })._core
        const h = core?._renderService?.dimensions?.css?.cell?.height || (host.current ? host.current.clientHeight / rows : 0)
        const n = h ? { top: Math.round(start * h), height: onlyFoot ? null : Math.round((end - start + 1) * h) } : null
        setCover((o) => (o?.top === n?.top && o?.height === n?.height ? o : n))
        // the model, effort and mode, from the banner and the last lines
        const all: string[] = []
        for (let i = 0; i < Math.min(12, b.length); i++) all.push(b.getLine(i)?.translateToString(true) ?? '')
        for (let i = Math.max(12, b.length - 80); i < b.length; i++) all.push(b.getLine(i)?.translateToString(true) ?? '')
        const tail = Array.from({ length: rows - end }, (_, i) => line(end + i)).join('\n')
        const ns = statusOf(c.agent, all.join('\n'), tail)
        setStatus((o) => (o.model === ns.model && o.effort === ns.effort && o.mode === ns.mode ? o : ns))
      })
    }
    term.onRender(findInput)
    term.onBell(() => {
      const b = settingsNow()?.bell ?? 'notify'
      if (b === 'off') return
      setRing(true); setTimeout(() => setRing(false), 600)
      if (b === 'notify') void window.mira.notify(labelRef.current || 'Terminal', 'Needs your attention')
    })
    term.onSelectionChange(() => { if (settingsNow()?.copyOnSelect && term.hasSelection()) void navigator.clipboard.writeText(term.getSelection()) })
    term.onResize(({ cols, rows }) => id && window.mira.term.resize(id, cols, rows))
    term.onTitleChange((t) => t && !run && onTitle?.(t))
    const ro = new ResizeObserver(() => { if (el.offsetWidth) fit.fit() })
    ro.observe(el)
    return () => { alive = false; unkeep(); ro.disconnect(); offData(); offExit(); if (id) window.mira.term.kill(id); term.dispose() }
    // a terminal lives as long as its tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (active && api.current) api.current.fit.fit() }, [active])
  // switching front or plain : read the screen again
  useEffect(() => { api.current?.term.refresh(0, (api.current?.term.rows ?? 1) - 1) }, [front])
  // dictation shown on the box's mic while this tab has the focus
  useEffect(() => { if (!focus) return; const h = (e: Event) => setVoice((e as CustomEvent).detail); window.addEventListener('mira-voice', h); return () => { window.removeEventListener('mira-voice', h); setVoice('off') } }, [focus])
  useEffect(() => {
    // the keyboard always stays in the terminal : the message box is only a front
    if (focus && api.current) api.current.term.focus()
    // dictated text is typed into the focused terminal (no Enter : you check it first)
    // (with the message box, the box shows the recording, not the floating pill)
    if (focus) setDictationTarget((t) => { const id = api.current?.id; if (id) window.mira.term.write(id, t) }, front)
  }, [focus, front])
  // text typed into the agent's input as one paste (files, dictation) ; no Enter
  const paste = (t: string) => { const i = api.current?.id; if (i) window.mira.term.write(i, `\x1b[200~${t}\x1b[201~`) }
  const keys = (seq: string) => { const i = api.current?.id; if (i) window.mira.term.write(i, seq) }

  const send = () => { const i = api.current?.id; if (i && ask) window.mira.term.write(i, ask); setAsk(null); api.current?.term.focus() }
  const lines = ask ? ask.replace(/[\r\n]+$/, '').split(/\r\n|\r|\n/).length : 0
  return (
    <div ref={wrap} className="absolute inset-0 flex flex-col" style={{ visibility: active ? 'visible' : 'hidden', background: terminalTheme(st).background }}>
      <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0" onMouseMove={() => typing && setTyping(false)} style={{ cursor: typing ? 'none' : undefined, background: terminalTheme(st).background, padding: `${st?.padY ?? 10}px ${st?.padX ?? 14}px 0` }}>
        <div ref={host} className="relative h-full w-full" />
        {front && cover && <div className="pointer-events-none absolute inset-x-0 overflow-hidden" style={{ top: (st?.padY ?? 10) + cover.top, ...(cover.height === null ? { bottom: 0 } : { height: cover.height }), background: terminalTheme(st).background }}>
          {above && cover.height === null && <div className="absolute inset-x-0 bottom-0 overflow-hidden whitespace-pre" style={{ padding: `0 ${st?.padX ?? 14}px`, color: terminalTheme(st).foreground, fontFamily: fontOf(st?.fontFamily), fontSize: st?.fontSize ?? 13, lineHeight: st?.lineHeight ?? 1.25, letterSpacing: st?.letterSpacing ?? 0 }}>{above.map((l, i) => <div key={i}>{l || ' '}</div>)}</div>}
        </div>}
        {composer && raw && !short && <button onClick={() => setRaw(false)} title="Back to the message box" className="absolute top-2 right-3 z-10 flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 text-meta text-text-2 hover:text-text"><MessageSquare size={13} />Message box</button>}
      </div>
      </div>
      {front && composer && <Composer agent={composer.agent} view={view} status={status} showFooter={cover?.height === null} focused={focus && active} paste={paste} keys={keys} focusTerm={() => api.current?.term.focus()} cwd={cwd} voice={voice} onRaw={() => setRaw(true)} />}
      {ring && <div className="pointer-events-none absolute inset-0 border border-warn" />}
      {ask && (
        <div className="absolute top-3 right-3 z-10 w-80 rounded-md border border-line-strong bg-bg p-3 shadow-[var(--mira-shadow-float)]">
          <div className="text-body text-text">Paste {lines} lines?</div>
          <pre className="mt-2 max-h-28 overflow-auto rounded-sm border border-line p-2 font-mono text-meta text-text-2">{ask.slice(0, 600)}</pre>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => { setAsk(null); api.current?.term.focus() }} className="h-7 rounded-sm px-3 text-body text-text-2 hover:text-text">Cancel</button>
            <button autoFocus onClick={send} className="h-7 rounded-sm bg-accent px-3 text-body text-accent-text">Paste</button>
          </div>
        </div>
      )}
    </div>
  )
}
