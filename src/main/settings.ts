/* Settings : one file in the app folder, every value checked against its type before it is saved */
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AGENT_IDS = ['claude', 'codex', 'gemini', 'cursor', 'copilot', 'grok'] as const
export type PermissionMode = 'default' | 'edits' | 'plan' | 'yolo'
type AgentMode = PermissionMode | 'inherit'

export const DEFAULTS = {
  // privacy and security
  usageMeters: true,
  confirmPaste: true,
  lockYolo: false,
  hideEmail: false,
  gpu: true,
  protectSecrets: true,
  // keep the computer awake
  keepAwake: 'agents' as 'off' | 'agents' | 'always',
  // agents : the default one, the mode for all, protections (Claude Code and Codex enforce them)
  defaultAgent: 'claude',
  agentMode: 'default' as PermissionMode,
  blockWritesOutside: true,
  blockReadsOutside: false,
  askBeforeDelete: true,
  // a light mention on commits and pull requests an agent makes from Mira
  markCommits: true,
  // editor
  editorAutoSave: 'delay' as 'off' | 'delay' | 'focus',
  editorFontSize: 13,
  editorTabSize: 2,
  editorWordWrap: false,
  editorMinimap: false,
  editorLineNumbers: true,
  editorWhitespace: false,
  showExplorer: false,
  // the right panel : the project's map or its files, open or closed
  rightPanel: 'map' as 'off' | 'map' | 'files' | 'tasks',
  rightWidth: 420,
  // voice : dictation on this Mac
  voiceModel: 'parakeet-v3',
  // the language of the Mac by default (macOS's first preferred language) ; 'auto' lets the model guess
  voiceLanguage: 'system',
  voiceMode: 'toggle' as 'toggle' | 'hold',
  voiceFillers: true,
  voiceVocabulary: '',
  voiceMic: '',
  // network : a proxy for Mira and for the terminals and agents it starts
  proxyUrl: '',
  noProxy: 'localhost,127.0.0.1',
  http1: false,
  // general
  restoreSession: true,
  resumeAgents: true,
  tabOrder: 'recent' as 'recent' | 'fixed',
  openIn: 'Finder' as 'Finder' | 'Visual Studio Code' | 'Cursor' | 'Zed' | 'Terminal' | 'iTerm',
  confirmCloseRunning: true,
  launchAtLogin: false,
  menuBarIcon: false,
  summonShortcut: 'off' as 'off' | 'Alt+Space' | 'Control+`' | 'Command+Shift+Space',
  startPage: 'last' as 'welcome' | 'last',
  confirmQuit: true,
  newTerminalDir: 'project' as 'project' | 'home',
  shell: '',
  // appearance : the Mira look is the default ; the rest is the user's choice
  theme: 'mira' as 'system' | 'light' | 'mira' | 'dim' | 'contrast',
  tint: 'none' as 'none' | 'mint' | 'amber' | 'violet' | 'rose' | 'cyan' | 'custom',
  tintColor: '#7c3aed',
  fontSmoothing: true,
  scrollSpeed: 1,
  scrollOnInput: true,
  hideMouse: false,
  tintAmount: 40,
  uiFont: 'Geist' as 'Geist' | 'System' | 'Inter' | 'Atkinson Hyperlegible',
  reduceMotion: false,
  showAppName: true,
  // terminal look
  termPalette: 'mira' as 'mira' | 'ghostty' | 'onedark' | 'dracula' | 'solarized' | 'gruvbox',
  // how an agent's tab says it works, finished (until seen) or waits for you
  tabWorking: 'ring' as 'ring' | 'breathe' | 'light' | 'shimmer' | 'timer',
  tabDone: 'markg' as 'markg' | 'ringg' | 'ringw' | 'markw' | 'bold' | 'word' | 'green',
  tabNeeds: 'mark' as 'mark' | 'name' | 'both',
  taskPalette: 'mira' as 'mira' | 'pastel' | 'vivid' | 'sunset' | 'forest' | 'mono',
  termBg: '',
  termFg: '',
  termCursor: '',
  fontWeight: 'normal' as 'light' | 'normal' | 'medium' | 'bold',
  padX: 14,
  padY: 10,
  inactiveDim: 0,
  dividerWidth: 1,
  uiZoom: 100,
  showUsage: true,
  usageAs: 'used' as 'used' | 'left',
  showPorts: true,
  showAwake: true,
  // terminal, more
  fontFamily: 'Menlo' as 'Menlo' | 'SF Mono' | 'Monaco' | 'JetBrains Mono' | 'Fira Code' | 'Geist Mono',
  letterSpacing: 0,
  rightClickPaste: false,
  bell: 'notify' as 'off' | 'visual' | 'notify',
  minContrast: 1,
  // notifications
  notifyEnabled: true,
  notifyDone: true,
  notifyNeeds: true,
  notifyOnlyAway: true,
  notifySound: true,
  notifySoundName: 'Glass' as 'default' | 'none' | 'Glass' | 'Ping' | 'Pop' | 'Hero' | 'Submarine' | 'Purr' | 'Tink' | 'Funk',
  dockBadge: true,
  // terminal
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: 'block' as 'block' | 'bar' | 'underline',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  optionAsMeta: false,
  // map
  mapEnabled: true,
  // a project's diagram drawn by the agent by itself, the first time the project opens
  mapAuto: true,
  mapOnRight: true,
  mapFollow: true,
  // agents : one entry per agent
  agents: Object.fromEntries(AGENT_IDS.map((id) => [id, { show: true, mode: 'inherit' as AgentMode, args: '', model: '' }])) as Record<string, { show: boolean; mode: AgentMode; args: string; model: string }>
}
export type Settings = typeof DEFAULTS

