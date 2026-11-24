/* Appearance : the Mira look (tokens.css) is the default ; a theme, a tint and fonts chosen in settings override a few tokens at runtime */
import type { Settings } from '../../preload'

// themes : Mira (pure black) is tokens.css ; the others override tokens. Light also flips the accent to black and darkens the states.
const LIGHT: Record<string, string> = {
  bg: '#ffffff', chrome: '#fafafa', 'surface-1': '#f7f7f7', 'surface-2': '#f0f0f0', 'surface-3': '#e8e8e8', line: '#e8e8e8', 'line-strong': '#d4d4d4',
  text: '#0a0a0a', 'text-2': '#525252', 'text-3': '#8a8a8a',
  accent: '#0a0a0a', 'accent-hover': '#262626', 'accent-text': '#ffffff', 'accent-soft': 'rgba(0, 0, 0, .05)', 'accent-line': 'rgba(0, 0, 0, .3)',
  ok: '#15803d', warn: '#b45309', bad: '#dc2626', 'ok-line': 'rgba(21, 128, 61, .45)', 'warn-line': 'rgba(180, 83, 9, .45)', 'bad-line': 'rgba(220, 38, 38, .5)', 'bad-soft': 'rgba(220, 38, 38, .08)',
  off: '#a3a3a3', unknown: '#d4d4d4', edge: '#737373',
  'group-1': '#404040', 'group-2': '#7c3aed', 'group-3': '#db2777', 'group-4': '#ea580c', 'group-5': '#c026d3', 'group-6': '#737373', 'group-7': '#ca8a04', 'group-8': '#dc2626'
}
const THEMES: Record<string, Record<string, string>> = {
  mira: {},
  light: LIGHT,
  dim: { bg: '#0d0d0f', chrome: '#0a0a0c', 'surface-1': '#131316', 'surface-2': '#18181c', 'surface-3': '#1f1f24', line: '#26262b', 'line-strong': '#34343a' },
  contrast: { line: '#3a3a3a', 'line-strong': '#5c5c5c', text: '#ffffff', 'text-2': '#d4d4d4', 'text-3': '#a3a3a3', edge: '#bdbdbd' }
}
export const TINTS: Record<Exclude<Settings['tint'], 'none' | 'custom'>, string> = {
  mint: '#45dd8a', amber: '#f5a524', violet: '#a78bfa', rose: '#f472b6', cyan: '#22d3ee'
}
/* task colours : ready-made palettes for the statuses and priorities (only Todo is blue, the user's choice ; Mono has none).
   Order : progress, review, todo, backlog, done, canceled, then urgent, high, medium, low. Mira is tokens.css. */
const TASK_KEYS = ['status-progress', 'status-review', 'status-todo', 'status-backlog', 'status-done', 'status-canceled', 'priority-1', 'priority-2', 'priority-3', 'priority-4']
export const TASK_PALETTES: Record<Settings['taskPalette'], { label: string; c: string[] }> = {
  mira: { label: 'Mira', c: ['#f5a524', '#c4b5fd', '#7cacf8', '#8a8a8a', '#45dd8a', '#f26b6b', '#ff8080', '#ffb366', '#e6cf7a', '#9a9a9a'] },
  pastel: { label: 'Pastel', c: ['#fcd38d', '#d8c8ff', '#bcd4ff', '#8a8a8a', '#a7f3c5', '#fca5a5', '#fca5a5', '#fdc28e', '#fde68a', '#bdbdbd'] },
  vivid: { label: 'Vivid', c: ['#ff9f1a', '#a855f7', '#3b82f6', '#737373', '#22c55e', '#ef4444', '#ef4444', '#f97316', '#eab308', '#a3a3a3'] },
  sunset: { label: 'Sunset', c: ['#fb923c', '#f472b6', '#93c5fd', '#8a7a70', '#a3e635', '#f87171', '#f43f5e', '#fb923c', '#fbbf24', '#a8a29e'] },
  forest: { label: 'Forest', c: ['#e9c46a', '#b5a1e6', '#8ecae6', '#7d8a80', '#6fcf97', '#e07a5f', '#e07a5f', '#f4a261', '#e9c46a', '#8fa397'] },
  mono: { label: 'Mono', c: ['#ffffff', '#cfcfcf', '#a3a3a3', '#5c5c5c', '#8a8a8a', '#5c5c5c', '#ffffff', '#cfcfcf', '#a3a3a3', '#6b6b6b'] }
}
const SURFACES = ['bg', 'chrome', 'surface-1', 'surface-2', 'surface-3', 'line', 'line-strong']
const UI_FONTS: Record<Settings['uiFont'], string> = {
  Geist: '',
  System: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  Inter: '"Inter", -apple-system, system-ui, sans-serif',
  'Atkinson Hyperlegible': '"Atkinson Hyperlegible", "Atkinson Hyperlegible Next", -apple-system, system-ui, sans-serif'
}
const ALL = [...new Set([...SURFACES, ...Object.keys(LIGHT), 'font', ...TASK_KEYS])]

