/* Colour picker in the Mira look : saturation and brightness square, hue bar, eyedropper, hex and RGB fields */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pipette } from 'lucide-react'

type HSV = { h: number; s: number; v: number }
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) ?? ['', '000000']
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('')
function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}
function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return [f(5) * 255, f(3) * 255, f(1) * 255]
}

/* drag inside an element : x and y from 0 to 1 */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const down = (e: React.PointerEvent) => {
    const el = ref.current!, r = el.getBoundingClientRect()
    const move = (p: PointerEvent | React.PointerEvent) => onMove(clamp((p.clientX - r.left) / r.width), clamp((p.clientY - r.top) / r.height))
    move(e)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return { ref, onPointerDown: down }
}

export function ColorPicker({ value, onChange, onClose }: { value: string; onChange: (hex: string) => void; onClose: () => void }) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(...hexToRgb(value || '#7c3aed')))
  const [hexText, setHexText] = useState(value || '#7c3aed')
  const box = useRef<HTMLDivElement>(null)
  const hex = rgbToHex(...hsvToRgb(hsv))
  const [r, g, b] = hexToRgb(hex)
  const set = (n: HSV) => { setHsv(n); const h = rgbToHex(...hsvToRgb(n)); setHexText(h); onChange(h) }
  const square = useDrag((x, y) => set({ ...hsv, s: x, v: 1 - y }))
  const hue = useDrag((x) => set({ ...hsv, h: x * 359.9 }))
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('mousedown', out))
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc) }
  }, [onClose])
  // the eyedropper picks any colour on screen (Chromium's EyeDropper API)
  const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
  const drop = async () => { if (!ED) return; try { const { sRGBHex } = await new ED().open(); set(rgbToHsv(...hexToRgb(sRGBHex))) } catch { /* cancelled */ } }
  const rgbField = (i: 0 | 1 | 2, label: string) => (
    <label className="flex flex-col items-center gap-1">
      <input value={[r, g, b][i]} inputMode="numeric" onChange={(e) => { const c = [r, g, b]; c[i] = clamp(Number(e.target.value.replace(/\D/g, '')) || 0, 0, 255); set(rgbToHsv(c[0], c[1], c[2])) }}
        className="h-7 w-full rounded-sm border border-line-strong bg-transparent text-center text-body text-text outline-none tnum focus:border-text-3" />
      <span className="text-meta text-text-3">{label}</span>
    </label>
  )
  const thumb = 'pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]'
  return (
    <div ref={box} className="absolute right-0 top-9 z-50 w-64 rounded-md border border-line-strong bg-bg p-3 shadow-[var(--mira-shadow-float)]">
      <div {...square} className="relative h-36 w-full cursor-crosshair touch-none rounded-sm"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}>
        <i className={thumb} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <button onClick={drop} disabled={!ED} title="Pick from the screen" className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-text-2 hover:bg-surface-2 hover:text-text disabled:text-text-3"><Pipette size={14} /></button>
        <i className="h-7 w-7 shrink-0 rounded-full border border-line-strong" style={{ background: hex }} />
        <div {...hue} className="relative h-2.5 flex-1 cursor-pointer touch-none rounded-full"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
          <i className={`${thumb} top-1/2`} style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-1.5">
        <label className="flex flex-col items-center gap-1">
          <input value={hexText} spellCheck={false} onChange={(e) => { setHexText(e.target.value); if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) set(rgbToHsv(...hexToRgb(e.target.value))) }}
            className="h-7 w-full rounded-sm border border-line-strong bg-transparent text-center font-mono text-meta text-text outline-none focus:border-text-3" />
          <span className="text-meta text-text-3">Hex</span>
        </label>
        {rgbField(0, 'R')}{rgbField(1, 'G')}{rgbField(2, 'B')}
      </div>
    </div>
  )
}

/* a swatch that opens the picker */
export function ColorSwatch({ value, on, onChange, title, children }: { value: string; on?: boolean; onChange: (hex: string) => void; title?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button title={title} onClick={() => setOpen((v) => !v)} className={`grid place-items-center ${children ? '' : `h-6 w-6 rounded-full border-2 ${on ? 'border-text' : 'border-line-strong hover:border-text-3'}`}`}
        style={children ? undefined : { background: on ? value : 'conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)' }}>
        {children}
      </button>
      {open && <ColorPicker value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </span>
  )
}
