/* Settings (⌘,) : sections on the left with a search over every setting, the settings across the full width on the right */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Mic, Globe, ArrowLeft, ChevronRight, Bell, Bot, Code2, Keyboard, Map as MapIcon, Monitor, Puzzle, Search, Shield, SlidersHorizontal, SquareTerminal, Wrench, X } from 'lucide-react'
import { CustomizePage } from './CustomizePage'
import { TINTS, PALETTES, TASK_PALETTES } from './appearance'
import { ColorSwatch } from './ColorPicker'
import { AgentIcon, refreshAgents } from './agents'
import { useSettings } from './settings'
import { SecondaryButton } from './ui'
import { SideProjects, stClass, projectState, type SideTab } from './SideProjects'
import type { Account, AgentInfo, ProjectInfo, Settings } from '../../preload'
import { isMac, kbd } from './platform'

type Section = { id: string; label: string; icon: ReactNode }
const SECTIONS: Section[] = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor size={16} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={16} /> },
  { id: 'customize', label: 'Customize', icon: <Puzzle size={16} /> },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={16} /> },
  { id: 'editor', label: 'Editor', icon: <Code2 size={16} /> },
  { id: 'map', label: 'Map', icon: <MapIcon size={16} /> },
  { id: 'voice', label: 'Voice', icon: <Mic size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'privacy', label: 'Privacy and security', icon: <Shield size={16} /> },
  { id: 'keys', label: 'Keyboard shortcuts', icon: <Keyboard size={16} /> },
  { id: 'network', label: 'Network', icon: <Globe size={16} /> },
  { id: 'advanced', label: 'Advanced', icon: <Wrench size={16} /> }
]
// every setting, for search : its section, its name and words people may type
const INDEX: { id: string; section: string; label: string; words?: string }[] = [
  { id: 'startPage', section: 'general', label: 'On launch', words: 'start open last project welcome' },
  { id: 'restoreSession', section: 'general', label: 'Reopen tabs and panes', words: 'restore session windows startup' },
  { id: 'resumeAgents', section: 'general', label: 'Continue interrupted agents', words: 'resume restart continue' },
  { id: 'launchAtLogin', section: 'general', label: 'Open Mira at login', words: 'startup boot' },
  { id: 'tabOrder', section: 'general', label: kbd('Tab order for ⌃Tab'), words: 'ctrl tab recent switch' },
  { id: 'openIn', section: 'general', label: 'Open projects in', words: 'vs code cursor zed finder editor' },
  { id: 'confirmCloseRunning', section: 'general', label: 'Closing a tab that is still running', words: 'confirm ask stop' },
  { id: 'menuBarIcon', section: 'general', label: 'Icon in the menu bar', words: 'tray status' },
  { id: 'summonShortcut', section: 'general', label: 'Bring Mira to the front', words: 'global shortcut hotkey summon' },
  { id: 'confirmQuit', section: 'general', label: 'Quitting with running terminals', words: 'quit close confirm' },
  { id: 'newTerminalDir', section: 'terminal', label: 'New terminals open in', words: 'folder directory cwd home' },
  { id: 'defaultAgent', section: 'agents', label: 'Default agent', words: 'new agent shortcut' },
  { id: 'agentMode', section: 'agents', label: 'Permissions for all agents', words: 'mode yolo accept edits plan ask run mode' },
  { id: 'blockWritesOutside', section: 'agents', label: 'Keep edits inside the project', words: 'protection external files sandbox' },
  { id: 'blockReadsOutside', section: 'agents', label: 'Ask before reading outside the project', words: 'protection read access' },
  { id: 'askBeforeDelete', section: 'agents', label: 'Ask before deleting files', words: 'protection delete rm' },
  { id: 'agent-claude', section: 'agents', label: 'Claude Code', words: 'claude anthropic' },
  { id: 'agent-codex', section: 'agents', label: 'Codex', words: 'openai chatgpt' },
  { id: 'accounts', section: 'agents', label: 'Accounts', words: 'sign in login logout email plan claude codex switch' },
  { id: 'markCommits', section: 'agents', label: 'Mention Mira in agent commits', words: 'attribution commit pull request made with' },
  { id: 'shell', section: 'terminal', label: 'Shell', words: 'zsh bash fish' },
  { id: 'keepAwake', section: 'general', label: 'Keep the computer awake', words: 'sleep caffeinate battery' },
  { id: 'theme', section: 'appearance', label: 'Theme', words: 'light white dark system dim high contrast colors' },
  { id: 'tint', section: 'appearance', label: 'Tint', words: 'color colour hue background custom picker' },
  { id: 'uiFont', section: 'appearance', label: 'Interface font', words: 'typeface geist system dyslexic accessible' },
  { id: 'reduceMotion', section: 'appearance', label: 'Reduce motion', words: 'animations' },
  { id: 'fontSmoothing', section: 'appearance', label: 'Font smoothing', words: 'antialiasing retina' },
  { id: 'showAppName', section: 'appearance', label: 'App name in the title bar' },
  { id: 'uiZoom', section: 'appearance', label: 'Interface size', words: 'zoom scale' },
  { id: 'customize', section: 'customize', label: 'Plugins, MCP servers, skills, rules', words: 'customize mcp figma plugins skills hooks subagents commands' },
  { id: 'tabWorking', section: 'notifications', label: 'While an agent works', words: 'tab sidebar spinner ring loading status working' },
  { id: 'tabDone', section: 'notifications', label: 'When an agent finished', words: 'tab sidebar done finished mark green status' },
  { id: 'tabNeeds', section: 'notifications', label: 'When an agent waits for you', words: 'tab sidebar needs question permission yellow blink status' },
  { id: 'taskPalette', section: 'appearance', label: 'Task colours', words: 'tasks status priority colors palette' },
  { id: 'termPalette', section: 'appearance', label: 'Colour palette', words: 'theme colors ansi dracula one dark solarized gruvbox' },
  { id: 'termBg', section: 'appearance', label: 'Background colour', words: 'terminal background' },
  { id: 'termFg', section: 'appearance', label: 'Text colour', words: 'foreground' },
  { id: 'termCursor', section: 'appearance', label: 'Cursor colour' },
  { id: 'fontWeight', section: 'appearance', label: 'Font weight', words: 'bold thin' },
  { id: 'padX', section: 'appearance', label: 'Padding', words: 'margin space' },
  { id: 'inactiveDim', section: 'appearance', label: 'Dim inactive panes', words: 'split focus opacity' },
  { id: 'dividerWidth', section: 'appearance', label: 'Divider thickness', words: 'split line' },
  { id: 'showUsage', section: 'appearance', label: 'Usage in the status bar', words: 'meters limits' },
  { id: 'usageAs', section: 'appearance', label: 'Show usage as', words: 'used left remaining percent' },
  { id: 'showPorts', section: 'appearance', label: 'Open ports in the status bar', words: 'phone qr code mobile wifi localhost server' },
  { id: 'showAwake', section: 'appearance', label: 'Keep awake in the status bar' },
  { id: 'agent-mode', section: 'agents', label: 'Permission mode', words: 'yolo skip prompts accept edits plan dangerously' },
  { id: 'agent-model', section: 'agents', label: 'Model', words: 'model opus sonnet haiku fable gpt gemini default diagram' },
  { id: 'agent-args', section: 'agents', label: 'Extra arguments', words: 'flags command' },
  { id: 'agent-show', section: 'agents', label: 'Show in the new tab menu' },

  { id: 'fontFamily', section: 'appearance', label: 'Font', words: 'typeface menlo mono' },
  { id: 'fontSize', section: 'appearance', label: 'Font size' },
  { id: 'lineHeight', section: 'appearance', label: 'Line height' },
  { id: 'letterSpacing', section: 'appearance', label: 'Letter spacing' },
  { id: 'cursorStyle', section: 'appearance', label: 'Cursor', words: 'block bar underline' },
  { id: 'cursorBlink', section: 'appearance', label: 'Blinking cursor' },
  { id: 'scrollback', section: 'terminal', label: 'Scrollback lines', words: 'history buffer' },
  { id: 'copyOnSelect', section: 'terminal', label: 'Copy on select', words: 'clipboard' },
  { id: 'optionAsMeta', section: 'terminal', label: 'Option key as Alt', words: 'alt keyboard' },
  { id: 'minContrast', section: 'appearance', label: 'Minimum contrast', words: 'readability colors accessibility' },
  { id: 'bell', section: 'terminal', label: 'Bell', words: 'sound beep notification' },
  { id: 'editorAutoSave', section: 'editor', label: 'Auto save', words: 'save editor' },
  { id: 'editorFontSize', section: 'editor', label: 'Editor font size', words: 'code' },
  { id: 'editorTabSize', section: 'editor', label: 'Tab size', words: 'indent spaces' },
  { id: 'editorWordWrap', section: 'editor', label: 'Wrap long lines', words: 'word wrap' },
  { id: 'editorLineNumbers', section: 'editor', label: 'Line numbers', words: 'gutter' },
  { id: 'editorMinimap', section: 'editor', label: 'Minimap', words: 'overview' },
  { id: 'editorWhitespace', section: 'editor', label: 'Show spaces and tabs', words: 'whitespace' },
  { id: 'mapEnabled', section: 'map', label: 'Project map' },
  { id: 'mapAuto', section: 'map', label: 'Draw the map by itself', words: 'automatic analysis diagram agent open project' },
  { id: 'rightPanel', section: 'map', label: 'Right panel', words: 'map files explorer side panel right' },
  { id: 'mapFollow', section: 'map', label: 'Follow the work', words: 'camera activity files' },
  { id: 'notifyEnabled', section: 'notifications', label: 'Notifications', words: 'alerts' },
  { id: 'notifyNeeds', section: 'notifications', label: 'An agent needs you', words: 'permission question waiting' },
  { id: 'notifyDone', section: 'notifications', label: 'An agent is done', words: 'finished complete' },
  { id: 'dockBadge', section: 'notifications', label: 'Count on the Dock icon', words: 'badge' },
  { id: 'notifySoundName', section: 'notifications', label: 'Notification sound', words: 'glass ping pop' },
  { id: 'notifyOnlyAway', section: 'notifications', label: 'Only when Mira is in the background' },
  { id: 'gpu', section: 'advanced', label: 'Hardware acceleration', words: 'gpu flicker graphics display' },
  { id: 'share', section: 'advanced', label: 'Export settings', words: 'import share friend backup json' },
  { id: 'terminals', section: 'advanced', label: 'Running terminals', words: 'stop kill sessions frozen' },
  { id: 'remove', section: 'advanced', label: 'Remove all Mira data', words: 'uninstall delete reset' },
  { id: 'hideEmail', section: 'privacy', label: 'Hide email address', words: 'mask screenshot screen share' },
  { id: 'protectSecrets', section: 'privacy', label: 'Keep secrets from agents', words: 'env keys ssh credentials secret' },
  { id: 'diagnostics', section: 'privacy', label: 'Export diagnostics', words: 'bug report logs support' },
  { id: 'lockYolo', section: 'privacy', label: 'Never allow skipping prompts', words: 'yolo lock friends' },
  { id: 'usageMeters', section: 'privacy', label: 'Usage meters', words: 'limits token anthropic chatgpt network' },
  { id: 'confirmPaste', section: 'general', label: 'Pasting several lines', words: 'clipboard paste confirm' },
  { id: 'trusted', section: 'privacy', label: 'Trusted projects', words: 'trust checks commands' },
  { id: 'network', section: 'privacy', label: 'What leaves this computer', words: 'telemetry tracking data network privacy' },
  { id: 'clear', section: 'privacy', label: 'Clear data', words: 'reset delete recent projects sessions' },
  { id: 'keys', section: 'keys', label: 'Shortcuts', words: 'keyboard keys' },
  { id: 'voiceModel', section: 'voice', label: 'Voice model', words: 'dictation speech whisper parakeet download' },
  { id: 'voiceLanguage', section: 'voice', label: 'Language you speak', words: 'dictation french english' },
  { id: 'voiceMode', section: 'voice', label: 'Shortcut', words: 'dictation hold toggle cmd e' },
  { id: 'voiceMic', section: 'voice', label: 'Microphone', words: 'input audio' },
  { id: 'voiceFillers', section: 'voice', label: 'Remove hesitations', words: 'euh um uh' },
  { id: 'voiceVocabulary', section: 'voice', label: 'Vocabulary', words: 'words names corrections' },
  { id: 'proxyUrl', section: 'network', label: 'Proxy', words: 'http https socks corporate vpn firewall' },
  { id: 'http1', section: 'network', label: 'HTTP/1.1 compatibility', words: 'http2 proxy vpn' },
  { id: 'noProxy', section: 'network', label: 'No proxy for', words: 'bypass direct localhost' },
  { id: 'domains', section: 'network', label: 'Required domains', words: 'firewall allow list allowlist offline' },
  { id: 'devtools', section: 'advanced', label: 'Developer tools', words: 'console devtools debug inspect' },
  { id: 'notifytest', section: 'notifications', label: 'Send a test notification', words: 'test' },
  { id: 'netcheck', section: 'network', label: 'Network check', words: 'diagnostic connectivity github anthropic' },
  { id: 'files', section: 'advanced', label: 'Settings file', words: 'json data folder' },
  { id: 'version', section: 'general', label: 'Version and updates', words: 'update about licence report bug' }
]

