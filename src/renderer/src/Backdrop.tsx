/* The home page's backdrop : a few great gulls seen from above, drawn as tiles of characters on a fine grid, at three depths :
   each tile has its own shade of white (no colour, black and white only), the edges fray into light characters, dots trail behind,
   and flocks of tiny birds cross the far sky. The mouse shifts the depths against each other. Still when motion is reduced. */
import { useEffect, useRef } from 'react'

const CELL = 12
// characters of a full tile, and of a cell the bird only brushes
const FULL = ['S', 'X', '%', 't', '8', 'S', 'X', '@', 't', '%', 'S', '#']
const EDGE = ['.', ':', ';', "'", '`', ':', '.']
// depth of a layer : how big, how fast, how bright, and how far the mouse moves it
const LAYERS = [
  { scale: 0.4, speed: 0.75, alpha: 0.5, shift: 14 },
  { scale: 0.56, speed: 1.0, alpha: 0.76, shift: 28 },
  { scale: 0.74, speed: 1.3, alpha: 1, shift: 56 }
]
// heading in degrees (0 = to the right, 90 = down), off = how far from the middle its lane is (-0.5 to 0.5 of the screen)
type Bird = { layer: number; heading: number; off: number; lane: number; beat: number; phase: number; size: number }
// four only, each its own wingspan and course : one far, two in the middle, one near
const BIRDS: Bird[] = [
  { layer: 0, heading: -14, off: -0.34, lane: 0.05, beat: 1.4, phase: 0.0, size: 1.1 },
  { layer: 1, heading: 38, off: -0.22, lane: 0.3, beat: 1.2, phase: 1.2, size: 1.0 },
  { layer: 1, heading: -140, off: -0.3, lane: 0.8, beat: 1.25, phase: 4.0, size: 0.8 },
  { layer: 2, heading: 118, off: -0.2, lane: 0.95, beat: 1.05, phase: 5.6, size: 0.95 }
]
// the bird's outline seen from above, beak towards +x (one unit is one cell at scale 1). Half of each shape : the other half mirrors it.
type Pt = [number, number]
const mirror = (half: Pt[]): Pt[] => [...half, ...half.slice().reverse().map(([x, y]): Pt => [x, -y])]
const BODY: Pt[] = mirror([[11.2, 0], [10.2, 0.7], [8.7, 1.25], [6.9, 1.15], [4, 1.85], [-2, 1.95], [-6, 1.25], [-8, 1.35], [-11.6, 3.3], [-12.8, 1.7], [-12.3, 0]])
// one wing fully spread (on the +y side), a gull's : long and narrow, pushed forward to the wrist, then swept back to a point
const WING: Pt[] = [[3.4, 1.4], [5.6, 8.5], [3.4, 15], [-2.4, 22.6], [-3.6, 20.2], [-2.6, 14.5], [-1.4, 9.5], [-3.4, 5], [-3.2, 1.4]]
const inside = (poly: Pt[], x: number, y: number) => {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
// a steady pseudo-random number for a cell
const hash = (x: number, y: number, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n) }

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, cols = 0, rows = 0, raf = 0, last = 0
    let fields: Float32Array[] = []
    let ink = '#ededed', paper = '#000000'
    const colours = () => { const s = getComputedStyle(document.documentElement); ink = s.getPropertyValue('--mira-text').trim() || ink; paper = s.getPropertyValue('--mira-bg').trim() || paper }
    const size = () => {
      const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1
      w = r.width; h = r.height
      cv.width = Math.round(w * d); cv.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0)
      cols = Math.ceil(w / CELL) + 10; rows = Math.ceil(h / CELL) + 10
      fields = LAYERS.map(() => new Float32Array(cols * rows))
    }
    // the mouse, eased : each depth follows it by its own amount
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const move = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); mouse.tx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5; mouse.ty = (e.clientY - r.top) / Math.max(1, r.height) - 0.5 }

    // where a bird is at time t (in cells) and which way it points : it crosses the screen along its heading, swaying a little, and comes back round
    /* The gulls wander : each keeps a heading that drifts on its own slow rhythms, so it curves, turns back and banks,
       like the fish of the reference ; out of the screen it comes back in on the other side. */
    type Gull = Bird & { x: number; y: number; h: number; dh: number }
    let gulls: Gull[] = []
    const placeGulls = () => {
      // spread over the screen from the start (golden ratio steps), never two in the same place
      gulls = BIRDS.map((c, i) => ({ ...c, x: ((i * 0.618 + 0.1) % 1) * cols, y: ((i * 0.382 + 0.27) % 1) * rows, h: (c.heading * Math.PI) / 180, dh: 0 }))
    }
    /* A gull crosses the sky on a steady course, drifting only slightly ; the small flocks scatter when it passes close. */
    const steer = (g: Gull, t: number, dt: number) => {
      const L = LAYERS[g.layer], i = gulls.indexOf(g)
      // each keeps roughly its heading : only a slight, slow drift to one side then the other, never a circle
      const dive = 0
      let turn = (Math.sin(t * 0.05 + g.phase) * 0.6 + Math.sin(t * 0.023 + g.phase * 2.3) * 0.4) * 0.05
      // they never fly into each other : strongly at the same depth, gently across depths, so they never pile up
      for (const o of gulls) if (o !== g) {
        const ox = g.x - o.x, oy = g.y - o.y, od = Math.hypot(ox, oy), r = 26 * Math.max(L.scale, LAYERS[o.layer].scale)
        if (od < r && od > 0.01) { let a2 = Math.atan2(oy, ox) - g.h; a2 = Math.atan2(Math.sin(a2), Math.cos(a2)); turn += a2 * (1 - od / r) * (o.layer === g.layer ? 0.08 : 0.04) }
      }
      // it is a backdrop : the turning rate eases towards what it wants, never a sharp turn
      g.dh += (Math.max(-0.08, Math.min(0.08, turn)) - g.dh) * Math.min(1, dt * 0.5)
      g.h += g.dh * dt
      // it soars slowly on its round and goes faster in a dive
      const v = (1.5 + dive * 1.5) * L.speed
      g.x += Math.cos(g.h) * v * dt; g.y += Math.sin(g.h) * v * dt
      const m = 40 * L.scale
      if (g.x < -m) g.x = cols + m; else if (g.x > cols + m) g.x = -m
      if (g.y < -m) g.y = rows + m; else if (g.y > rows + m) g.y = -m
    }
    const at = (g: Gull) => ({ x: g.x, y: g.y, tilt: g.h, turn: Math.max(-1, Math.min(1, g.dh * 2.2)) })

    /* The far flocks : small birds that keep together around a point drifting across the sky,
       and scatter away from a gull that comes near, then gather again behind it (the reference's small fish). */
    type Small = { f: number; x: number; y: number; vx: number; vy: number; slot: [number, number]; beat: number }
    let smalls: Small[] = []
    const FLOCKS = 11
    const placeSmalls = () => {
      smalls = []
      for (let g = 0; g < FLOCKS; g++) {
        // mostly loose bands, long and full ; now and then a small V of a few birds
        const vee = hash(g, 5) > 0.75, n = vee ? 5 + Math.floor(hash(g, 4) * 5) : 14 + Math.floor(hash(g, 4) * 16), dir = hash(g, 7) > 0.5 ? 1 : -1
        const len = 10 + hash(g, 13) * 8, thick = 2.5 + hash(g, 14) * 2
        for (let d = 0; d < n; d++) {
          const side = d % 2 ? 1 : -1, rank = Math.ceil(d / 2)
          // a band : denser in its middle, thinning out at both ends
          const u = hash(g, d, 8) - 0.5, spread = u * Math.abs(u) * 2
          const slot: [number, number] = vee ? [-dir * rank * 0.9, side * rank * 0.6] : [spread * len, (hash(g, d, 9) - 0.5) * thick * (1 - Math.abs(spread) * 0.6)]
          smalls.push({ f: g, x: hash(g, 1) * cols + slot[0], y: hash(g, 2) * rows + slot[1], vx: 0, vy: 0, slot, beat: 6 + hash(g, d, 10) * 3 })
        }
      }
    }
    const flockCentre = (g: number, t: number) => {
      // migrating : steady, all across the sky, each flock on its own height and way
      const C = cols + 40, dir = hash(g, 7) > 0.5 ? 1 : -1, speed = 1.1 + hash(g, 3) * 0.8
      return { x: ((((((g + 0.5) / FLOCKS) * C + dir * t * speed) % C) + C) % C) - 20, y: rows * (0.12 + 0.76 * ((g * 0.618) % 1)) + Math.sin(t * 0.08 + g) * 3 }
    }
    const moveSmalls = (t: number, dt: number) => {
      for (const b of smalls) {
        const c = flockCentre(b.f, t), tx = c.x + b.slot[0], ty = c.y + b.slot[1]
        // back to its place in the flock (a far jump, when the flock wraps round, is taken at once)
        if (Math.abs(tx - b.x) > cols / 2 || Math.abs(ty - b.y) > rows / 2) { b.x = tx; b.y = ty; b.vx = b.vy = 0; continue }
        let ax = (tx - b.x) * 1.2, ay = (ty - b.y) * 1.2
        // away from every gull close by, the closer the stronger
        for (const g of gulls) {
          const dx = b.x - g.x, dy = b.y - g.y, d2 = dx * dx + dy * dy, r = 16 * LAYERS[g.layer].scale + 6
          if (d2 < r * r && d2 > 0.01) { const d = Math.sqrt(d2), push = (1 - d / r) * 60; ax += (dx / d) * push; ay += (dy / d) * push }
        }
        b.vx = (b.vx + ax * dt) * 0.9; b.vy = (b.vy + ay * dt) * 0.9
        const sp = Math.hypot(b.vx, b.vy), max = 9
        if (sp > max) { b.vx *= max / sp; b.vy *= max / sp }
        b.x += b.vx * dt; b.y += b.vy * dt
      }
    }
    let prev = 0
    const draw = (now: number) => {
      const t = now / 1000, dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0
      prev = now
      if (!gulls.length && cols) { placeGulls(); placeSmalls() }
      for (const g of gulls) steer(g, t, dt)
      moveSmalls(t, dt)
      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06
      ctx.clearRect(0, 0, w, h)
      ctx.font = `700 ${CELL - 3}px ui-monospace, "SF Mono", Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const f of fields) f.fill(0)
      const frames: { li: number; x: number; y: number; cs: number; sn: number; k: number; b: number }[] = []
      for (const c of gulls) {
        const L = LAYERS[c.layer], f = fields[c.layer], k = L.scale * c.size
        const o = at(c), cs = Math.cos(o.tilt), sn = Math.sin(o.tilt)
        // wings, as a gull beats them : a long downstroke with the wings fully out and pushed a little forward,
        // then a quicker upstroke where the wrist bends, the hand folds back and the wing shortens. Between series of beats, a glide.
        const gliding = Math.sin(t * 0.21 + c.phase * 1.7) > 0.3
        const cyc = (((t * c.beat + c.phase) / (Math.PI * 2)) % 1 + 1) % 1
        const down = cyc < 0.58
        const fold = gliding ? 0.06 + 0.04 * Math.sin(t * 0.9 + c.phase) : down ? 0 : Math.sin((Math.PI * (cyc - 0.58)) / 0.42) ** 0.8
        const fwd = gliding ? 0 : down ? Math.sin((Math.PI * cyc) / 0.58) * 2.4 : -fold * 1.2
        const b = fold
        // banking into a turn : the inner wing is held shorter than the outer one
        const wingOf = (bank: number): Pt[] => WING.map(([x, y]) => {
          const p = y / 22.6, hand = Math.max(0, p - 0.38) / 0.62
          return [x + fwd * p - fold * (hand * 11 + p * 2.5), y * (1 - fold * (0.22 * p + 0.36 * hand)) * (1 + bank)]
        })
        const wingR = wingOf(o.turn * 0.13), wingL = wingOf(-o.turn * 0.13)
        frames.push({ li: c.layer, x: o.x, y: o.y, cs, sn, k, b })
        const R = 28 * k
        const x0 = Math.max(0, Math.floor(o.x - R)), x1 = Math.min(cols - 1, Math.ceil(o.x + R)), y0 = Math.max(0, Math.floor(o.y - R)), y1 = Math.min(rows - 1, Math.ceil(o.y + R))
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          // four samples in the cell : a cell half covered by the bird gets a lighter character, so the edges stay soft
          let v = 0
          for (let q = 0; q < 4; q++) {
            const wx = gx + (q & 1 ? 0.28 : -0.28) - o.x, wy = gy + (q & 2 ? 0.28 : -0.28) - o.y
            const lx = (wx * cs + wy * sn) / k, ly = (-wx * sn + wy * cs) / k
            // the body is the brightest ; the wings fade a little towards their tips
            v += inside(BODY, lx, ly) ? 1 : inside(ly >= 0 ? wingR : wingL, lx, Math.abs(ly)) ? 0.92 - (Math.abs(ly) / 22.6) ** 2 * 0.35 : 0
          }
          v /= 4
          const i = gy * cols + gx
          if (v > f[i]) f[i] = v
        }
      }
      const tick = Math.floor(t * 1.5)
      LAYERS.forEach((L, li) => {
        // the depths shift by whole cells, so every tile stays inside a square of the grid
        const ox = Math.round((-mouse.x * L.shift) / CELL) * CELL - 5 * CELL, oy = Math.round((-mouse.y * L.shift) / CELL) * CELL - 5 * CELL, f = fields[li]
        const glyph = (ch: string, x: number, y: number) => ctx.fillText(ch, ox + x * CELL + CELL / 2, oy + y * CELL + CELL / 2 + 0.5)
        // the far sky : the small birds, each one a single character in a square of the grid, like the big ones are tiles of it.
        // The character follows the wing beat (v wings up, - level, ^ wings down) ; a fleeing bird beats faster.
        if (li === 0) {
          ctx.fillStyle = ink
          smalls.forEach((b, d) => {
            const gx = Math.round(b.x), gy = Math.round(b.y)
            if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return
            const rush = Math.min(1, Math.hypot(b.vx, b.vy) / 6)
            const flap = Math.sin(t * b.beat * (1 + rush) + d * 1.7)
            ctx.globalAlpha = 0.32 + hash(b.f, d, 12) * 0.22 + rush * 0.2
            glyph(flap > 0.35 ? 'v' : flap < -0.35 ? '^' : '-', gx, gy)
          })
        }
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const v = f[y * cols + x]
          if (v < 0.1) continue
          const px = ox + x * CELL, py = oy + y * CELL
          // each cell of the grid has its own grain : the bird shows through it as it passes, and a tile changes now and then
          const flick = hash(x, y, tick + li) > 0.93 ? tick : 0
          const grain = hash(x, y, 11 + li + flick), pick = hash(x, y, 23 + flick)
          if (v < 0.55) {
            // the frayed edge : a light character, no tile
            ctx.globalAlpha = L.alpha * (0.45 + v); ctx.fillStyle = ink
            glyph(grain > 0.8 ? 'o' : EDGE[Math.floor(pick * EDGE.length)], x, y)
            continue
          }
          // shades of white only : most tiles in the mid tones, a few almost black, a few pure white
          const shade = pick > 0.84 ? 1 : pick < 0.05 ? 0.2 : 0.42 + 0.52 * grain * (0.6 + 0.4 * v)
          ctx.globalAlpha = L.alpha * shade
          ctx.fillStyle = ink
          ctx.fillRect(px + 1, py + 1, CELL - 1, CELL - 1)
          // a dark character on a light tile, a light one on a dark tile
          const dark = shade > 0.5
          ctx.globalAlpha = dark ? 0.9 : L.alpha * 0.9
          ctx.fillStyle = dark ? paper : ink
          glyph(FULL[Math.floor(pick * 997) % FULL.length], x, y)
        }
      })
      ctx.globalAlpha = 1
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || now - last < 40) return   // 25 frames a second is plenty for a backdrop
      last = now; draw(now)
    }
    const again = () => { colours(); if (still) draw(4000) }
    const ro = new ResizeObserver(() => { size(); gulls = []; if (still) draw(4000) })
    colours(); size(); ro.observe(cv)
    window.addEventListener('mira-theme', again)
    if (still) draw(4000)
    else { window.addEventListener('mousemove', move); raf = requestAnimationFrame(loop) }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('mousemove', move); window.removeEventListener('mira-theme', again) }
  }, [])

  // the birds stay visible behind the middle of the page, only quieter
  const fade = 'radial-gradient(ellipse 34% 26% at 50% 47%, rgba(0,0,0,.42) 30%, #000 100%)'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* the fine grid the characters sit on */}
      <div className="absolute inset-0" style={{ opacity: 0.38, backgroundImage: 'linear-gradient(var(--mira-line) 1px, transparent 1px), linear-gradient(90deg, var(--mira-line) 1px, transparent 1px)', backgroundSize: `${CELL}px ${CELL}px`, maskImage: fade, WebkitMaskImage: fade }} />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ maskImage: fade, WebkitMaskImage: fade }} />
    </div>
  )
}