const file = () => join(app.getPath('userData'), 'settings.json')
let cache: Settings | null = null

const pick = <T>(v: unknown, d: T, ok: (x: unknown) => boolean): T => (ok(v) ? (v as T) : d)
const bool = (x: unknown) => typeof x === 'boolean'
const num = (lo: number, hi: number) => (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
// an empty string (use the theme) or a #rrggbb colour
const hex = (x: unknown) => typeof x === 'string' && (x === '' || /^#[0-9a-f]{6}$/i.test(x))
const oneOf = (...l: string[]) => (x: unknown) => typeof x === 'string' && l.includes(x)

/* anything unknown or out of range falls back to its default */
function clean(raw: Record<string, unknown>): Settings {
  const d = DEFAULTS
  const ag = (raw.agents ?? {}) as Record<string, Record<string, unknown>>
  return {
    usageMeters: pick(raw.usageMeters, d.usageMeters, bool),
    confirmPaste: pick(raw.confirmPaste, d.confirmPaste, bool),
    lockYolo: pick(raw.lockYolo, d.lockYolo, bool),
    hideEmail: pick(raw.hideEmail, d.hideEmail, bool),
    gpu: pick(raw.gpu, d.gpu, bool),
    protectSecrets: pick(raw.protectSecrets, d.protectSecrets, bool),
    keepAwake: pick(raw.keepAwake, d.keepAwake, oneOf('off', 'agents', 'always')),
    markCommits: pick(raw.markCommits, d.markCommits, bool),
    defaultAgent: pick(raw.defaultAgent, d.defaultAgent, oneOf(...AGENT_IDS)),
    agentMode: pick(raw.agentMode, d.agentMode, oneOf('default', 'edits', 'plan', 'yolo')),
    blockWritesOutside: pick(raw.blockWritesOutside, d.blockWritesOutside, bool),
    blockReadsOutside: pick(raw.blockReadsOutside, d.blockReadsOutside, bool),
    askBeforeDelete: pick(raw.askBeforeDelete, d.askBeforeDelete, bool),
    editorAutoSave: pick(raw.editorAutoSave, d.editorAutoSave, oneOf('off', 'delay', 'focus')),
    editorFontSize: pick(raw.editorFontSize, d.editorFontSize, num(9, 24)),
    editorTabSize: pick(raw.editorTabSize, d.editorTabSize, num(1, 8)),
    editorWordWrap: pick(raw.editorWordWrap, d.editorWordWrap, bool),
    editorMinimap: pick(raw.editorMinimap, d.editorMinimap, bool),
    editorLineNumbers: pick(raw.editorLineNumbers, d.editorLineNumbers, bool),
    editorWhitespace: pick(raw.editorWhitespace, d.editorWhitespace, bool),
    showExplorer: pick(raw.showExplorer, d.showExplorer, bool),
    rightPanel: pick(raw.rightPanel, d.rightPanel, oneOf('off', 'map', 'files', 'tasks')),
    rightWidth: pick(raw.rightWidth, d.rightWidth, num(260, 900)),
    voiceModel: pick(raw.voiceModel, d.voiceModel, oneOf('parakeet-v3', 'whisper-turbo', 'whisper-small', 'whisper-base', 'whisper-tiny')),
    voiceLanguage: pick(raw.voiceLanguage, d.voiceLanguage, oneOf('system', 'auto', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl')),
    voiceMode: pick(raw.voiceMode, d.voiceMode, oneOf('toggle', 'hold')),
    voiceFillers: pick(raw.voiceFillers, d.voiceFillers, bool),
    voiceVocabulary: pick(raw.voiceVocabulary, d.voiceVocabulary, (x) => typeof x === 'string' && x.length < 4000),
    voiceMic: pick(raw.voiceMic, d.voiceMic, (x) => typeof x === 'string' && x.length < 300),
    proxyUrl: pick(raw.proxyUrl, d.proxyUrl, (x) => typeof x === 'string' && (x === '' || /^(https?|socks5?):\/\/[\w.\-:@%]+(:\d+)?\/?$/.test(x))),
    noProxy: pick(raw.noProxy, d.noProxy, (x) => typeof x === 'string' && x.length < 500 && /^[\w.,*\-: ]*$/.test(x)),
    http1: pick(raw.http1, d.http1, bool),
    restoreSession: pick(raw.restoreSession, d.restoreSession, bool),
    resumeAgents: pick(raw.resumeAgents, d.resumeAgents, bool),
    tabOrder: pick(raw.tabOrder, d.tabOrder, oneOf('recent', 'fixed')),
    openIn: pick(raw.openIn, d.openIn, oneOf('Finder', 'Visual Studio Code', 'Cursor', 'Zed', 'Terminal', 'iTerm')),
    confirmCloseRunning: pick(raw.confirmCloseRunning, d.confirmCloseRunning, bool),
    launchAtLogin: pick(raw.launchAtLogin, d.launchAtLogin, bool),
    menuBarIcon: pick(raw.menuBarIcon, d.menuBarIcon, bool),
    summonShortcut: pick(raw.summonShortcut, d.summonShortcut, oneOf('off', 'Alt+Space', 'Control+`', 'Command+Shift+Space')),
    startPage: pick(raw.startPage, d.startPage, oneOf('welcome', 'last')),
    confirmQuit: pick(raw.confirmQuit, d.confirmQuit, bool),
    newTerminalDir: pick(raw.newTerminalDir, d.newTerminalDir, oneOf('project', 'home')),
    // a custom shell must be an absolute path to a program, nothing else
    shell: pick(raw.shell, d.shell, (x) => typeof x === 'string' && (x === '' || /^\/[\w./+-]+$/.test(x))),
    theme: pick(raw.theme, d.theme, oneOf('system', 'light', 'mira', 'dim', 'contrast')),
    tint: pick(raw.tint, d.tint, oneOf('none', 'mint', 'amber', 'violet', 'rose', 'cyan', 'custom')),
    tintColor: pick(raw.tintColor, d.tintColor, (x) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)),
    fontSmoothing: pick(raw.fontSmoothing, d.fontSmoothing, bool),
    scrollSpeed: pick(raw.scrollSpeed, d.scrollSpeed, num(0.25, 5)),
    scrollOnInput: pick(raw.scrollOnInput, d.scrollOnInput, bool),
    hideMouse: pick(raw.hideMouse, d.hideMouse, bool),
    tintAmount: pick(raw.tintAmount, d.tintAmount, num(0, 100)),
    uiFont: pick(raw.uiFont, d.uiFont, oneOf('Geist', 'System', 'Inter', 'Atkinson Hyperlegible')),
    reduceMotion: pick(raw.reduceMotion, d.reduceMotion, bool),
    showAppName: pick(raw.showAppName, d.showAppName, bool),
    termPalette: pick(raw.termPalette, d.termPalette, oneOf('mira', 'ghostty', 'onedark', 'dracula', 'solarized', 'gruvbox')),
    tabWorking: pick(raw.tabWorking, d.tabWorking, oneOf('ring', 'breathe', 'light', 'shimmer', 'timer')),
    tabDone: pick(raw.tabDone, d.tabDone, oneOf('markg', 'ringg', 'ringw', 'markw', 'bold', 'word', 'green')),
    tabNeeds: pick(raw.tabNeeds, d.tabNeeds, oneOf('mark', 'name', 'both')),
    taskPalette: pick(raw.taskPalette, d.taskPalette, oneOf('mira', 'pastel', 'vivid', 'sunset', 'forest', 'mono')),
    termBg: pick(raw.termBg, d.termBg, hex),
    termFg: pick(raw.termFg, d.termFg, hex),
    termCursor: pick(raw.termCursor, d.termCursor, hex),
    fontWeight: pick(raw.fontWeight, d.fontWeight, oneOf('light', 'normal', 'medium', 'bold')),
    padX: pick(raw.padX, d.padX, num(0, 48)),
    padY: pick(raw.padY, d.padY, num(0, 48)),
    inactiveDim: pick(raw.inactiveDim, d.inactiveDim, num(0, 60)),
    dividerWidth: pick(raw.dividerWidth, d.dividerWidth, num(1, 4)),
    uiZoom: pick(raw.uiZoom, d.uiZoom, num(80, 150)),
    showUsage: pick(raw.showUsage, d.showUsage, bool),
    usageAs: pick(raw.usageAs, d.usageAs, oneOf('used', 'left')),
    showPorts: pick(raw.showPorts, d.showPorts, bool),
    showAwake: pick(raw.showAwake, d.showAwake, bool),
    fontFamily: pick(raw.fontFamily, d.fontFamily, oneOf('Menlo', 'SF Mono', 'Monaco', 'JetBrains Mono', 'Fira Code', 'Geist Mono')),
    letterSpacing: pick(raw.letterSpacing, d.letterSpacing, num(-2, 4)),
    rightClickPaste: pick(raw.rightClickPaste, d.rightClickPaste, bool),
    bell: pick(raw.bell, d.bell, oneOf('off', 'visual', 'notify')),
    minContrast: pick(raw.minContrast, d.minContrast, num(1, 7)),
    notifyEnabled: pick(raw.notifyEnabled, d.notifyEnabled, bool),
    notifyDone: pick(raw.notifyDone, d.notifyDone, bool),
    notifyNeeds: pick(raw.notifyNeeds, d.notifyNeeds, bool),
    notifySoundName: pick(raw.notifySoundName, d.notifySoundName, oneOf('default', 'none', 'Glass', 'Ping', 'Pop', 'Hero', 'Submarine', 'Purr', 'Tink', 'Funk')),
    dockBadge: pick(raw.dockBadge, d.dockBadge, bool),
    notifyOnlyAway: pick(raw.notifyOnlyAway, d.notifyOnlyAway, bool),
    notifySound: pick(raw.notifySound, d.notifySound, bool),
    fontSize: pick(raw.fontSize, d.fontSize, num(9, 24)),
    lineHeight: pick(raw.lineHeight, d.lineHeight, num(1, 2)),
    cursorStyle: pick(raw.cursorStyle, d.cursorStyle, oneOf('block', 'bar', 'underline')),
    cursorBlink: pick(raw.cursorBlink, d.cursorBlink, bool),
    scrollback: pick(raw.scrollback, d.scrollback, num(1000, 100000)),
    copyOnSelect: pick(raw.copyOnSelect, d.copyOnSelect, bool),
    optionAsMeta: pick(raw.optionAsMeta, d.optionAsMeta, bool),
    mapEnabled: pick(raw.mapEnabled, d.mapEnabled, bool),
    mapAuto: pick(raw.mapAuto, d.mapAuto, bool),
    mapOnRight: pick(raw.mapOnRight, d.mapOnRight, bool),
    mapFollow: pick(raw.mapFollow, d.mapFollow, bool),
    agents: Object.fromEntries(AGENT_IDS.map((id) => {
      const a = ag[id] ?? {}, da = d.agents[id]
      return [id, {
        show: pick(a.show, da.show, bool),
        mode: pick(a.mode, da.mode, oneOf('inherit', 'default', 'edits', 'plan', 'yolo')),
        args: pick(a.args, da.args, (x) => typeof x === 'string' && x.length < 400 && !/[\n\r;&|`$<>]/.test(x)),
        // the model this agent always uses in Mira (its tabs and the diagram) ; empty : the agent's own default
        model: pick(a.model, da.model, (x) => typeof x === 'string' && /^[\w.:[\]-]{0,80}$/.test(x))
      }]
    }))
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  try { cache = clean(JSON.parse(readFileSync(file(), 'utf8'))) } catch { cache = clean({}) }
  return cache
}

let onSaved: ((s: Settings) => void) | null = null
export const whenSaved = (f: (s: Settings) => void) => { onSaved = f }

function save(s: Settings): void {
  cache = s
  onSaved?.(s)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 1))
  for (const w of BrowserWindow.getAllWindows()) { w.webContents.send('settings:changed', s); w.webContents.setZoomFactor(s.uiZoom / 100) }
}

export function registerSettings(): void {
  ipcMain.handle('settings:get', () => getSettings())
  // a partial change, merged then checked ; the saved result is sent back
  ipcMain.handle('settings:set', (_e, patch: Record<string, unknown>) => applySettings(patch))
  ipcMain.handle('settings:reset', () => { save(clean({})); return getSettings() })
}

/* a partial change, merged then checked (also used to import a settings file) */
export function applySettings(patch: Record<string, unknown>): Settings {
  {
    const cur = getSettings()
    const agents = patch.agents && typeof patch.agents === 'object'
      ? Object.fromEntries(Object.entries(cur.agents).map(([id, a]) => [id, { ...a, ...((patch.agents as Record<string, object>)[id] ?? {}) }]))
      : cur.agents
    const next = clean({ ...cur, ...patch, agents })
    // a value that does not pass the checks is dropped : the current one stays, not the default
    for (const k of Object.keys(patch) as (keyof Settings)[]) {
      if (k === 'agents' || !(k in DEFAULTS)) continue
      if (JSON.stringify(patch[k]) !== JSON.stringify(next[k])) (next as Record<string, unknown>)[k] = cur[k]
    }
    for (const [id, a] of Object.entries((patch.agents ?? {}) as Record<string, Record<string, unknown>>)) {
      const n = next.agents[id] as Record<string, unknown> | undefined, c = cur.agents[id] as Record<string, unknown> | undefined
      if (!n || !c || !a || typeof a !== 'object') continue
      for (const f of Object.keys(a)) if (f in n && JSON.stringify(a[f]) !== JSON.stringify(n[f])) n[f] = c[f]
    }
    // skipping every permission prompt is refused while it is locked
    if (next.lockYolo) { for (const a of Object.values(next.agents)) if (a.mode === 'yolo') a.mode = 'inherit'; if (next.agentMode === 'yolo') next.agentMode = 'default' }
    save(next)
    return next
  }
}