const SHORTCUTS: [string, string][] = [
  ['Next tab', kbd('⌃Tab')], ['Search', kbd('⌘K')], ['Open a file', kbd('⌘P')], ['Map panel', kbd('⌘⇧M')], ['Files panel', kbd('⌘⇧E')], ['Save', kbd('⌘S')], ['Settings', kbd('⌘,')], ['New terminal', kbd('⌘T')], ['New default agent', kbd('⌘⌥T')], ['New agent 1 to 5', kbd('⌘⇧1 to ⌘⇧5')], ['Show map', kbd('⌘1')], ['Close tab', kbd('⌘W')],
  ['Sidebar', kbd('⌘B')], ['Back', kbd('⌘[')], ['Forward', kbd('⌘]')], ['Drag a tab', 'split a pane right or down']
]

export function SettingsPage({ onClose, version, initial = 'general', project = null, onRun }: { onClose: () => void; version?: string; initial?: string; project?: ProjectInfo | null; onRun?: (command: string, title: string) => void }) {
  const s = useSettings()
  const [q, setQ] = useState('')
  const [section, setSection] = useState(initial)
  const [flash, setFlash] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [mcp, setMcp] = useState<string[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const body = useRef<HTMLDivElement>(null)
  const colorT = useRef<number>(0)
  const [more, setMore] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [diag, setDiag] = useState('')
  // an agent you just installed shows up when you come back to this page or to the window
  useEffect(() => {
    if (section !== 'agents') return
    void refreshAgents().then(setAgents)
    const back = () => void refreshAgents().then(setAgents)
    window.addEventListener('focus', back)
    return () => window.removeEventListener('focus', back)
  }, [section])
  useEffect(() => { void refreshAgents().then(setAgents); void window.mira.agents.mcp().then(setMcp); void window.mira.projects.list().then(setProjects) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !q) onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [q, onClose])

  const hits = useMemo(() => {
    const w = q.trim().toLowerCase()
    if (!w) return []
    return INDEX.filter((x) => `${x.label} ${x.words ?? ''}`.toLowerCase().includes(w))
      .sort((a, b) => Number(!a.label.toLowerCase().includes(w)) - Number(!b.label.toLowerCase().includes(w)))
  }, [q])
  const go = (id: string, sec: string) => {
    setSection(sec); setQ('')
    setTimeout(() => { body.current?.querySelector(`[data-set="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlash(id); setTimeout(() => setFlash(null), 1600) }, 30)
  }
  if (!s) return null
  const set = (patch: Parameters<typeof window.mira.settings.set>[0]) => void window.mira.settings.set(patch)
  // colour drags change many times a second : saved at most every 80 ms
  const setLater = (patch: Parameters<typeof window.mira.settings.set>[0]) => { clearTimeout(colorT.current); colorT.current = window.setTimeout(() => set(patch), 80) }
  const trust = (p: ProjectInfo, v: boolean) => void window.mira.projects.trust(p.path, v).then(() => setProjects((l) => l.map((x) => (x.id === p.id ? { ...x, trusted: v } : x))))
  const L = (id: string, label: string, hint: string | undefined, c: ReactNode) => <Line id={id} flash={flash} label={label} hint={hint}>{c}</Line>

  return (
    <div className="fixed inset-0 z-40 flex bg-bg">
      {/* left : back, search, sections */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-chrome">
        <div className="drag h-10 shrink-0" />
        <div className="px-3">
          <button onClick={onClose} className="nodrag flex h-8 w-full items-center gap-2 rounded-sm px-2 text-body text-text-2 hover:bg-surface-1 hover:text-text">
            <ArrowLeft size={16} />Back to app
          </button>
          <div className="mt-2 flex h-9 items-center gap-2 rounded-sm border border-line px-2.5 focus-within:border-line-strong">
            <Search size={16} className="shrink-0 text-text-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].id, hits[0].section); if (e.key === 'Escape') setQ('') }}
              className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
            {q && <button onClick={() => setQ('')} className="text-text-3 hover:text-text"><X size={14} /></button>}
          </div>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {q ? (
            hits.length ? hits.map((h) => {
              const sec = SECTIONS.find((x) => x.id === h.section)!
              return (
                <button key={h.id} onClick={() => go(h.id, h.section)} className="flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-surface-1">
                  <span className="mt-0.5 shrink-0 text-text-3">{sec.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-body text-text-2"><Mark text={h.label} q={q} /></span>
                    <span className="block text-meta text-text-3">{sec.label}</span>
                  </span>
                </button>
              )
            }) : <div className="px-2 py-2 text-body text-text-3">No setting found</div>
          ) : SECTIONS.map((x) => (
            <button key={x.id} onClick={() => setSection(x.id)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body ${section === x.id ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-1 hover:text-text'}`}>
              {x.icon}{x.label}
            </button>
          ))}
        </div>
      </aside>

      {/* right : one section, across the full width */}
      <div ref={body} className="min-w-0 flex-1 overflow-y-auto">
        <div className="drag sticky top-0 z-10 h-10 bg-bg" />
        <div className="px-6 pb-16">
          <h1 className="text-heading font-semibold tracking-title text-text">{SECTIONS.find((x) => x.id === section)!.label}</h1>

          {section === 'general' && (
            <>
              <Card title="Startup">
                {L('startPage', 'On launch', undefined, <Choice value={s.startPage} options={[['last', 'Open the last project'], ['welcome', 'Show the welcome page']]} set={(v) => set({ startPage: v as Settings['startPage'] })} />)}
                {L('restoreSession', 'Reopen tabs and panes', 'Your projects come back as you left them: tabs, splits, notes.', <Toggle on={s.restoreSession} set={(v) => set({ restoreSession: v })} />)}
                {L('resumeAgents', 'Continue interrupted agents', 'Reopened Claude Code tabs continue their own conversation. Other agents start a new one.', <Toggle on={s.resumeAgents} set={(v) => set({ resumeAgents: v })} />)}
                {L('launchAtLogin', 'Open Mira at login', 'Works in the installed app.', <Toggle on={s.launchAtLogin} set={(v) => set({ launchAtLogin: v })} />)}
              </Card>
              <Card title="Tabs">
                {L('tabOrder', kbd('Tab order for ⌃Tab'), 'Most recent goes back to the tab you used before.', <Choice value={s.tabOrder} options={[['recent', 'Most recent'], ['fixed', 'Left to right']]} set={(v) => set({ tabOrder: v as Settings['tabOrder'] })} />)}
              </Card>
              <Card title="Open in">
                {L('openIn', 'Open projects in', kbd('Click the path in the status bar, or use ⌘K.'), <Choice value={s.openIn} options={[['Finder', isMac ? 'Finder' : 'File manager'], ['Visual Studio Code', 'VS Code'], ['Cursor', 'Cursor'], ['Zed', 'Zed'], ['Terminal', 'Terminal'], ['iTerm', 'iTerm']]} set={(v) => set({ openIn: v as Settings['openIn'] })} />)}
              </Card>
              <Card title="Confirmations">
                {L('confirmCloseRunning', 'Closing a tab that is still running', 'Ask before stopping an agent or a command.', <Toggle on={s.confirmCloseRunning} set={(v) => set({ confirmCloseRunning: v })} />)}
                {L('confirmQuit', 'Quitting with running terminals', undefined, <Toggle on={s.confirmQuit} set={(v) => set({ confirmQuit: v })} />)}
                {L('confirmPaste', 'Pasting several lines', 'A pasted block of commands waits for your OK before it runs.', <Toggle on={s.confirmPaste} set={(v) => set({ confirmPaste: v })} />)}
              </Card>
              <Card title="System">
                {L('keepAwake', 'Keep the computer awake', 'Long agent runs keep going when you step away. The screen can still turn off.',
                  <Choice value={s.keepAwake} options={[['off', 'Never'], ['agents', 'With agents'], ['always', 'Always']]} set={(v) => set({ keepAwake: v as Settings['keepAwake'] })} />)}
                {L('menuBarIcon', 'Icon in the menu bar', 'Show Mira, a new terminal or a new agent from the menu bar.', <Toggle on={s.menuBarIcon} set={(v) => set({ menuBarIcon: v })} />)}
                {L('summonShortcut', 'Bring Mira to the front', 'A shortcut that works from any app.', <Choice value={s.summonShortcut} options={[['off', 'Off'], ['Alt+Space', '⌥ Space'], ['Control+kbd(`', kbd('⌃ `)')], ['Command+Shift+Space', kbd('⌘⇧ Space')]]} set={(v) => set({ summonShortcut: v as Settings['summonShortcut'] })} />)}
              </Card>
              <Card title="Mira" id="version" flash={flash}>
                <Line label="Version" hint={`Mira Terminal ${version ?? ''}`}><span className="text-body text-text-2 tnum">{version ?? ''}</span></Line>
                <Line label="Updates" hint="Automatic updates arrive with the signed, published app."><SecondaryButton disabled>Check for updates</SecondaryButton></Line>
                <Line label="Report a problem" hint="Opens an issue on GitHub. Nothing is sent without you."><SecondaryButton onClick={() => window.open('https://github.com/dump-addict/MIRA-TERMINAL/issues/new')}>Report</SecondaryButton></Line>
                <Line label="Licences" hint="Third party notices ship with the app."><span className="text-body text-text-3">THIRD_PARTY_NOTICES</span></Line>
              </Card>
            </>
          )}

          {section === 'appearance' && (
            <>
              <Card title="Theme">
                {L('theme', 'Theme', 'System follows your Mac. Mira is pure black, Dim is softer, High contrast is easier to read.', <Choice value={s.theme} options={[['system', 'System'], ['light', 'Light'], ['mira', 'Mira'], ['dim', 'Dim'], ['contrast', 'High contrast']]} set={(v) => set({ theme: v as Settings['theme'] })} />)}
                {L('tint', 'Tint', 'A touch of colour in the backgrounds and lines.', (
                  <div className="flex items-center gap-1.5">
                    <Swatch on={s.tint === 'none'} color="#000" label="None" onClick={() => set({ tint: 'none' })} />
                    {Object.entries(TINTS).map(([k, c]) => <Swatch key={k} on={s.tint === k} color={c} label={k[0].toUpperCase() + k.slice(1)} onClick={() => set({ tint: k as Settings['tint'] })} />)}
                    <ColorSwatch title="Any colour" value={s.tintColor} on={s.tint === 'custom'} onChange={(v) => setLater({ tint: 'custom', tintColor: v })} />
                  </div>
                ))}
                {s.tint !== 'none' && L('tintAmount', 'Tint strength', undefined, <Stepper value={s.tintAmount} min={10} max={100} step={10} suffix="%" set={(v) => set({ tintAmount: v })} />)}
              </Card>
              <Card title="Tasks">
                {L('taskPalette', 'Colours', undefined, <Choice value={s.taskPalette} options={Object.entries(TASK_PALETTES).map(([k, v]) => [k, v.label])} set={(v) => set({ taskPalette: v as Settings['taskPalette'] })} />)}
                <TaskStrip palette={s.taskPalette} />
              </Card>
              <Card title="Interface">
                {L('uiFont', 'Interface font', 'Atkinson Hyperlegible is made for low vision and dyslexia, if installed.', <Choice value={s.uiFont} options={[['Geist', 'Geist'], ['System', 'System'], ['Inter', 'Inter'], ['Atkinson Hyperlegible', 'Atkinson']]} set={(v) => set({ uiFont: v as Settings['uiFont'] })} />)}
                {L('uiZoom', 'Interface size', undefined, <Stepper value={s.uiZoom} min={80} max={150} step={10} suffix="%" set={(v) => set({ uiZoom: v })} />)}
                {L('fontSmoothing', 'Font smoothing', 'Thinner, crisper text on Retina screens. Off uses the system default.', <Toggle on={s.fontSmoothing} set={(v) => set({ fontSmoothing: v })} />)}
                {L('reduceMotion', 'Reduce motion', 'No transitions or animations.', <Toggle on={s.reduceMotion} set={(v) => set({ reduceMotion: v })} />)}
                {L('showAppName', 'App name in the title bar', undefined, <Toggle on={s.showAppName} set={(v) => set({ showAppName: v })} />)}
              </Card>
              <Card title="Terminal" id="termlook" flash={flash}>
                {L('fontFamily', 'Font', 'Fonts that are not installed fall back to Menlo.', <Choice value={s.fontFamily} options={[['Menlo', 'Menlo'], ['SF Mono', 'SF Mono'], ['Monaco', 'Monaco'], ['JetBrains Mono', 'JetBrains'], ['Fira Code', 'Fira'], ['Geist Mono', 'Geist']]} set={(v) => set({ fontFamily: v as Settings['fontFamily'] })} />)}
                {L('fontSize', 'Font size', undefined, <Stepper value={s.fontSize} min={9} max={24} set={(v) => set({ fontSize: v })} />)}
                {L('termPalette', 'Colours', 'The 16 colours programs use. Mira follows the app theme.', <Choice value={s.termPalette} options={[['mira', 'Mira'], ['ghostty', 'Ghostty'], ['onedark', 'One Dark'], ['dracula', 'Dracula'], ['solarized', 'Solarized'], ['gruvbox', 'Gruvbox']]} set={(v) => set({ termPalette: v as Settings['termPalette'] })} />)}
                <PaletteStrip colors={PALETTES[s.termPalette].c} />
                {L('termBg', 'Background colour', 'Empty follows the colours above.', <ColorField value={s.termBg} set={(v) => setLater({ termBg: v })} />)}
                {L('cursorStyle', 'Cursor', undefined, <Choice value={s.cursorStyle} options={[['block', 'Block'], ['bar', 'Bar'], ['underline', 'Underline']]} set={(v) => set({ cursorStyle: v as Settings['cursorStyle'] })} />)}
                <button onClick={() => setMore((m) => !m)} className="flex h-10 w-full items-center gap-1.5 text-left text-body text-text-2 hover:text-text">
                  <ChevronRight size={14} className={`transition-transform ${more ? 'rotate-90' : ''}`} />More
                </button>
                {more && <>
                  {L('fontWeight', 'Font weight', undefined, <Choice value={s.fontWeight} options={[['light', 'Light'], ['normal', 'Regular'], ['medium', 'Medium'], ['bold', 'Bold']]} set={(v) => set({ fontWeight: v as Settings['fontWeight'] })} />)}
                  {L('lineHeight', 'Line height', undefined, <Stepper value={s.lineHeight} min={1} max={2} step={0.05} set={(v) => set({ lineHeight: Math.round(v * 100) / 100 })} />)}
                  {L('letterSpacing', 'Letter spacing', undefined, <Stepper value={s.letterSpacing} min={-2} max={4} step={0.5} set={(v) => set({ letterSpacing: v })} />)}
                  {L('termFg', 'Text colour', undefined, <ColorField value={s.termFg} set={(v) => setLater({ termFg: v })} />)}
                  {L('termCursor', 'Cursor colour', undefined, <ColorField value={s.termCursor} set={(v) => setLater({ termCursor: v })} />)}
                  {L('cursorBlink', 'Blinking cursor', undefined, <Toggle on={s.cursorBlink} set={(v) => set({ cursorBlink: v })} />)}
                  {L('padX', 'Padding', 'Space around the text, left and right then top.', <span className="flex gap-2"><Stepper value={s.padX} min={0} max={48} step={2} suffix="px" set={(v) => set({ padX: v })} /><Stepper value={s.padY} min={0} max={48} step={2} suffix="px" set={(v) => set({ padY: v })} /></span>)}
                  {L('minContrast', 'Minimum contrast', 'Raises dim colours so text stays readable. 1 keeps colours as they are.', <Stepper value={s.minContrast} min={1} max={7} step={0.5} set={(v) => set({ minContrast: v })} />)}
                </>}
              </Card>
              <Card title="Split screen">
                {L('inactiveDim', 'Dim inactive panes', 'The panes you are not working in fade a little.', <Stepper value={s.inactiveDim} min={0} max={60} step={10} suffix="%" set={(v) => set({ inactiveDim: v })} />)}
                {L('dividerWidth', 'Divider thickness', undefined, <Stepper value={s.dividerWidth} min={1} max={4} suffix="px" set={(v) => set({ dividerWidth: v })} />)}
              </Card>
              <Card title="Status bar">
                {L('showUsage', 'Usage in the status bar', undefined, <Toggle on={s.showUsage} set={(v) => set({ showUsage: v })} />)}
                {L('usageAs', 'Show usage as', undefined, <Choice value={s.usageAs} options={[['used', 'Used'], ['left', 'Left']]} set={(v) => set({ usageAs: v as Settings['usageAs'] })} />)}
                {L('showPorts', 'Open ports in the status bar', undefined, <Toggle on={s.showPorts} set={(v) => set({ showPorts: v })} />)}
                {L('showAwake', 'Keep awake in the status bar', undefined, <Toggle on={s.showAwake} set={(v) => set({ showAwake: v })} />)}
              </Card>
            </>
          )}

          {section === 'customize' && (
            <div data-set="customize" className="-mx-6 -mt-2 relative min-h-[70vh]"><CustomizePage project={project} embedded /></div>
          )}

          {section === 'agents' && (
            <>
              <Card title="Defaults">
                {L('defaultAgent', 'Default agent', kbd('Opened by ⌘⌥T and listed first in the new tab menu.'), <Choice value={s.defaultAgent} options={agents.filter((a) => a.installed).map((a) => [a.id, a.label] as [string, string])} set={(v) => set({ defaultAgent: v })} />)}
                {L('agentMode', 'Permissions for all agents', s.agentMode === 'yolo' ? 'Agents run commands and edit files without asking. Only in trusted projects.' : 'What agents may do without asking you. Each agent can differ below.',
                  <Choice value={s.agentMode} options={([['default', 'Ask first'], ['edits', 'Accept edits'], ['plan', 'Plan only'], ['yolo', 'Skip all prompts']] as [string, string][]).filter(([v]) => v !== 'yolo' || !s.lockYolo)} danger="yolo" set={(v) => set({ agentMode: v as Settings['agentMode'] })} />)}
              </Card>
              <Card title="Protections">
                {L('blockWritesOutside', 'Keep edits inside the project', 'Agents cannot create or change files outside the project folder. Claude Code and Codex.', <Toggle on={s.blockWritesOutside} set={(v) => set({ blockWritesOutside: v })} />)}
                {L('blockReadsOutside', 'Ask before reading outside the project', 'Claude Code asks before it reads files elsewhere on your computer.', <Toggle on={s.blockReadsOutside} set={(v) => set({ blockReadsOutside: v })} />)}
                {L('askBeforeDelete', 'Ask before deleting files', 'Claude Code asks before rm, git clean and git reset --hard, even when it accepts edits.', <Toggle on={s.askBeforeDelete} set={(v) => set({ askBeforeDelete: v })} />)}
              </Card>
              <Card>
                {L('markCommits', 'Mention Mira in agent commits', 'Adds Made with Mira Terminal and the agent name to commits agents make from Mira, and to Claude Code pull requests. The agent keeps its own mention. Never over your own attribution setting.', <Toggle on={s.markCommits} set={(v) => set({ markCommits: v })} />)}
              </Card>
              {agents.filter((a) => a.installed).map((a) => {
                const c = s.agents[a.id]
                const modes: [string, string][] = [['inherit', 'Same as all'], ['default', 'Ask first'], ['edits', 'Accept edits'], ...(a.id === 'claude' ? [['plan', 'Plan only'] as [string, string]] : []), ['yolo', 'Skip all prompts']]
                return (
                  <Card key={a.id} id={`agent-${a.id}`} flash={flash} title={<span className="flex items-center gap-2"><AgentIcon id={a.id} size={16} />{a.label}<span className="font-mono text-meta text-text-3">{a.path?.replace(/^\/Users\/[^/]+/, '~')}</span></span>}>
                    {(a.id === 'claude' || a.id === 'codex') && <AgentAccounts agent={a.id} onRun={(cmd, t) => { onRun?.(cmd, t); onClose() }} />}
                    <Line id="agent-mode" flash={flash} label="Permission mode" hint={c.mode === 'yolo' ? 'Runs commands and edits files without asking. Only in trusted projects.' : c.mode === 'inherit' ? 'Follows the permissions set for all agents.' : 'What this agent may do without asking you.'}>
                      <Choice value={c.mode} options={modes.filter(([v]) => v !== 'yolo' || !s.lockYolo)} danger="yolo" set={(v) => set({ agents: { [a.id]: { mode: v as Settings['agents'][string]['mode'] } } })} />
                    </Line>
                    <Line id="agent-model" flash={flash} label="Model" hint={c.model ? `Every ${a.label} tab and the project diagram use ${c.model}, and no other.` : `Empty: ${a.label}'s own default, as in your terminal.${a.id === 'claude' ? ' Otherwise opus, sonnet, haiku, fable or a full model name.' : ''}`}>
                      <TextField value={c.model ?? ''} placeholder="Default" pattern={/^[\w.:[\]-]{0,80}$/} error="Letters, digits, dots and dashes only" set={(v) => set({ agents: { [a.id]: { model: v.trim() } } })} />
                    </Line>
                    <Line id="agent-args" flash={flash} label="Extra arguments" hint="Added to the command line.">
                      <TextField value={c.args} placeholder="--verbose" set={(v) => set({ agents: { [a.id]: { args: v } } })} />
                    </Line>
                    <Line id="agent-show" flash={flash} label="Show in the new tab menu"><Toggle on={c.show} set={(v) => set({ agents: { [a.id]: { show: v } } })} /></Line>
                    {a.id === 'claude' && <Line label="Config" hint="Plugins, MCP servers, skills and Claude Code's own settings."><span className="flex gap-2"><SecondaryButton onClick={() => setSection('customize')}>Customize</SecondaryButton><SecondaryButton onClick={() => void window.mira.openPath('claude')}>settings.json</SecondaryButton></span></Line>}
                    {a.id === 'codex' && <Line label="Config" hint="Codex's own settings and MCP servers."><SecondaryButton onClick={() => void window.mira.openPath('codex')}>config.toml</SecondaryButton></Line>}
                  </Card>
                )
              })}
              {agents.some((a) => !a.installed) && (
                <Card title="Not installed" hint="Install opens a terminal with the official install command. Once it is done, the agent shows up here and in the new tab menu by itself.">
                  {agents.filter((a) => !a.installed).map((a) => (
                    <Line key={a.id} label={<span className="flex items-center gap-2"><AgentIcon id={a.id} size={16} />{a.label}</span>} hint={INSTALL[a.id]}>
                      {INSTALL[a.id] && <SecondaryButton onClick={() => onRun?.(INSTALL[a.id], `Install ${a.label}`)}>Install</SecondaryButton>}
                    </Line>
                  ))}
                </Card>
              )}
            </>
          )}

          {section === 'terminal' && (
            <>
            <p className="mt-2 text-body text-text-2">How terminals behave. Their look is in Appearance.</p>
            <Card>
              {L('shell', 'Shell', 'Empty uses your login shell. Otherwise the full path, for example /bin/bash.', <TextField value={s.shell} placeholder="/bin/zsh" error="Not a valid path" pattern={/^(\/[\w./+-]+)?$/} set={(v) => set({ shell: v })} />)}
              {L('newTerminalDir', 'New terminals open in', undefined, <Choice value={s.newTerminalDir} options={[['project', 'The project folder'], ['home', 'Your home folder']]} set={(v) => set({ newTerminalDir: v as Settings['newTerminalDir'] })} />)}
              {L('scrollback', 'Scrollback lines', 'Lines kept above the screen in each terminal.', <Stepper value={s.scrollback} min={1000} max={100000} step={1000} set={(v) => set({ scrollback: v })} />)}
              {L('copyOnSelect', 'Copy on select', undefined, <Toggle on={s.copyOnSelect} set={(v) => set({ copyOnSelect: v })} />)}
              {L('optionAsMeta', 'Option key as Alt', 'For shells and editors that use Alt shortcuts. Off keeps Option for accents.', <Toggle on={s.optionAsMeta} set={(v) => set({ optionAsMeta: v })} />)}
              {L('bell', 'Bell', 'Agents ring it when they finish or need you.', <Choice value={s.bell} options={[['off', 'Off'], ['visual', 'Flash'], ['notify', 'Flash and notify']]} set={(v) => set({ bell: v as Settings['bell'] })} />)}
            </Card>
            </>
          )}

          {section === 'editor' && (
            <>
              <Card title="Saving">
                {L('editorAutoSave', 'Auto save', 'After a second without typing, or when you leave the file.', <Choice value={s.editorAutoSave} options={[['off', 'Off'], ['delay', 'After a pause'], ['focus', 'When leaving the file']]} set={(v) => set({ editorAutoSave: v as Settings['editorAutoSave'] })} />)}
              </Card>
              <Card title="Text">
                {L('editorFontSize', 'Font size', 'The font is the one chosen for the terminal.', <Stepper value={s.editorFontSize} min={9} max={24} set={(v) => set({ editorFontSize: v })} />)}
                {L('editorTabSize', 'Tab size', undefined, <Stepper value={s.editorTabSize} min={1} max={8} set={(v) => set({ editorTabSize: v })} />)}
                {L('editorWordWrap', 'Wrap long lines', undefined, <Toggle on={s.editorWordWrap} set={(v) => set({ editorWordWrap: v })} />)}
              </Card>
              <Card title="View">
                {L('editorLineNumbers', 'Line numbers', undefined, <Toggle on={s.editorLineNumbers} set={(v) => set({ editorLineNumbers: v })} />)}
                {L('editorMinimap', 'Minimap', 'A small overview of the file on the right.', <Toggle on={s.editorMinimap} set={(v) => set({ editorMinimap: v })} />)}
                {L('editorWhitespace', 'Show spaces and tabs', undefined, <Toggle on={s.editorWhitespace} set={(v) => set({ editorWhitespace: v })} />)}
              </Card>
            </>
          )}

          {section === 'map' && (
            <Card>
              {L('mapEnabled', 'Project map', 'Each project opens on its map.', <Toggle on={s.mapEnabled} set={(v) => set({ mapEnabled: v })} />)}
              {s.mapEnabled && L('mapAuto', 'Draw the map by itself', 'When a project opens for the first time, your agent reads its code and draws its map. Off, the map waits for your click.', <Toggle on={s.mapAuto} set={(v) => set({ mapAuto: v })} />)}
              {L('rightPanel', 'Right panel', kbd('The map or the files of the open project, beside your tabs. ⌘⇧M for the map, ⌘⇧E for the files.'), <Choice value={s.rightPanel} options={[['off', 'Closed'], ['map', 'Map'], ['files', 'Files']]} set={(v) => set({ rightPanel: v as Settings['rightPanel'] })} />)}
              {L('mapFollow', 'Follow the work', 'When files change, their block lights up and the map moves to it.', <Toggle on={s.mapFollow} set={(v) => set({ mapFollow: v })} />)}
            </Card>
          )}

          {section === 'notifications' && (
            <>
              <p className="mt-2 text-body text-text-2">Your agents tell Mira when they finish or need you. Mira lets you know.</p>
              <Card title="When">
                {L('notifyEnabled', 'Notifications', 'System notifications from Mira.', <Toggle on={s.notifyEnabled} set={(v) => set({ notifyEnabled: v })} />)}
                {L('notifyNeeds', 'An agent needs you', 'It asks a question or a permission.', <Toggle on={s.notifyNeeds} set={(v) => set({ notifyNeeds: v })} />)}
                {L('notifyDone', 'An agent is done', 'It finished its turn.', <Toggle on={s.notifyDone} set={(v) => set({ notifyDone: v })} />)}
                {L('notifyOnlyAway', 'Only when Mira is in the background', undefined, <Toggle on={s.notifyOnlyAway} set={(v) => set({ notifyOnlyAway: v })} />)}
                {L('bell', 'Terminal bell', 'Any program can ring it too.', <Choice value={s.bell} options={[['off', 'Off'], ['visual', 'Flash'], ['notify', 'Flash and notify']]} set={(v) => set({ bell: v as Settings['bell'] })} />)}
              </Card>
              <Card title="In the sidebar">
                {L('tabWorking', 'While it works', undefined, <Dropdown value={s.tabWorking} onChange={(v) => set({ tabWorking: v as Settings['tabWorking'] })} options={[
                  { value: 'ring', label: 'Turning ring', hint: 'A thin ring turns around the logo' }, { value: 'breathe', label: 'Breathing name' },
                  { value: 'light', label: 'Running light', hint: 'A light runs under the tab' }, { value: 'shimmer', label: 'Shimmering name' }, { value: 'timer', label: 'Timer', hint: 'How long it has been working' }]} />)}
                {L('tabDone', 'When it finished', 'Until you look at the tab.', <Dropdown value={s.tabDone} onChange={(v) => set({ tabDone: v as Settings['tabDone'] })} options={[
                  { value: 'markg', label: 'Green mark', hint: 'Bottom right of the logo' }, { value: 'ringg', label: 'Green ring' }, { value: 'ringw', label: 'White ring' },
                  { value: 'markw', label: 'White mark' }, { value: 'bold', label: 'Bold name' }, { value: 'word', label: 'Done', hint: 'The word, on the right' }, { value: 'green', label: 'Green name' }]} />)}
                {L('tabNeeds', 'When it waits for you', undefined, <Dropdown value={s.tabNeeds} onChange={(v) => set({ tabNeeds: v as Settings['tabNeeds'] })} options={[
                  { value: 'mark', label: 'Blinking yellow mark', hint: 'Bottom right of the logo' }, { value: 'name', label: 'Yellow name' }, { value: 'both', label: 'Both' }]} />)}
                <TabsPreview />
              </Card>
              <Card title="Sound and badge">
                {L('notifySoundName', 'Sound', 'Pick one to hear it.', <Choice value={s.notifySoundName} options={[['none', 'None'], ['Glass', 'Glass'], ['Ping', 'Ping'], ['Pop', 'Pop'], ['Hero', 'Hero'], ['Submarine', 'Submarine'], ['Tink', 'Tink']]} set={(v) => { set({ notifySoundName: v as Settings['notifySoundName'], notifySound: v !== 'none' }); void window.mira.sound(v) }} />)}
                {L('dockBadge', 'Count on the Dock icon', 'How many agents wait for you or finished while you were away.', <Toggle on={s.dockBadge} set={(v) => set({ dockBadge: v })} />)}
              </Card>
              <Card>
                <Line id="notifytest" label="Send a test" hint={testMsg === 'blocked' ? 'The system blocks Mira\'s notifications. Turn them on for Electron (Mira\'s name while in development), then send a test again.' : undefined}>
                  <span className="flex items-center gap-2">
                    {testMsg && testMsg !== 'blocked' && <span className="text-meta text-text-3">{testMsg}</span>}
                    {testMsg === 'blocked' && <SecondaryButton onClick={() => void window.mira.openPath('notifications')}>Open system settings</SecondaryButton>}
                    <SecondaryButton onClick={() => void window.mira.notify('Mira', 'Notifications work', true).then((r) => setTestMsg(r === true ? 'Sent' : r === false ? 'Not supported' : 'blocked'))}>Send a test</SecondaryButton>
                  </span>
                </Line>
              </Card>
            </>
          )}

          {section === 'privacy' && (
            <>
              <Card>
                {L('lockYolo', 'Never allow skipping prompts', 'Hides the skip all prompts mode for every agent. Turn it on before you hand the app to someone.', <Toggle on={s.lockYolo} set={(v) => set({ lockYolo: v })} />)}
                {L('hideEmail', 'Hide email address', 'Shows your account e-mails as jane•••@example.com, for screenshots and screen sharing.', <Toggle on={s.hideEmail} set={(v) => set({ hideEmail: v })} />)}
                {L('protectSecrets', 'Keep secrets from agents', 'Claude Code cannot open .env files, private keys, ~/.ssh and cloud credentials, whatever its mode. Codex has no such rule.', <Toggle on={s.protectSecrets} set={(v) => set({ protectSecrets: v })} />)}
                {L('usageMeters', 'Usage meters', 'Reads your agent sign-in on this computer and asks Anthropic and OpenAI for your limits. Nothing else is sent.', <Toggle on={s.usageMeters} set={(v) => set({ usageMeters: v })} />)}
              </Card>
              <Card title="Trusted projects" id="trusted" flash={flash}>
                {!projects.length && <Line label="No projects yet"><span /></Line>}
                <p className="pb-2 text-meta text-text-3">Trusting a project lets the code in its repository run on this computer through Mira. Trust is kept for that folder, also after a git pull: turn it off before pulling code you have not read.</p>
                {projects.map((p) => <Line key={p.id} label={p.name} hint={p.trusted ? 'Runs its map checks (shell commands, network calls) and lets your agent draw its diagram.' : 'Its map checks and automatic diagram are off.'}><Toggle on={!!p.trusted} set={(v) => trust(p, v)} /></Line>)}
              </Card>
              <Card title="What leaves this computer" id="network" flash={flash}>
                <ul className="flex flex-col gap-1.5 py-1 text-body text-text-2">
                  <li>No telemetry, no analytics, no account. Mira has no server.</li>
                  <li>Usage meters, when on: api.anthropic.com and chatgpt.com, with your own sign-in.</li>
                  <li>Clone repository: the address you type.</li>
                  <li>Voice: only the model download, once, from GitHub. Your voice is turned into text on this computer.</li>
                  <li>Network check, when you run it: a simple request to GitHub, Anthropic, Claude, OpenAI, npm and PyPI.</li>
                  <li>Your agents talk to their own services, as they do in any terminal.</li>
                  <li>A project's map checks (commands, network calls) run only once you trust that project.</li>
                </ul>
              </Card>
              <Card title="Diagnostics" id="diagnostics" flash={flash}>
                <Line label="Export diagnostics" hint="A text file with versions, settings and recent errors, to send yourself to whoever helps you. E-mails, your user name and keys are removed. Mira sends nothing.">
                  <span className="flex items-center gap-2">{diag && <span className="text-meta text-text-3">{diag}</span>}<SecondaryButton onClick={() => void window.mira.diagnostics().then((p) => setDiag(p ? 'Saved' : ''))}>Export</SecondaryButton></span>
                </Line>
              </Card>
              <Card title="Clear data" id="clear" flash={flash}>
                <Line label="Recent projects" hint="The project list. Your folders are not touched."><ClearButton what="projects" /></Line>
                <Line label="Saved discussion prompts" hint="The .miraterminal/sessions folders of your projects."><ClearButton what="sessions" /></Line>
                <Line label="All settings"><ConfirmButton label="Reset" onConfirm={() => void window.mira.settings.reset()} /></Line>
              </Card>
            </>
          )}

          {section === 'keys' && (
            <Card id="keys" flash={flash}>
              {SHORTCUTS.map(([l, k]) => <Line key={l} label={l}><kbd className="text-body text-text-2 tnum">{k}</kbd></Line>)}
            </Card>
          )}

          {section === 'voice' && <VoiceSection s={s} set={set} flash={flash} L={L} />}

          {section === 'network' && (
            <>
              <p className="mt-2 text-body text-text-2">For company networks. Without a proxy, Mira uses your Mac's network settings.</p>
              <Card title="Proxy">
                {L('proxyUrl', 'Proxy', 'For Mira, and for the terminals and agents it starts (git, npm, Claude, Codex). Example: http://proxy.company.com:8080', <TextField value={s.proxyUrl} placeholder="http://host:port" error="Not a valid address, for example http://host:8080" pattern={/^((https?|socks5?):\/\/[\w.\-:@%]+(:\d+)?\/?)?$/} set={(v) => set({ proxyUrl: v })} />)}
                {L('noProxy', 'No proxy for', 'Hosts reached directly, comma separated.', <TextField value={s.noProxy} placeholder="localhost,127.0.0.1" error="Host names only, comma separated" pattern={/^[\w.,*\-: ]*$/} set={(v) => set({ noProxy: v })} />)}
                {L('http1', 'HTTP/1.1 compatibility', 'Some proxies and VPNs break HTTP/2. Takes effect after a restart.', <Toggle on={s.http1} set={(v) => set({ http1: v })} />)}
              </Card>
              <NetCheck />
              <RequiredDomains />
            </>
          )}

          {section === 'advanced' && <AdvancedSection s={s} set={set} flash={flash} L={L} />}

        </div>
      </div>
    </div>
  )
}

