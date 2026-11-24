/* A markdown tab : a plain editor, saved as you type */
import { useEffect, useRef, useState } from 'react'

export function NoteView({ file, active }: { file: string; active: boolean }) {
  const [text, setText] = useState<string>()
  const t = useRef<number>(0)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { void window.mira.notes.read(file).then(setText) }, [file])
  useEffect(() => { if (active) box.current?.focus() }, [active, text === undefined])
  const change = (v: string) => { setText(v); clearTimeout(t.current); t.current = window.setTimeout(() => void window.mira.notes.write(file, v), 400) }
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-line px-4">
        <span className="truncate font-mono text-meta text-text-3">{file.replace(/^\/Users\/[^/]+/, '~')}</span>
      </div>
      <textarea ref={box} value={text ?? ''} onChange={(e) => change(e.target.value)} spellCheck={false} placeholder="# Title"
        className="min-h-0 flex-1 resize-none bg-bg px-6 py-5 font-mono text-body text-text outline-none focus-visible:outline-none select-text placeholder:text-text-3" />
    </div>
  )
}