const base = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(`--mira-${n}`).trim()
let originals: Record<string, string> | null = null
let lastVars: Record<string, string> = {}
const dark = window.matchMedia('(prefers-color-scheme: dark)')
let lastSettings: Settings | null = null
dark.addEventListener('change', () => { if (lastSettings?.theme === 'system') applyAppearance(lastSettings) })

/* the theme actually shown : System follows macOS */
export const effectiveTheme = (s: Settings | null): string => (!s ? 'mira' : s.theme === 'system' ? (dark.matches ? 'mira' : 'light') : s.theme)
export const isLight = (s: Settings | null) => effectiveTheme(s) === 'light'
/* the token overrides in force, for the map's frame */
export const themeVars = () => lastVars

export function applyAppearance(s: Settings): void {
  lastSettings = s
  const root = document.documentElement
  // the tokens as tokens.css defines them, read once before any override
  if (!originals) originals = Object.fromEntries(ALL.map((n) => [n, base(n)]))
  for (const n of ALL) root.style.removeProperty(`--mira-${n}`)
  const theme = effectiveTheme(s)
  const vars: Record<string, string> = { ...(THEMES[theme] ?? {}) }
  // tint : a touch of colour mixed into every surface and line (up to 10 %, less on a white theme)
  const tint = s.tint === 'custom' ? s.tintColor : s.tint !== 'none' ? TINTS[s.tint] : null
  if (tint) {
    const pct = Math.round((s.tintAmount / 100) * (theme === 'light' ? 7 : 10) * 10) / 10
    for (const n of SURFACES) vars[n] = `color-mix(in oklab, ${vars[n] ?? originals[n]} ${100 - pct}%, ${tint})`
  }
  if (UI_FONTS[s.uiFont]) vars.font = UI_FONTS[s.uiFont]
  // task colours : the chosen palette (Mira keeps tokens.css) ; on a white theme they are darkened to read on white
  const tp = s.taskPalette && s.taskPalette !== 'mira' ? TASK_PALETTES[s.taskPalette] : null
  TASK_KEYS.forEach((k, i) => {
    const c = tp?.c[i] ?? (theme === 'light' ? TASK_PALETTES.mira.c[i] : null)
    if (c) vars[k] = theme === 'light' ? `color-mix(in oklab, ${c} 70%, black)` : c
  })
  for (const [n, v] of Object.entries(vars)) root.style.setProperty(`--mira-${n}`, v)
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
  root.classList.toggle('reduce-motion', s.reduceMotion)
  // the agent tabs' marks (styles.css reads these)
  root.dataset.tabWork = s.tabWorking ?? 'ring'; root.dataset.tabDone = s.tabDone ?? 'markg'; root.dataset.tabNeeds = s.tabNeeds ?? 'mark'
  root.classList.toggle('no-smoothing', !s.fontSmoothing)
  root.style.setProperty('--mira-inactive-dim', String(s.inactiveDim / 100))
  root.style.setProperty('--mira-divider', `${s.dividerWidth}px`)
  lastVars = vars
  window.dispatchEvent(new CustomEvent('mira-theme', { detail: { vars, light: theme === 'light' } }))
}