/* bold the part of a name that matches the search */
function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase())
  if (i < 0 || !q.trim()) return <>{text}</>
  const n = q.trim().length
  return <>{text.slice(0, i)}<b className="font-semibold text-text">{text.slice(i, i + n)}</b>{text.slice(i + n)}</>
}

function Card({ title, hint, id, flash, children }: { title?: ReactNode; hint?: string; id?: string; flash?: string | null; children: ReactNode }) {
  return (
    <section data-set={id} className={`mt-6 rounded-md border px-4 py-1 transition-colors ${flash && flash === id ? 'border-accent-line' : 'border-line'}`}>
      {title && (
        <div className="border-b border-line py-3">
          <div className="text-body font-medium text-text">{title}</div>
          {hint && <div className="mt-0.5 text-meta text-text-3">{hint}</div>}
        </div>
      )}
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </section>
  )
}

function Line({ id, flash, label, hint, children }: { id?: string; flash?: string | null; label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div data-set={id} className={`flex min-h-12 items-center gap-6 py-2.5 transition-colors ${flash && flash === id ? 'bg-accent-soft' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-body text-text">{label}</div>
        {hint && <div className="mt-0.5 text-meta text-text-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => set(!on)}
      className={`relative h-5 w-9 rounded-full border transition-colors ${on ? 'border-accent bg-accent' : 'border-line-strong bg-surface-2'}`}>
      <i className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${on ? 'left-[18px] bg-accent-text' : 'left-0.5 bg-text-3'}`} />
    </button>
  )
}

