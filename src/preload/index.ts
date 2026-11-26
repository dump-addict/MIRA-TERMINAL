/* Bridge between the UI and the main process: only these functions are exposed */
import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type AgentInfo = { id: string; label: string; cmd: string; installed: boolean; path: string | null }
export type UsageWindow = { used: number; resetsAt: number | null }
export type AgentUsage = { id: string; session: UsageWindow | null; weekly: UsageWindow | null }
export type ProjectInfo = { id: string; name: string; path: string; addedAt: number; openedAt: number; git: boolean; trusted?: boolean }

export type AgentConf = { show: boolean; mode: 'inherit' | 'default' | 'edits' | 'plan' | 'yolo'; args: string; model: string }
export type Account = { id: string; agent: 'claude' | 'codex'; dir: string | null; system: boolean; signedIn: boolean; email: string; plan: string; active: boolean }
export type Analysis = { state: 'idle' | 'running' | 'done' | 'error' | 'stopped'; placeholder: boolean; agent: string; step: string; phase: number; startedAt: number; error: string }
export type TaskStatus = 'backlog' | 'todo' | 'progress' | 'review' | 'done' | 'canceled'
export type Task = { id: string; title: string; description: string; status: TaskStatus; priority: 0 | 1 | 2 | 3 | 4; labels: string[]; part: string; parent: string; branch: string; order: number; createdAt: number; updatedAt: number; agent: string }
export type Idea = { id: string; title: string; description: string; createdAt: number }
export type Pull = { number: number; title: string; author: string; branch: string; url: string; draft: boolean; decision: string; updatedAt: string }
export type Reviews = { state: 'ok' | 'nogh' | 'signedout' | 'nogithub' | 'error'; pulls: Pull[] }
export type Settings = {
  usageMeters: boolean; confirmPaste: boolean; lockYolo: boolean; hideEmail: boolean; gpu: boolean; protectSecrets: boolean; keepAwake: 'off' | 'agents' | 'always'
  defaultAgent: string; agentMode: 'default' | 'edits' | 'plan' | 'yolo'; blockWritesOutside: boolean; blockReadsOutside: boolean; askBeforeDelete: boolean
  proxyUrl: string; noProxy: string; http1: boolean
  voiceModel: string; voiceLanguage: string; voiceMode: 'toggle' | 'hold'; voiceFillers: boolean; voiceVocabulary: string; voiceMic: string
  restoreSession: boolean; resumeAgents: boolean; tabOrder: 'recent' | 'fixed'; openIn: 'Finder' | 'Visual Studio Code' | 'Cursor' | 'Zed' | 'Terminal' | 'iTerm'
  confirmCloseRunning: boolean; launchAtLogin: boolean; menuBarIcon: boolean; summonShortcut: 'off' | 'Alt+Space' | 'Control+`' | 'Command+Shift+Space'
  editorAutoSave: 'off' | 'delay' | 'focus'; editorFontSize: number; editorTabSize: number; editorWordWrap: boolean; editorMinimap: boolean; editorLineNumbers: boolean; editorWhitespace: boolean; showExplorer: boolean; rightPanel: 'off' | 'map' | 'files' | 'tasks'; rightWidth: number
  markCommits: boolean; startPage: 'welcome' | 'last'; confirmQuit: boolean; newTerminalDir: 'project' | 'home'; shell: string
  theme: 'system' | 'light' | 'mira' | 'dim' | 'contrast'; tint: 'none' | 'mint' | 'amber' | 'violet' | 'rose' | 'cyan' | 'custom'; tintColor: string; tintAmount: number
  fontSmoothing: boolean; scrollSpeed: number; scrollOnInput: boolean; hideMouse: boolean
  uiFont: 'Geist' | 'System' | 'Inter' | 'Atkinson Hyperlegible'; reduceMotion: boolean; showAppName: boolean
  termPalette: 'mira' | 'ghostty' | 'onedark' | 'dracula' | 'solarized' | 'gruvbox'; tabWorking: 'ring' | 'breathe' | 'light' | 'shimmer' | 'timer'; tabDone: 'markg' | 'ringg' | 'ringw' | 'markw' | 'bold' | 'word' | 'green'; tabNeeds: 'mark' | 'name' | 'both'; taskPalette: 'mira' | 'pastel' | 'vivid' | 'sunset' | 'forest' | 'mono'; termBg: string; termFg: string; termCursor: string
  fontWeight: 'light' | 'normal' | 'medium' | 'bold'; padX: number; padY: number; inactiveDim: number; dividerWidth: number
  uiZoom: number; showUsage: boolean; usageAs: 'used' | 'left'; showPorts: boolean; showAwake: boolean
  fontFamily: 'Menlo' | 'SF Mono' | 'Monaco' | 'JetBrains Mono' | 'Fira Code' | 'Geist Mono'; letterSpacing: number; rightClickPaste: boolean; bell: 'off' | 'visual' | 'notify'; minContrast: number
  notifyOnlyAway: boolean; notifySound: boolean; notifyEnabled: boolean; notifyDone: boolean; notifyNeeds: boolean; notifySoundName: string; dockBadge: boolean
  fontSize: number; lineHeight: number; cursorStyle: 'block' | 'bar' | 'underline'; cursorBlink: boolean; scrollback: number; copyOnSelect: boolean; optionAsMeta: boolean
  mapEnabled: boolean; mapAuto: boolean; mapOnRight: boolean; mapFollow: boolean
  agents: Record<string, AgentConf>
}

