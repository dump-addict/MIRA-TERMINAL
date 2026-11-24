/* A file tab : Monaco (the VS Code editor), in Mira's colours and code font, saved with ⌘S or automatically */
import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { settingsNow, useSettings } from './settings'
import { isLight } from './appearance'
import { setDictationTarget } from './dictation'

// Monaco's language services run in workers bundled with the app : nothing is loaded from the network
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}
// the editor checks syntax but not types : a single file has no project around it
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })

/* Mira's theme for Monaco, read from the tokens in force */
function defineTheme(): string {
  const v = (n: string) => {
    const probe = document.createElement('i'); probe.style.color = `var(--mira-${n})`; document.body.appendChild(probe)
    const rgb = getComputedStyle(probe).color; probe.remove()
    const m = rgb.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']
    return '#' + m.slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('')
  }
  const light = isLight(settingsNow())
  monaco.editor.defineTheme('mira', {
    base: light ? 'vs' : 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': v('bg'), 'editor.foreground': v('text'), 'editorLineNumber.foreground': v('text-3'), 'editorLineNumber.activeForeground': v('text-2'),
      'editor.lineHighlightBackground': v('surface-1'), 'editor.lineHighlightBorder': v('surface-1'), 'editor.selectionBackground': light ? '#00000020' : '#ffffff22',
      'editorCursor.foreground': v('text'), 'editorIndentGuide.background1': v('line'), 'editorIndentGuide.activeBackground1': v('line-strong'),
      'editorWidget.background': v('bg'), 'editorWidget.border': v('line-strong'), 'editorSuggestWidget.background': v('bg'), 'editorSuggestWidget.border': v('line-strong'),
      'editorSuggestWidget.selectedBackground': v('surface-2'), 'scrollbarSlider.background': light ? '#00000018' : '#ffffff14', 'minimap.background': v('bg')
    }
  })
  return 'mira'
}

const LANGS: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', py: 'python', sol: 'sol', rs: 'rust', go: 'go', sh: 'shell', zsh: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'ini', env: 'ini', sql: 'sql', java: 'java', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', xml: 'xml', svg: 'xml' }
const langOf = (path: string) => { const n = path.split('/').pop() ?? ''; if (/^\.env/.test(n)) return 'ini'; if (n === 'Dockerfile') return 'dockerfile'; return LANGS[n.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext' }

const options = (s: ReturnType<typeof settingsNow>): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions => ({
  fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mira-font-code').trim() || 'Menlo, monospace',
  fontSize: s?.editorFontSize ?? 13, lineHeight: Math.round((s?.editorFontSize ?? 13) * 1.55), tabSize: s?.editorTabSize ?? 2,
  wordWrap: s?.editorWordWrap ? 'on' : 'off', minimap: { enabled: !!s?.editorMinimap }, lineNumbers: s?.editorLineNumbers === false ? 'off' : 'on',
  renderWhitespace: s?.editorWhitespace ? 'all' : 'selection', smoothScrolling: !s?.reduceMotion, cursorSmoothCaretAnimation: s?.reduceMotion ? 'off' : 'on',
  padding: { top: 12 }, scrollBeyondLastLine: false, automaticLayout: true, fontLigatures: true, renderLineHighlight: 'all', stickyScroll: { enabled: true }
})

export function EditorView({ file, active, onDirty }: { file: string; active: boolean; onDirty: (dirty: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const saved = useRef('')
  const [error, setError] = useState<string>()
  const st = useSettings()
  const timer = useRef<number>(0)

  const save = async () => {
    const e = ed.current; if (!e) return
    const text = e.getValue()
    if (text === saved.current) return
    if (await window.mira.files.write(file, text)) { saved.current = text; onDirty(false) }
  }

  useEffect(() => {
    let alive = true
    void window.mira.files.read(file).then((r) => {
      if (!alive || !host.current) return
      if (r.error || r.text === undefined) { setError(r.error ?? 'Cannot open this file'); return }
      saved.current = r.text
      const model = monaco.editor.createModel(r.text, langOf(file), monaco.Uri.file(file))
      const e = monaco.editor.create(host.current, { model, theme: defineTheme(), ...options(settingsNow()) })
      ed.current = e
      e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save())
      e.onDidChangeModelContent(() => {
        const dirty = e.getValue() !== saved.current
        onDirty(dirty)
        // auto save : a second after the last key, if so set
        clearTimeout(timer.current)
        if (dirty && settingsNow()?.editorAutoSave === 'delay') timer.current = window.setTimeout(() => void save(), 1000)
      })
      e.onDidBlurEditorText(() => { if (settingsNow()?.editorAutoSave === 'focus') void save() })
      // dictated text lands at the cursor of the focused editor
      e.onDidFocusEditorText(() => setDictationTarget((t) => { const sel = e.getSelection(); if (sel) e.executeEdits('dictation', [{ range: sel, text: t, forceMoveMarkers: true }]) }))
    })
    const retheme = () => { if (ed.current) monaco.editor.setTheme(defineTheme()) }
    window.addEventListener('mira-theme', retheme)
    return () => { alive = false; window.removeEventListener('mira-theme', retheme); clearTimeout(timer.current); const m = ed.current?.getModel(); ed.current?.dispose(); m?.dispose(); ed.current = null }
    // one editor per tab, for the life of the tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  useEffect(() => { ed.current?.updateOptions(options(st)) }, [st])
  useEffect(() => { if (active) setTimeout(() => { ed.current?.layout(); ed.current?.focus() }, 0) }, [active])

  return (
    <div className="absolute inset-0" style={{ visibility: active ? 'visible' : 'hidden' }}>
      {error ? <div className="grid h-full place-items-center text-body text-text-3">{error}</div> : <div ref={host} className="absolute inset-0" />}
    </div>
  )
}