/* each agent's official install command, as its own docs give it */
const INSTALL: Record<string, string> = {
  claude: 'curl -fsSL https://claude.ai/install.sh | bash',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  cursor: 'curl https://cursor.com/install -fsS | bash',
  copilot: 'npm install -g @github/copilot',
  grok: 'curl -fsSL https://x.ai/cli/install.sh | bash'
}

/* jane•••@example.com */
const maskEmail = (e: string) => { const [u, d] = e.split('@'); return d ? `${u.slice(0, Math.min(4, Math.max(1, u.length - 2)))}•••@${d}` : e }

/* the sites Mira and the agents need : for a company firewall or proxy allow list */
const DOMAINS: [string, string[]][] = [
  ['Mira', ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']],
  ['Claude Code', ['api.anthropic.com', 'claude.ai', 'platform.claude.com', 'downloads.claude.ai']],
  ['Codex', ['chatgpt.com', 'auth.openai.com', 'api.openai.com']],
  ['Gemini CLI', ['generativelanguage.googleapis.com', 'cloudcode-pa.googleapis.com', 'accounts.google.com', 'oauth2.googleapis.com']],
  ['Cursor CLI', ['cursor.com', 'api2.cursor.sh']],
  ['Copilot CLI', ['api.githubcopilot.com', 'github.com']],
  ['Grok CLI', ['x.ai', 'api.x.ai', 'accounts.x.ai']],
  ['Packages', ['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org']]
]
function RequiredDomains() {
  const [copied, setCopied] = useState(false)
  const [show, setShow] = useState(false)
  const all = [...new Set(DOMAINS.flatMap(([, d]) => d))]
  return (
    <Card title="Required domains" id="domains" hint="Behind a company firewall or proxy, these must be allowed for Mira and the agents to work.">
      <Line label={`${all.length} domains`} hint="Copied one per line, ready to paste into an allow list.">
        <span className="flex items-center gap-2">
          <SecondaryButton onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</SecondaryButton>
          <SecondaryButton onClick={() => void navigator.clipboard.writeText(all.join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>{copied ? 'Copied' : 'Copy domains'}</SecondaryButton>
        </span>
      </Line>
      {show && DOMAINS.map(([who, d]) => <Line key={who} label={who} hint={d.join(', ')}><span /></Line>)}
    </Card>
  )
}

/* Advanced : graphics, settings to share, terminals, developer tools, files, and removing everything */
const gpuAtLaunch = { v: undefined as boolean | undefined }
function AdvancedSection({ s, set, flash, L }: { s: Settings; set: (p: Partial<Settings>) => void; flash: string | null; L: (id: string, label: string, hint: string | undefined, c: ReactNode) => ReactNode }) {
  gpuAtLaunch.v ??= s.gpu
  const [terms, setTerms] = useState(0)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [bye, setBye] = useState(false)
  const say = (k: string, v: string) => { setMsg((m) => ({ ...m, [k]: v })); setTimeout(() => setMsg((m) => ({ ...m, [k]: '' })), 2500) }
  useEffect(() => { const load = () => void window.mira.advanced.terminals().then(setTerms); load(); const t = setInterval(load, 2000); return () => clearInterval(t) }, [])
  const note = (k: string) => msg[k] && <span className="text-meta text-text-3">{msg[k]}</span>
  return (
    <>
      <Card title="Display">
        {L('gpu', 'Hardware acceleration', 'Turn it off if Mira flickers or draws badly on your screen.', (
          <span className="flex items-center gap-2">
            {s.gpu !== gpuAtLaunch.v && <SecondaryButton onClick={() => void window.mira.advanced.relaunch()}>Restart now</SecondaryButton>}
            <Toggle on={s.gpu} set={(v) => set({ gpu: v })} />
          </span>
        ))}
      </Card>
      <Card title="Share your settings" id="share" flash={flash}>
        <Line label="Export settings" hint="A file with your theme, terminal, editor and agent settings, to give to a friend. Your microphone, shell and proxy stay on this computer.">
          <span className="flex items-center gap-2">{note('export')}<SecondaryButton onClick={() => void window.mira.advanced.exportSettings().then((p) => p && say('export', 'Saved'))}>Export</SecondaryButton></span>
        </Line>
        <Line label="Import settings" hint="Replaces your settings with the ones in the file.">
          <span className="flex items-center gap-2">{note('import')}<SecondaryButton onClick={() => void window.mira.advanced.importSettings().then((r) => r.ok ? say('import', 'Imported') : r.error && say('import', r.error))}>Import</SecondaryButton></span>
        </Line>
      </Card>
      <Card title="Running terminals" id="terminals" flash={flash}>
        <Line label={terms === 1 ? '1 terminal running' : `${terms} terminals running`} hint="Stops every terminal and agent at once, for one that no longer answers.">
          {terms > 0 ? <ConfirmButton label="Stop all" onConfirm={() => void window.mira.advanced.stopTerminals().then(() => setTerms(0))} /> : <span />}
        </Line>
      </Card>
      <Card title="Files and tools" id="files" flash={flash}>
        <Line label="Settings file" hint="Every setting, as JSON."><SecondaryButton onClick={() => void window.mira.openPath('settings')}>Open</SecondaryButton></Line>
        <Line label="App data folder" hint="Projects list, settings, accounts, voice models."><SecondaryButton onClick={() => void window.mira.openPath('data')}>Show in Finder</SecondaryButton></Line>
        <Line id="devtools" label="Developer tools" hint="Mira's console, to see an error."><SecondaryButton onClick={() => void window.mira.advanced.devtools()}>Open</SecondaryButton></Line>
      </Card>
      <Card title="Remove Mira" id="remove" flash={flash}>
        <Line label="Remove all Mira data" hint="Settings, projects list, extra accounts and their sign-ins, voice models. Mira then quits. Your project folders and your agents' own settings are not touched.">
          {bye ? <span className="text-meta text-text-3">Removing</span> : <ConfirmButton label="Remove" onConfirm={() => { setBye(true); void window.mira.advanced.removeAll() }} />}
        </Line>
      </Card>
    </>
  )
}

function Choice({ value, options, set, danger }: { value: string; options: [string, string][]; set: (v: string) => void; danger?: string }) {
  const [ask, setAsk] = useState(false)
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex rounded-sm border border-line-strong p-0.5">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => (v === danger && value !== v ? setAsk(true) : set(v))}
            className={`h-6 rounded-xs px-2.5 text-meta ${value === v ? 'bg-surface-3 text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`}>{l}</button>
        ))}
      </div>
      {ask && (
        <div className="flex items-center gap-2 text-meta">
          <span className="text-bad">The agent will run commands without asking.</span>
          <button onClick={() => { set(danger!); setAsk(false) }} className="h-6 rounded-xs bg-bad px-2 text-accent-text">Turn on</button>
          <button onClick={() => setAsk(false)} className="h-6 rounded-xs px-2 text-text-2 hover:text-text">Cancel</button>
        </div>
      )}
    </div>
  )
}