// terminal palettes : 16 ANSI colours plus background and foreground
type Pal = { bg?: string; fg?: string; c: string[] }
export const PALETTES: Record<Settings['termPalette'], Pal> = {
  mira: { c: [] },
  ghostty: { bg: '#282c34', fg: '#ffffff', c: ['#1d1f21', '#cc6666', '#b5bd68', '#f0c674', '#81a2be', '#b294bb', '#8abeb7', '#c5c8c6', '#666666', '#d54e53', '#b9ca4a', '#e7c547', '#7aa6da', '#c397d8', '#70c0b1', '#eaeaea'] },
  onedark: { bg: '#21252b', fg: '#abb2bf', c: ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff'] },
  dracula: { bg: '#282a36', fg: '#f8f8f2', c: ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'] },
  solarized: { bg: '#002b36', fg: '#839496', c: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#93a1a1', '#839496', '#657b83', '#6c71c4', '#93a1a1', '#fdf6e3'] },
  gruvbox: { bg: '#1d2021', fg: '#ebdbb2', c: ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'] }
}
const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']

/* the xterm theme : Mira's tokens, then the chosen palette, then the user's own colours */
export function terminalTheme(s: Settings | null): Record<string, string> {
  const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  const t: Record<string, string> = {
    background: v('--mira-bg'), foreground: v('--mira-text'), cursor: v('--mira-text'), cursorAccent: v('--mira-bg'),
    selectionBackground: 'rgba(255,255,255,.18)',
    black: v('--mira-line'), red: v('--mira-bad'), green: v('--mira-ok'), yellow: v('--mira-warn'), blue: '#8ab4f8', magenta: '#c792ea', cyan: '#5fd4e6', white: v('--mira-text'),
    brightBlack: v('--mira-text-3'), brightRed: '#ff8a8a', brightGreen: '#6ff0a6', brightYellow: '#ffc35c', brightBlue: '#a8c7fa', brightMagenta: '#dcb0ff', brightCyan: '#8be6f2', brightWhite: '#ffffff'
  }
  // a tinted or themed surface is mixed by CSS : the terminal needs a plain colour
  const probe = document.createElement('i'); probe.style.color = 'var(--mira-bg)'; document.body.appendChild(probe)
  t.background = getComputedStyle(probe).color; t.cursorAccent = t.background; probe.remove()
  // a white theme with the Mira palette : darker ANSI colours that read on white
  if (isLight(s) && (!s || s.termPalette === 'mira')) {
    Object.assign(t, { selectionBackground: 'rgba(0,0,0,.12)', black: '#262626', red: '#c4262e', green: '#15803d', yellow: '#a16207', blue: '#1d4ed8', magenta: '#9333ea', cyan: '#0e7490', white: '#737373',
      brightBlack: '#525252', brightRed: '#dc2626', brightGreen: '#16a34a', brightYellow: '#ca8a04', brightBlue: '#2563eb', brightMagenta: '#a855f7', brightCyan: '#0891b2', brightWhite: '#a3a3a3' })
  }
  const p = s ? PALETTES[s.termPalette] : null
  if (p?.c.length) p.c.forEach((c, i) => { t[NAMES[i]] = c })
  if (p?.bg) { t.background = p.bg; t.cursorAccent = p.bg }
  if (p?.fg) { t.foreground = p.fg; t.cursor = p.fg }
  if (s?.termBg) { t.background = s.termBg; t.cursorAccent = s.termBg }
  if (s?.termFg) t.foreground = s.termFg
  if (s?.termCursor) t.cursor = s.termCursor
  return t
}
export const WEIGHTS: Record<Settings['fontWeight'], { n: number; b: number }> = { light: { n: 300, b: 600 }, normal: { n: 400, b: 700 }, medium: { n: 500, b: 700 }, bold: { n: 600, b: 800 } }
