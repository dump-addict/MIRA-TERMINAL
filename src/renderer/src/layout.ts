/* Panes : a tree of splits whose leaves are tab groups (each pane has its own tabs) */
export type Leaf = { id: string; tabs: number[]; active: number }
export type Split = { id: string; dir: 'right' | 'down'; ratio: number; a: Node; b: Node }
export type Node = Leaf | Split
export type Layout = { root: Node; focus: string }
export type Rect = { l: number; t: number; w: number; h: number } // in % of the content area

// unique across launches : saved layouts come back with their ids, new panes must never take one of them
let seq = 1
const run = Date.now().toString(36)
const uid = () => `n${run}-${seq++}`
export const isLeaf = (n: Node): n is Leaf => 'tabs' in n
export const leaf = (tabs: number[], active = tabs[0] ?? -1, id = uid()): Leaf => ({ id, tabs, active })
export const single = (tabs: number[], id?: string): Layout => { const l = leaf(tabs, tabs[0] ?? -1, id); return { root: l, focus: l.id } }

export function leaves(n: Node): Leaf[] { return isLeaf(n) ? [n] : [...leaves(n.a), ...leaves(n.b)] }
export function splits(n: Node): Split[] { return isLeaf(n) ? [] : [n, ...splits(n.a), ...splits(n.b)] }
export const leafOf = (n: Node, key: number) => leaves(n).find((l) => l.tabs.includes(key))
export const findLeaf = (n: Node, id: string) => leaves(n).find((l) => l.id === id)

/* every node's place on screen */
export function rects(n: Node, r: Rect = { l: 0, t: 0, w: 100, h: 100 }, out = new Map<string, Rect>()): Map<string, Rect> {
  out.set(n.id, r)
  if (!isLeaf(n)) {
    if (n.dir === 'right') {
      const wa = (r.w * n.ratio) / 100
      rects(n.a, { ...r, w: wa }, out); rects(n.b, { ...r, l: r.l + wa, w: r.w - wa }, out)
    } else {
      const ha = (r.h * n.ratio) / 100
      rects(n.a, { ...r, h: ha }, out); rects(n.b, { ...r, t: r.t + ha, h: r.h - ha }, out)
    }
  }
  return out
}

function map(n: Node, f: (n: Node) => Node): Node {
  const m = f(n)
  if (m !== n || isLeaf(m)) return m
  return { ...m, a: map(m.a, f), b: map(m.b, f) }
}

/* a tab leaves its pane ; an empty pane disappears and its neighbour takes the room */
export function removeTab(lay: Layout, key: number): Layout {
  const strip = (n: Node): Node | null => {
    if (isLeaf(n)) {
      if (!n.tabs.includes(key)) return n
      const i = n.tabs.indexOf(key), tabs = n.tabs.filter((k) => k !== key)
      if (!tabs.length) return null
      return { ...n, tabs, active: n.active === key ? tabs[Math.max(0, i - 1)] : n.active }
    }
    const a = strip(n.a), b = strip(n.b)
    if (!a) return b
    if (!b) return a
    return { ...n, a, b }
  }
  const root = strip(lay.root) ?? leaf([])
  const focus = findLeaf(root, lay.focus) ? lay.focus : leaves(root)[0].id
  return { root, focus }
}

export function addTab(lay: Layout, key: number, leafId = lay.focus): Layout {
  // a pane that no longer exists (stale focus) : the tab goes to the first pane, never nowhere
  if (!findLeaf(lay.root, leafId)) leafId = leaves(lay.root)[0].id
  const root = map(lay.root, (n) => (isLeaf(n) && n.id === leafId ? { ...n, tabs: [...n.tabs, key], active: key } : n))
  return { root, focus: leafId }
}

export function selectTab(lay: Layout, key: number): Layout {
  const l = leafOf(lay.root, key)
  if (!l) return lay
  return { root: map(lay.root, (n) => (n.id === l.id ? { ...l, active: key } : n)), focus: l.id }
}

/* split a node (a pane, or the whole screen) and put the tab in the new half */
export function splitWith(lay: Layout, key: number, targetId: string, dir: 'right' | 'down', ratio = 50): Layout {
  const fresh = leaf([key])
  let base = removeTab(lay, key)
  // the target may have vanished when it held only the dragged tab
  if (!findLeaf(base.root, targetId) && targetId !== lay.root.id && !splits(base.root).some((s) => s.id === targetId)) return lay
  const tid = targetId === lay.root.id ? base.root.id : targetId
  const root = map(base.root, (n) => (n.id === tid ? { id: uid(), dir, ratio, a: n, b: fresh } : n))
  base = { root, focus: fresh.id }
  return base
}

export function setRatio(lay: Layout, id: string, ratio: number): Layout {
  return { ...lay, root: map(lay.root, (n) => (n.id === id && !isLeaf(n) ? { ...n, ratio } : n)) }
}

/* a tab dropped on another tab : it moves next to it, in that pane (left or right of it) */
export function moveTab(lay: Layout, key: number, leafId: string, target: number, before: boolean): Layout {
  const from = leafOf(lay.root, key)
  if (!from) return lay
  let out = from.id === leafId ? lay : removeTab(lay, key)
  if (!findLeaf(out.root, leafId)) return lay
  out = { ...out, root: map(out.root, (n) => {
    if (!isLeaf(n) || n.id !== leafId) return n
    const tabs = n.tabs.filter((k) => k !== key)
    const i = tabs.indexOf(target)
    tabs.splice(i < 0 ? tabs.length : before ? i : i + 1, 0, key)
    return { ...n, tabs, active: key }
  }) }
  return { ...out, focus: leafId }
}

/* a saved or damaged layout made sound again : every node has its own id, every tab is in one pane only, no empty pane */
export function repair(lay: Layout): Layout {
  const ids = new Set<string>(), seen = new Set<number>()
  const fix = (n: Node): Node | null => {
    const id = ids.has(n.id) ? uid() : n.id
    ids.add(id)
    if (isLeaf(n)) {
      const tabs = n.tabs.filter((k) => !seen.has(k))
      tabs.forEach((k) => seen.add(k))
      if (!tabs.length) return null
      return { id, tabs, active: tabs.includes(n.active) ? n.active : tabs[0] }
    }
    const a = fix(n.a), b = fix(n.b)
    if (!a) return b
    if (!b) return a
    return { ...n, id, a, b }
  }
  const root = fix(lay.root) ?? leaf([])
  return { root, focus: findLeaf(root, lay.focus) ? lay.focus : leaves(root)[0].id }
}
export const isSound = (lay: Layout): boolean => {
  const all = [...leaves(lay.root).map((l) => l.id), ...splits(lay.root).map((s) => s.id)]
  const tabs = leaves(lay.root).flatMap((l) => l.tabs)
  return new Set(all).size === all.length && new Set(tabs).size === tabs.length
}

/* the least room a branch needs along an axis, in px : each pane keeps its tabs and a few lines (panes side by side add up) */
export function minSize(n: Node, dir: 'right' | 'down'): number {
  if (isLeaf(n)) return dir === 'right' ? 280 : 180
  return n.dir === dir ? minSize(n.a, dir) + minSize(n.b, dir) : Math.max(minSize(n.a, dir), minSize(n.b, dir))
}