function Stepper({ value, min, max, step = 1, suffix = '', set }: { value: number; min: number; max: number; step?: number; suffix?: string; set: (v: number) => void }) {
  const b = 'grid h-7 w-7 place-items-center text-text-2 hover:bg-surface-2 hover:text-text disabled:text-text-3'
  return (
    <div className="flex items-center rounded-sm border border-line-strong">
      <button className={b} disabled={value <= min} onClick={() => set(Math.max(min, value - step))}>−</button>
      <span className="w-16 text-center text-body text-text tnum">{step < 1 ? value.toFixed(2) : value.toLocaleString('en-US')}{suffix}</span>
      <button className={b} disabled={value >= max} onClick={() => set(Math.min(max, value + step))}>+</button>
    </div>
  )
}

function TextField({ value, placeholder, pattern, error = 'Not valid', set }: { value: string; placeholder?: string; pattern?: RegExp; error?: string; set: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [bad, setBad] = useState(false)
  useEffect(() => setV(value), [value])
  const commit = () => { const ok = pattern ? pattern.test(v.trim()) : !/[\n\r;&|`$<>]/.test(v); setBad(!ok); if (ok && v !== value) set(v.trim()) }
  return (
    <div className="flex flex-col items-end gap-1">
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder={placeholder} spellCheck={false}
        className={`h-7 w-56 rounded-sm border bg-transparent px-2 font-mono text-meta text-text outline-none placeholder:text-text-3 ${bad ? 'border-bad' : 'border-line-strong focus:border-text-3'}`} />
      {bad && <span className="text-meta text-bad">{pattern ? error : 'No ; & | ` $ < > or line breaks'}</span>}
    </div>
  )
}

function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false)
  const [done, setDone] = useState(false)
  if (done) return <span className="text-meta text-ok">Done</span>
  return ask
    ? <span className="flex items-center gap-2"><button onClick={() => { onConfirm(); setDone(true) }} className="h-7 rounded-sm bg-bad px-3 text-body text-accent-text">Confirm</button><SecondaryButton onClick={() => setAsk(false)}>Cancel</SecondaryButton></span>
    : <SecondaryButton onClick={() => setAsk(true)}>{label}</SecondaryButton>
}
const ClearButton = ({ what }: { what: 'projects' | 'sessions' }) => <ConfirmButton label="Clear" onConfirm={() => void window.mira.data.clear(what)} />