export type CustomItem = { kind: 'plugin' | 'mcp' | 'skill' | 'subagent' | 'rule' | 'command' | 'hook'; name: string; agent: 'claude' | 'codex'; scope: string; status: 'ok' | 'auth' | 'off'; detail: string; path?: string }

const mira = {
  // macOS, Windows or Linux : shortcut labels and the title bar follow it
  platform: process.platform as string,
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    set: (patch: Partial<Omit<Settings, 'agents'>> & { agents?: Record<string, Partial<AgentConf>> }) => ipcRenderer.invoke('settings:set', patch) as Promise<Settings>,
    reset: () => ipcRenderer.invoke('settings:reset') as Promise<Settings>,
    onChanged: (fn: (s: Settings) => void) => {
      const h = (_: unknown, s: Settings) => fn(s)
      ipcRenderer.on('settings:changed', h)
      return () => { ipcRenderer.off('settings:changed', h) }
    }
  },
  files: {
    list: (dir: string) => ipcRenderer.invoke('files:list', dir) as Promise<{ name: string; path: string; dir: boolean }[]>,
    all: (root: string) => ipcRenderer.invoke('files:all', root) as Promise<string[]>,
    read: (path: string) => ipcRenderer.invoke('files:read', path) as Promise<{ text?: string; mtime?: number; error?: string }>,
    write: (path: string, text: string) => ipcRenderer.invoke('files:write', path, text) as Promise<boolean>
  },
  accounts: {
    list: (agent: 'claude' | 'codex') => ipcRenderer.invoke('accounts:list', agent) as Promise<Account[]>,
    add: (agent: 'claude' | 'codex') => ipcRenderer.invoke('accounts:add', agent) as Promise<{ id: string; command: string } | null>,
    use: (agent: 'claude' | 'codex', id: string) => ipcRenderer.invoke('accounts:use', agent, id) as Promise<boolean>,
    remove: (agent: 'claude' | 'codex', id: string) => ipcRenderer.invoke('accounts:remove', agent, id) as Promise<boolean>
  },
  customize: {
    list: (project?: string) => ipcRenderer.invoke('customize:list', project) as Promise<CustomItem[]>,
    open: (path: string) => ipcRenderer.invoke('customize:open', path) as Promise<string>
  },
  ports: {
    list: () => ipcRenderer.invoke('ports:list') as Promise<{ port: number; pid: number; command: string; host: string; cwd: string; project: string | null; mine: boolean; lan: boolean }[]>,
    stop: (pid: number) => ipcRenderer.invoke('ports:stop', pid) as Promise<boolean>,
    phone: (port: number) => ipcRenderer.invoke('ports:phone', port) as Promise<{ url: string; qr: string } | null>
  },
  awake: { set: (on: boolean) => ipcRenderer.invoke('awake:set', on) as Promise<boolean> },
  data: { clear: (what: 'projects' | 'sessions') => ipcRenderer.invoke('data:clear', what) as Promise<boolean> },
  session: {
    load: () => ipcRenderer.invoke('session:load') as Promise<unknown>,
    save: (state: unknown) => ipcRenderer.invoke('session:store', state) as Promise<boolean>
  },
  voice: {
    models: () => ipcRenderer.invoke('voice:models') as Promise<{ id: string; label: string; detail: string; quality: string; mb: number; installed: boolean; recommended?: boolean }[]>,
    download: (id: string) => ipcRenderer.invoke('voice:download', id) as Promise<string>,
    remove: (id: string) => ipcRenderer.invoke('voice:remove', id) as Promise<boolean>,
    transcribe: (samples: Float32Array) => ipcRenderer.invoke('voice:transcribe', samples) as Promise<{ text?: string; error?: string }>,
    onProgress: (fn: (p: { id: string; done: number; total: number; unpacking?: boolean } | null) => void) => {
      const h = (_: unknown, p: { id: string; done: number; total: number; unpacking?: boolean } | null) => fn(p)
      ipcRenderer.on('voice:progress', h)
      return () => { ipcRenderer.off('voice:progress', h) }
    }
  },
  netCheck: () => ipcRenderer.invoke('net:check') as Promise<{ name: string; host: string; ok: boolean; ms: number; detail: string }[]>,
  openIn: (path: string) => ipcRenderer.invoke('app:openIn', path) as Promise<string>,
  composer: {
    pick: (cwd?: string) => ipcRenderer.invoke('composer:pick', cwd) as Promise<string[]>,
    image: (data: Uint8Array, ext: string) => ipcRenderer.invoke('composer:image', data, ext) as Promise<string>,
    screenshot: () => ipcRenderer.invoke('composer:screenshot') as Promise<string>,
    // the path of a file dropped from Finder
    pathOf: (f: File) => webUtils.getPathForFile(f)
  },
  micAccess: () => ipcRenderer.invoke('app:micAccess') as Promise<string>,
  fullscreen: () => ipcRenderer.invoke('app:fullscreen') as Promise<boolean>,
  newWindow: () => ipcRenderer.invoke('app:newWindow') as Promise<boolean>,
  onMenu: (fn: (action: string) => void) => {
    const h = (_: unknown, a: string) => fn(a)
    ipcRenderer.on('app:menu', h)
    return () => { ipcRenderer.off('app:menu', h) }
  },
  notify: (title: string, body: string, force?: boolean) => ipcRenderer.invoke('app:notify', title, body, force) as Promise<boolean | string>,
  sound: (name: string) => ipcRenderer.invoke('app:sound', name) as Promise<boolean>,
  diagnostics: () => ipcRenderer.invoke('app:diagnostics') as Promise<string>,
  advanced: {
    exportSettings: () => ipcRenderer.invoke('advanced:export') as Promise<string>,
    importSettings: () => ipcRenderer.invoke('advanced:import') as Promise<{ ok?: boolean; error?: string }>,
    terminals: () => ipcRenderer.invoke('advanced:terminals') as Promise<number>,
    stopTerminals: () => ipcRenderer.invoke('advanced:stopTerminals') as Promise<number>,
    devtools: () => ipcRenderer.invoke('advanced:devtools') as Promise<boolean>,
    relaunch: () => ipcRenderer.invoke('advanced:relaunch') as Promise<void>,
    removeAll: () => ipcRenderer.invoke('advanced:removeAll') as Promise<boolean>
  },
  tasks: {
    list: (root: string) => ipcRenderer.invoke('tasks:list', root) as Promise<{ prefix: string; tasks: Task[]; exists: boolean } | null>,
    save: (root: string, t: Partial<Task>) => ipcRenderer.invoke('tasks:save', root, t) as Promise<Task | null>,
    remove: (root: string, id: string) => ipcRenderer.invoke('tasks:delete', root, id) as Promise<boolean>,
    onChanged: (fn: (root: string) => void) => {
      const h = (_: unknown, r: string) => fn(r)
      ipcRenderer.on('tasks:changed', h)
      return () => { ipcRenderer.off('tasks:changed', h) }
    }
  },
  ideas: {
    list: () => ipcRenderer.invoke('ideas:list') as Promise<Idea[]>,
    save: (i: Partial<Idea>) => ipcRenderer.invoke('ideas:save', i) as Promise<Idea | null>,
    remove: (id: string) => ipcRenderer.invoke('ideas:delete', id) as Promise<boolean>,
    start: (id: string) => ipcRenderer.invoke('ideas:start', id) as Promise<{ project: ProjectInfo; idea: Idea } | null>,
    onChanged: (fn: () => void) => { const h = () => fn(); ipcRenderer.on('ideas:changed', h); return () => { ipcRenderer.off('ideas:changed', h) } }
  },
  reviews: {
    list: (root: string) => ipcRenderer.invoke('reviews:list', root) as Promise<Reviews>,
    recheck: () => ipcRenderer.invoke('reviews:recheck') as Promise<boolean>
  },
  badge: (n: number) => ipcRenderer.invoke('app:badge', n) as Promise<boolean>,
  onAgentEvent: (fn: (pty: string, kind: 'working' | 'needs' | 'done') => void) => {
    const h = (_: unknown, pty: string, kind: 'working' | 'needs' | 'done') => fn(pty, kind)
    ipcRenderer.on('agent:event', h)
    return () => { ipcRenderer.off('agent:event', h) }
  },
  openPath: (what: 'settings' | 'data' | 'claude' | 'codex' | 'notifications' | 'microphone') => ipcRenderer.invoke('app:open', what) as Promise<string>,
  info: () => ipcRenderer.invoke('app:info') as Promise<{ name: string; version: string; home: string; platform: string }>,
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<ProjectInfo[]>,
    branch: (dir: string) => ipcRenderer.invoke('projects:branch', dir) as Promise<string>,
    icon: (path: string) => ipcRenderer.invoke('projects:icon', path) as Promise<string>,
    openFolder: () => ipcRenderer.invoke('projects:openFolder') as Promise<ProjectInfo | null>,
    touch: (path: string) => ipcRenderer.invoke('projects:touch', path) as Promise<ProjectInfo | null>,
    create: () => ipcRenderer.invoke('projects:create') as Promise<ProjectInfo | { error: string } | null>,
    clone: (url: string) => ipcRenderer.invoke('projects:clone', url) as Promise<ProjectInfo | { error: string } | null>,
    gitInit: (path: string) => ipcRenderer.invoke('projects:gitInit', path) as Promise<boolean>,
    trust: (path: string, trusted: boolean) => ipcRenderer.invoke('projects:trust', path, trusted) as Promise<boolean>,
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id) as Promise<boolean>,
    reorder: (ids: string[]) => ipcRenderer.invoke('projects:reorder', ids) as Promise<boolean>,
    onCloneProgress: (fn: (line: string) => void) => {
      const h = (_: unknown, l: string) => fn(l)
      ipcRenderer.on('projects:cloneProgress', h)
      return () => { ipcRenderer.off('projects:cloneProgress', h) }
    }
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list') as Promise<AgentInfo[]>,
    usage: (force?: boolean) => ipcRenderer.invoke('agents:usage', force) as Promise<AgentUsage[]>,
    mcp: () => ipcRenderer.invoke('agents:mcp') as Promise<string[]>,
    command: (id: string, root?: string, session?: { id?: string; resume?: boolean }) => ipcRenderer.invoke('agents:command', id, root, session) as Promise<{ command: string; mode: string } | null>
  },
  notes: {
    create: (root?: string) => ipcRenderer.invoke('notes:create', root) as Promise<string>,
    read: (file: string) => ipcRenderer.invoke('notes:read', file) as Promise<string>,
    write: (file: string, text: string) => ipcRenderer.invoke('notes:write', file, text) as Promise<boolean>
  },
  map: {
    open: (root: string) => ipcRenderer.invoke('map:open', root) as Promise<{ url?: string; error?: string }>,
    close: () => ipcRenderer.invoke('map:close') as Promise<boolean>,
    restart: (root: string) => ipcRenderer.invoke('map:restart', root) as Promise<{ url?: string; error?: string }>,
    blocks: (root: string) => ipcRenderer.invoke('map:blocks', root) as Promise<{ id: string; label: string; kind: string; summary: string; parent: string | null }[]>,
    saveSession: (root: string, key: string, prompt: string) => ipcRenderer.invoke('session:save', root, key, prompt) as Promise<string>,
    onActivity: (fn: (root: string, files: string[]) => void) => {
      const h = (_: unknown, root: string, files: string[]) => fn(root, files)
      ipcRenderer.on('project:activity', h)
      return () => { ipcRenderer.off('project:activity', h) }
    }
  },
  analysis: {
    get: (root: string) => ipcRenderer.invoke('analysis:get', root) as Promise<Analysis | null>,
    start: (root: string) => ipcRenderer.invoke('analysis:start', root) as Promise<Analysis | null>,
    stop: (root: string) => ipcRenderer.invoke('analysis:stop', root) as Promise<boolean>,
    onState: (fn: (root: string, a: Analysis) => void) => {
      const h = (_: unknown, root: string, a: Analysis) => fn(root, a)
      ipcRenderer.on('analysis:state', h)
      return () => { ipcRenderer.off('analysis:state', h) }
    }
  },
  term: {
    create: (opts: { cwd?: string; cols: number; rows: number; command?: string; args?: string[]; run?: string; agent?: string; once?: boolean }) =>
      ipcRenderer.invoke('term:create', opts) as Promise<{ id: string; cwd: string; shell: string }>,
    write: (id: string, data: string) => ipcRenderer.send('term:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('term:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.send('term:kill', id),
    busy: (id: string) => ipcRenderer.invoke('term:busy', id) as Promise<string | null>,
    onData: (fn: (id: string, data: string) => void) => {
      const h = (_: unknown, id: string, data: string) => fn(id, data)
      ipcRenderer.on('term:data', h)
      return () => { ipcRenderer.off('term:data', h) }
    },
    onExit: (fn: (id: string, code: number) => void) => {
      const h = (_: unknown, id: string, code: number) => fn(id, code)
      ipcRenderer.on('term:exit', h)
      return () => { ipcRenderer.off('term:exit', h) }
    }
  }
}

contextBridge.exposeInMainWorld('mira', mira)
export type MiraApi = typeof mira