function Swatch({ on, color, label, onClick }: { on: boolean; color: string; label: string; onClick: () => void }) {
  return <button title={label} onClick={onClick} className={`h-6 w-6 rounded-full border-2 ${on ? 'border-text' : 'border-line-strong hover:border-text-3'}`} style={{ background: color }} />
}

/* the palette as the tasks show it : the six statuses, then the four priorities as tinted labels */
function TaskStrip({ palette }: { palette: Settings['taskPalette'] }) {
  const c = TASK_PALETTES[palette].c
  return (
    <div className="flex items-center gap-1.5 py-2">
      {c.slice(0, 6).map((_, i) => <i key={i} className="h-4 flex-1 rounded-xs" style={{ background: `var(--mira-${['status-progress', 'status-review', 'status-todo', 'status-backlog', 'status-done', 'status-canceled'][i]})` }} />)}
      <span className="w-2" />
      {['Urgent', 'High', 'Medium', 'Low'].map((l, i) => <span key={l} className="flex h-5 items-center rounded-xs px-2 text-meta font-medium" style={{ color: `var(--mira-priority-${i + 1})`, backgroundColor: `color-mix(in oklab, var(--mira-priority-${i + 1}) 16%, transparent)` }}>{l}</span>)}
    </div>
  )
}

function PaletteStrip({ colors }: { colors: string[] }) {
  if (!colors.length) return null
  return <div className="flex gap-1 py-2">{colors.map((c, i) => <i key={i} className="h-4 flex-1 rounded-xs" style={{ background: c }} />)}</div>
}

function ColorField({ value, set }: { value: string; set: (v: string) => void }) {
  return (
    <span className="flex items-center gap-2">
      <ColorSwatch value={value || '#000000'} onChange={set}>
        <span className="relative grid h-7 w-10 place-items-center overflow-hidden rounded-sm border border-line-strong" style={{ background: value || 'transparent' }}>
          {!value && <span className="text-meta text-text-3">Auto</span>}
        </span>
      </ColorSwatch>
      {value && <button onClick={() => set('')} className="text-meta text-text-3 hover:text-text">Reset</button>}
    </span>
  )
}

/* an agent's accounts, inside its card : who is signed in, which one is used, add or sign out (the sign-in runs in a terminal) */
function AgentAccounts({ agent, onRun }: { agent: 'claude' | 'codex'; onRun: (command: string, title: string) => void }) {
  const hideEmail = !!useSettings()?.hideEmail
  const [list, setList] = useState<Account[]>([])
  const [asking, setAsking] = useState<string | null>(null)
  const load = () => void window.mira.accounts.list(agent).then(setList)
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  const signIn = (a: Account) => onRun(agent === 'claude' ? `CLAUDE_CONFIG_DIR='${a.dir}' claude auth login` : `CODEX_HOME='${a.dir}' codex login`, 'Sign in')
  return (
    <div data-set="accounts">
      <div className="flex min-h-12 items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-body text-text">Accounts</div>
          <div className="mt-0.5 text-meta text-text-3">{agent === 'claude' ? 'Extra accounts share your plugins, skills, settings and MCP servers.' : 'Each account keeps its own sign-in.'}</div>
        </div>
        <SecondaryButton onClick={async () => { const r = await window.mira.accounts.add(agent); if (r) onRun(r.command, `${agent === 'claude' ? 'Claude' : 'Codex'} sign in`) }}>Add account</SecondaryButton>
      </div>
      {/* an extra account shows once it is signed in ; Add account finishes an unfinished one */}
      {list.filter((a) => a.system || a.signedIn).map((a) => (
        <div key={a.id} className="flex min-h-12 items-center gap-3 border-t border-line py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-body text-text">{(a.email && (hideEmail ? maskEmail(a.email) : a.email)) || (a.signedIn ? 'Signed in' : 'Not signed in yet')}</div>
            <div className="text-meta text-text-3">{[a.system ? 'This Mac' : 'Extra account', a.plan].filter(Boolean).join(', ')}</div>
          </div>
          {asking === a.id ? (
            <span className="flex items-center gap-2">
              <span className="text-meta text-text-2">{a.system ? 'Sign out of this account?' : 'Remove this account?'}</span>
              <SecondaryButton onClick={() => setAsking(null)}>Cancel</SecondaryButton>
              <button onClick={() => void window.mira.accounts.remove(agent, a.id).then(() => { setAsking(null); load() })} className="h-7 rounded-sm bg-bad px-3 text-body text-accent-text">{a.system ? 'Sign out' : 'Remove'}</button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {a.active
                ? <span className="flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-body text-text"><i className="h-1.5 w-1.5 rounded-full bg-ok" />In use</span>
                : a.signedIn && <SecondaryButton onClick={() => void window.mira.accounts.use(agent, a.id).then(load)}>Use</SecondaryButton>}
              {!a.signedIn && !a.system && <SecondaryButton onClick={() => signIn(a)}>Sign in</SecondaryButton>}
              {(a.signedIn || !a.system) && <button onClick={() => setAsking(a.id)} className="h-7 rounded-sm border border-bad-line px-3 text-body text-bad hover:bg-bad-soft">{a.system ? 'Sign out' : 'Remove'}</button>}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* checks that the services agents need answer, through the proxy if one is set */
function NetCheck() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof window.mira.netCheck>> | null>(null)
  const [busy, setBusy] = useState(false)
  const run = () => { setBusy(true); void window.mira.netCheck().then((r) => { setRows(r); setBusy(false) }) }
  return (
    <Card title="Network check" hint="Whether the services your agents use can be reached from here." id="netcheck">
      {rows?.map((r) => (
        <Line key={r.host} label={r.name} hint={r.host.replace('https://', '')}>
          <span className={`flex items-center gap-1.5 text-body ${r.ok ? 'text-text-2' : 'text-bad'}`}><i className={`h-1.5 w-1.5 rounded-full ${r.ok ? 'bg-ok' : 'bg-bad'}`} />{r.ok ? `${r.ms} ms` : r.detail}</span>
        </Line>
      ))}
      <Line label={rows ? (rows.every((r) => r.ok) ? 'Everything answers' : 'Some services do not answer') : 'Not checked yet'}>
        <SecondaryButton onClick={run} disabled={busy}>{busy ? 'Checking' : rows ? 'Check again' : 'Run the check'}</SecondaryButton>
      </Line>
    </Card>
  )
}

/* Voice : speak instead of typing, in any terminal or editor. Runs on this computer */
function VoiceSection({ s, set, flash, L }: { s: Settings; set: (p: Parameters<typeof window.mira.settings.set>[0]) => void; flash: string | null; L: (id: string, label: string, hint: string | undefined, c: ReactNode) => ReactNode }) {
  const [models, setModels] = useState<Awaited<ReturnType<typeof window.mira.voice.models>>>([])
  const [prog, setProg] = useState<{ id: string; done: number; total: number; unpacking?: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [vocab, setVocab] = useState(s.voiceVocabulary)
  const load = () => void window.mira.voice.models().then(setModels)
  useEffect(() => { load(); return window.mira.voice.onProgress((p) => { setProg(p); if (!p) load() }) }, [])
  useEffect(() => { void navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === 'audioinput'))) }, [])
  const any = models.some((m) => m.installed)
  return (
    <>
      <p className="mt-2 text-body text-text-2">Speak instead of typing, in any terminal or file. Press {kbd('⌘E')} to start and stop. It runs on this computer: your voice never leaves it.</p>
      <Card title="Voice model" hint="Downloaded once from the sherpa-onnx project on GitHub. Free and open source." id="voiceModel" flash={flash}>
        {(() => {
          const cur = models.find((m) => m.id === s.voiceModel) ?? models[0]
          if (!cur) return null
          const busy = prog?.id === cur.id
          return (
            <div className="flex min-h-14 items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-body text-text">Model</div>
                <div className="text-meta text-text-3">{cur.detail} {cur.quality}, {cur.mb} MB.</div>
              </div>
              <Dropdown value={cur.id} onChange={(id) => set({ voiceModel: id })}
                options={models.map((m) => ({ value: m.id, label: m.label, hint: `${m.mb} MB`, badge: m.installed ? 'Downloaded' : m.recommended ? 'Recommended' : undefined }))} />
              {busy ? (
                <span className="w-36 text-right text-meta text-text-2 tnum">{prog?.unpacking ? 'Unpacking' : `${Math.round((prog!.done / prog!.total) * 100)} %`}
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2"><i className="block h-full bg-text" style={{ width: `${(prog!.done / prog!.total) * 100}%` }} /></span></span>
              ) : cur.installed ? (
                <button onClick={() => void window.mira.voice.remove(cur.id).then(load)} className="h-7 rounded-sm border border-bad-line px-3 text-body text-bad hover:bg-bad-soft">Delete</button>
              ) : (
                <SecondaryButton disabled={!!prog} onClick={() => { setErr(''); void window.mira.voice.download(cur.id).then((e) => { if (e) setErr(e) }) }}>Download</SecondaryButton>
              )}
            </div>
          )
        })()}
        {!models.find((m) => m.id === s.voiceModel)?.installed && models.some((m) => m.installed) && (
          <div className="pb-3 text-meta text-text-3">Until this one is downloaded, dictation uses {models.find((m) => m.installed)?.label}.</div>
        )}
        {err && <div className="pb-3 text-meta text-bad">{err}</div>}
      </Card>
      <Card title="Dictation">
        {L('voiceMode', 'Shortcut', kbd('Press ⌘E to start then stop, or hold ⌘E while you speak.'), <Choice value={s.voiceMode} options={[['toggle', 'Press to start and stop'], ['hold', 'Hold while speaking']]} set={(v) => set({ voiceMode: v as Settings['voiceMode'] })} />)}
        {L('voiceLanguage', 'Language you speak', 'Mac follows the language of your Mac. Auto lets Whisper guess, less reliably on short phrases. Parakeet finds it by itself.', <Choice value={s.voiceLanguage} options={[['system', 'Mac'], ['auto', 'Auto'], ['en', 'English'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian']]} set={(v) => set({ voiceLanguage: v })} />)}
        {L('voiceMic', 'Microphone', undefined, (
          <Dropdown value={s.voiceMic} onChange={(v) => set({ voiceMic: v })}
            options={[{ value: '', label: 'System default' }, ...mics.filter((m) => m.deviceId && m.deviceId !== 'default').map((m) => ({ value: m.deviceId, label: m.label || 'Microphone' }))]} />
        ))}
      </Card>
      <Card title="Words">
        {L('voiceFillers', 'Remove hesitations', 'Removes euh, hum, um and uh.', <Toggle on={s.voiceFillers} set={(v) => set({ voiceFillers: v })} />)}
        <div data-set="voiceVocabulary" className="py-3">
          <div className="text-body text-text">Vocabulary</div>
          <div className="mt-0.5 text-meta text-text-3">Names and code terms written your way. One per line: what it hears =&gt; what you want. For example: mira terminal =&gt; Mira Terminal</div>
          <textarea value={vocab} onChange={(e) => setVocab(e.target.value)} onBlur={() => set({ voiceVocabulary: vocab })} rows={4} spellCheck={false}
            className="mt-2 w-full resize-y rounded-sm border border-line-strong bg-transparent p-2 font-mono text-meta text-text outline-none placeholder:text-text-3 focus:border-text-3" placeholder={'north wind => Northwind\nclaude code => Claude Code'} />
        </div>
      </Card>
    </>
  )
}

/* a dropdown in the Mira look : the choice on a button, the list in a small panel below */
function Dropdown({ value, options, onChange }: { value: string; options: { value: string; label: string; hint?: string; badge?: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', out); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc) }
  }, [open])
  const cur = options.find((o) => o.value === value) ?? options[0]
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} className={`flex h-7 min-w-48 items-center gap-2 rounded-sm border px-2.5 text-left text-body text-text ${open ? 'border-text-3' : 'border-line-strong hover:border-text-3'}`}>
        <span className="truncate">{cur?.label}</span>
        <ChevronRight size={14} className={`ml-auto shrink-0 text-text-3 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-72 rounded-md border border-line-strong bg-bg p-1 shadow-[var(--mira-shadow-float)]">
          {options.map((o) => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
              className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-body ${o.value === value ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-1 hover:text-text'}`}>
              <span className="truncate">{o.label}</span>
              {o.badge && <span className="shrink-0 rounded-xs border border-line-strong px-1.5 text-meta text-text-3">{o.badge}</span>}
              {o.hint && <span className="ml-auto shrink-0 text-meta text-text-3 tnum">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* the sidebar as it will look, with the marks chosen above : a sample project and one tab in each state.
   It is the real sidebar component, so every choice shows at once. */
const SAMPLE: ProjectInfo = { id: 'preview', name: 'Mira', path: '~/Projects/Mira', addedAt: 0, openedAt: 0, git: true }
function TabsPreview() {
  const [since] = useState(() => Date.now() - 84_000)
  // the agents' own states, with the marks of Settings ; a fourth tab is a plain terminal, a fifth finished and already seen
  const tabs: SideTab[] = [
    { key: 1, title: 'Fix the login flow', projectId: 'preview', agent: 'claude', status: 'working', since },
    { key: 2, title: 'Pricing page', projectId: 'preview', agent: 'codex', status: 'needs' },
    { key: 3, title: 'Write the tests', projectId: 'preview', agent: 'claude', status: 'done', seen: false },
    { key: 4, title: 'zsh', projectId: 'preview' },
    { key: 5, title: 'Release notes', projectId: 'preview', agent: 'gemini', status: 'done', seen: true }
  ]
  const none = () => {}
  return (
    // shown larger than life, so the marks read well
    <div className="flex gap-4 py-5" style={{ zoom: 1.3 }}>
      <div className="pointer-events-auto w-72 shrink-0 rounded-md border border-line bg-bg p-2">
        <SideProjects icons={{}} projects={[SAMPLE]} tabs={tabs} current="preview" active={4} onScreen={new Set([4])} page={false}
          collapsed={new Set()} onToggle={none} onOpen={none} onTab={none} onClose={none}
          icon={(t) => (t.agent ? <AgentIcon id={t.agent} /> : <SquareTerminal size={14} />)} tip={(t) => t.title}
          openCount={() => 0} onTasks={none} onMove={none}
          peek={(t) => (t.status === 'needs' ? { text: 'Should the yearly plan show a discount?', questions: 1 } : t.status === 'done' ? { text: 'The tests pass, 24 of 24.', questions: 0 } : t.status === 'working' ? { text: 'Reading the login routes.', questions: 0 } : null)} />
      </div>
      {/* the narrow sidebar : the project's most pressing tab shows on its icon */}
      <div className="flex w-12 shrink-0 flex-col items-center gap-3 rounded-md border border-line bg-bg py-3">
        {[['working', 'claude'], ['needs', 'codex'], ['unread', 'claude']].map(([st, a]) => (
          <span key={st} title={st === 'working' ? 'Working' : st === 'needs' ? 'Waits for you' : 'Finished'} className={stClass(st as ReturnType<typeof projectState>)}><span className="mira-ic h-5 w-5"><AgentIcon id={a} size={16} /></span></span>
        ))}
      </div>
    </div>
  )
}
