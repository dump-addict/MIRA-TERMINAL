/* Diagram : when a project only has the folder map, Mira asks the user's agent to read the code and write the real one.
   The agent runs headless in the project, with the bundled skill as its instructions ; the map view refreshes by itself. */
import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getSettings } from './settings'
import { accountEnv } from './accounts'
import { isKnown, isTrusted } from './projects'
import { noLinks } from './safepath'
import { isWin, posixShell, PYTHON } from './platform'

export type Analysis = { state: 'idle' | 'running' | 'done' | 'error' | 'stopped'; placeholder: boolean; agent: string; step: string; phase: number; startedAt: number; error: string }

const sh = posixShell()
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const skillDir = () => (app.isPackaged ? join(process.resourcesPath, 'skill/miraterminal') : join(app.getAppPath(), 'skill/miraterminal'))
const mapFile = (root: string) => join(root, '.miraterminal', 'map.json')
const markFile = (root: string) => join(root, '.miraterminal', 'analysis.json')
const LIMIT = 40 * 60 * 1000

// the headless command of each agent ; the request arrives on its standard input ; the user's hooks (sounds, notifications) stay quiet
const CMD: Record<string, string> = {
  cursor: 'cursor-agent -p --force --output-format text',
  copilot: 'copilot --allow-all-tools -p "$(cat)"',
  grok: 'grok --always-approve --no-auto-update --output-format plain -p "$(cat)"',
  claude: `claude -p --settings '{"disableAllHooks":true}' --permission-mode acceptEdits --allowedTools 'Read Glob Grep Write Edit Bash(git ls-files:*) Bash(git log:*) Bash(${PYTHON}:*)' --output-format stream-json --include-partial-messages --verbose`,
  codex: 'codex exec --full-auto -',
  gemini: 'gemini --approval-mode auto_edit'
}

const running = new Map<string, { proc: ChildProcess; a: Analysis; stopped?: boolean; kill?: () => void }>()
const last = new Map<string, Analysis>()

const readMap = (root: string): { source?: string; nodes?: unknown[] } | null => { try { return JSON.parse(readFileSync(mapFile(root), 'utf8')) } catch { return null } }
const isPlaceholder = (root: string) => readMap(root)?.source === 'structure'
const mark = (root: string): { state?: string; error?: string } | null => { try { return JSON.parse(readFileSync(markFile(root), 'utf8')) } catch { return null } }

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|sol|java|kt|swift|rb|php|c|cc|cpp|h|cs|vue|svelte|html|sh|sql|move|cairo)$/i
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.venv', 'venv', '__pycache__', 'target', 'vendor', 'coverage'])
// a project with nothing to read yet (a new, empty folder) is not analysed
function hasCode(dir: string, budget = { n: 2000 }, depth = 0): boolean {
  let ents: import('node:fs').Dirent[] = []
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return false }
  for (const e of ents) {
    if (budget.n-- <= 0) return false
    if (e.isFile() && CODE.test(e.name)) return true
    if (e.isDirectory() && depth < 5 && !SKIP.has(e.name) && !e.name.startsWith('.') && hasCode(join(dir, e.name), budget, depth + 1)) return true
  }
  return false
}

function send(root: string, a: Analysis): void {
  last.set(root, a)
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('analysis:state', root, a)
}
function status(root: string): Analysis {
  const r = running.get(root)
  if (r) return r.a
  const placeholder = isPlaceholder(root)
  const m = mark(root), l = last.get(root)
  // a failure is only shown while there is no diagram : one drawn since (by a later run, or by hand) wins over it
  if (l && l.state !== 'running' && (placeholder || l.state !== 'error')) return { ...l, placeholder }
  return { state: placeholder && m?.state === 'error' ? 'error' : 'idle', placeholder, agent: '', step: '', phase: 0, startedAt: 0, error: placeholder ? m?.error ?? '' : '' }
}

const installedCache = new Map<string, boolean>()
const has = (cmd: string) => new Promise<boolean>((res) => {
  if (installedCache.has(cmd)) return res(installedCache.get(cmd)!)
  execFile(sh, ['-ilc', `command -v ${cmd}`], { windowsHide: true, timeout: 8000 }, (e, out) => { const ok = !e && /\//.test(String(out)); installedCache.set(cmd, ok); res(ok) })
})
// the model the user set for an agent in Mira (Settings, Agents : Model, or --model in its extra arguments), or '' for the agent's own default
function modelOf(agent: string): string {
  const conf = getSettings().agents?.[agent]
  if (conf?.model) return conf.model
  const m = (conf?.args ?? '').match(/(?:^|\s)(?:--model|-m)(?:=|\s+)([\w.:[\]-]+)/)
  return m ? m[1] : ''
}

// the user's default agent when it can run headless, else the first one that can
async function pickAgent(): Promise<string | null> {
  const first = getSettings().defaultAgent
  const BIN: Record<string, string> = { claude: 'claude', codex: 'codex', gemini: 'gemini', cursor: 'cursor-agent', copilot: 'copilot', grok: 'grok' }
  for (const id of [first, 'claude', 'codex', 'gemini', 'cursor', 'copilot', 'grok']) if (BIN[id] && await has(BIN[id])) return id
  return null
}

function prompt(root: string): string {
  const s = skillDir()
  return [
    `Draw the architecture diagram of this project (root: ${root}).`,
    `Your instructions are in ${join(s, 'SKILL.md')} and the format in ${join(s, 'schema.md')}: read both first.`,
    `The current .miraterminal/map.json is only a placeholder made from folder names (source "structure"). You are in "generate" mode: read the code and replace that file completely. Do not keep its blocks.`,
    `Do steps 1 to 3 of the instructions only. Do not open the map and do not start any server (skip step 4).`,
    `Every link must come from a real call, import, request, transaction or config reference you saw in the code, and must carry it as "evidence": [{ "path", "line", "match" }] (match = a short piece of that line, copied as is). Leave out what you cannot prove.`,
    `Never merge two different things into one block: two addresses, two keys or two environment variables with different roles are two blocks. Every source file belongs to a block.`,
    `A helper that reads the code without AI is next to the instructions: ${PYTHON} ${q(join(s, 'index.py'))} --root . build, then summary (imports, routes, HTTP calls, hosts, env variable names). Use it before reading the files.`,
    `Set "source": "agent" in the map.`,
    `When the map is written, check it against the code: ${PYTHON} ${q(join(s, 'index.py'))} --root . verify .miraterminal/map.json. Fix every error, orphan file and unlinked call it lists (edit the map, do not rewrite it whole), and run it again until it prints "verified" (three rounds at most).`,
    `Last, validate the format with: ${PYTHON} ${q(join(s, 'server.py'))} --root . --validate, and fix what it reports.`,
    `Change nothing in the project except files under .miraterminal/. Never read or copy the value of a secret.`
  ].join('\n')
}

// a short line for the progress : what the agent is doing right now
function stepOf(root: string, line: string): string {
  try {
    const m = JSON.parse(line)
    for (const c of m?.message?.content ?? []) {
      if (c.type !== 'tool_use') continue
      const i = c.input ?? {}
      const p = i.file_path ? relative(root, String(i.file_path)) : ''
      if (c.name === 'Read') return p.startsWith('..') ? 'Reading the instructions' : `Reading ${p}`
      if (c.name === 'Write' || c.name === 'Edit') return 'Writing the diagram'
      if (c.name === 'Grep' || c.name === 'Glob') return `Searching ${String(i.pattern ?? '').slice(0, 40)}`
      if (c.name === 'Bash') return /--validate/.test(String(i.command)) ? 'Checking the diagram' : / verify /.test(String(i.command)) ? 'Checking every link against the code' : 'Listing the files'
    }
  } catch { /* not a JSON line */ }
  return ''
}

// the five stages of a run, in order : instructions, inventory, reading the code, writing, checking (never goes back)
export const PHASES = 5
const phaseOf = (step: string): number => (/^Checking/.test(step) ? 5 : /^Writing/.test(step) ? 4 : /^Reading the instructions/.test(step) ? 1 : /^Listing/.test(step) ? 2 : /^Thinking/.test(step) ? 0 : 3)

export async function startAnalysis(root: string, auto = false): Promise<Analysis> {
  if (running.has(root)) return running.get(root)!.a
  if (!isKnown(root) || !isPlaceholder(root)) return status(root)
  // by itself, only once : a failed or stopped run waits for the user's button
  if (auto && (mark(root) || getSettings().mapEnabled === false || getSettings().mapAuto === false || !hasCode(root))) return status(root)
  // a project the user has not trusted (a cloned repository) never starts an agent by itself : its files could steer it
  const trusted = isTrusted(root)
  if (auto && !trusted) return status(root)
  // every file the run writes stays a real file inside the project (a cloned repository could link them elsewhere)
  if (!['analysis.log', 'analysis.json', 'map.json', 'layout.json'].every((n) => noLinks(root, join(root, '.miraterminal', n)))) {
    const a: Analysis = { state: 'error', placeholder: true, agent: '', step: '', phase: 0, startedAt: 0, error: 'The project folder .miraterminal holds links to files outside the project' }
    if (!auto) send(root, a)
    return a
  }
  const agent = await pickAgent()
  if (!agent) { const a: Analysis = { state: 'error', placeholder: true, agent: '', step: '', phase: 0, startedAt: 0, error: 'No agent installed (Claude Code, Codex or Gemini CLI)' }; if (!auto) send(root, a); return a }
  if (running.has(root)) return running.get(root)!.a
  const backup = readFileSync(mapFile(root), 'utf8')
  const a: Analysis = { state: 'running', placeholder: true, agent, step: 'Starting', phase: 1, startedAt: Date.now(), error: '' }
  // Claude : the fast way first (several readers at once, see skill/miraterminal/orchestrate.py) ; if it gives nothing, one agent reads everything
  // the single agent reads the project with shell access : only for a trusted project ; otherwise the sandboxed readers only
  let fast = process.env.MIRA_ONE_AGENT !== '1' || !trusted
  // the model : the one set for this agent in Mira's settings (its extra arguments), else the agent's own default, as in the terminal.
  // One model for the whole diagram, never another.
  const model = modelOf(agent)
  const fastCmd = `${accountEnv(agent)}exec ${PYTHON} ${q(join(skillDir(), 'orchestrate.py'))} --root . --agent ${agent}${model ? ` --model ${q(model)}` : ''}`
  const oneCmd = `${accountEnv(agent)}exec ${CMD[agent]}${model ? ` ${agent === 'codex' || agent === 'gemini' ? '-m' : '--model'} ${q(model)}` : ''}`
  const launch = (): ChildProcess => spawn(sh, ['-ilc', fast ? fastCmd : oneCmd], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], detached: !isWin, windowsHide: true, env: { ...process.env, MIRA_ANALYSIS: '1' } })
  // the readers are children of that process : stopping it stops them all
  // the whole tree : the process group on macOS and Linux, taskkill /T on Windows (Git Bash leaves python as a child)
  const kill = (p: ChildProcess): void => {
    if (isWin) { if (p.pid) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {}); return }
    try { if (p.pid) process.kill(-p.pid, 'SIGTERM') } catch { try { p.kill() } catch { /* already gone */ } }
  }
  let proc = launch()
  const timer = setTimeout(() => finish('error', 'Took too long'), LIMIT)
  const entry: { proc: ChildProcess; a: Analysis; stopped?: boolean; kill?: () => void } = { proc, a, kill: () => kill(proc) }
  running.set(root, entry)
  send(root, a)
  // the last error the fast way reported itself (a MIRA line with error), clearer than its exit code
  let buf = '', err = '', said = '', done = false, writing = false, written = 0
  // every line the agent prints, with its time since the start : kept to measure where the time goes
  const log = createWriteStream(join(root, '.miraterminal', 'analysis.log'))
  log.on('error', () => { /* read-only project */ })
  const mapOk = (): boolean => { const m = readMap(root); return !!m && m.source !== 'structure' && Array.isArray(m.nodes) && m.nodes.length > 0 }

  function finish(state: 'done' | 'error' | 'stopped', error = ''): void {
    if (done) return
    // the fast way left no diagram : the same request goes to one agent, which reads the project by itself
    if (fast && trusted && state !== 'stopped' && error !== 'Took too long' && !mapOk()) {
      fast = false; buf = ''; err = ''; said = ''
      log.write(`${((Date.now() - a.startedAt) / 1000).toFixed(1)}\tfast way failed (${error || state}), one agent takes over\n`)
      a.step = 'Reading with one agent'; a.phase = 1; send(root, { ...a })
      proc = launch(); entry.proc = proc; wire(proc)
      return
    }
    done = true
    clearTimeout(timer); running.delete(root); log.end()
    kill(proc)
    const ok = mapOk()
    // the agent left nothing usable : the folder map comes back
    if (!ok) { try { writeFileSync(mapFile(root), backup) } catch { /* the folder went away */ } }
    // a new diagram has new blocks : positions saved by hand for the old one would drag a block of the same name out of its column
    if (ok) { try { writeFileSync(join(root, '.miraterminal', 'layout.json'), JSON.stringify({ positions: {}, positions3d: {} }, null, 1) + '\n') } catch { /* read-only project */ } }
    const end: Analysis = ok ? { ...a, state: 'done', placeholder: false, step: '' } : { ...a, state: state === 'done' ? 'error' : state, step: '', error: error || (state === 'stopped' ? '' : trusted ? 'The agent did not write the diagram' : 'The diagram could not be drawn. Trust the project to let one agent read it') }
    try { writeFileSync(markFile(root), JSON.stringify({ state: end.state, agent, way: fast ? 'readers' : 'one agent', at: new Date().toISOString(), seconds: Math.round((Date.now() - a.startedAt) / 1000), error: end.error }, null, 1)) } catch { /* read-only project */ }
    send(root, end)
  }

  function onLines(lines: string[]): void {
    for (const l of lines) {
      if (!l.trim()) continue
      const stamp = ((Date.now() - a.startedAt) / 1000).toFixed(1)
      // the fast way reports its own progress : a stage and what it is doing
      if (l.startsWith('MIRA ')) {
        log.write(`${stamp}\t${l}\n`)
        try { const m = JSON.parse(l.slice(5)); if (m.error && m.step) said = String(m.step).slice(0, 200); if (m.step) { a.step = String(m.step).slice(0, 80); a.phase = Math.max(1, Math.min(PHASES, Number(m.phase) || a.phase)); send(root, { ...a }) } } catch { /* a cut line */ }
        continue
      }
      // the answer as it is being written : what the agent starts (a thought, a tool call), and how much of the diagram is written so far
      let s = ''
      if (l.startsWith('{"type":"stream_event"')) {
        try {
          const ev = JSON.parse(l).event
          if (ev?.type === 'content_block_start') {
            const b = ev.content_block ?? {}
            writing = b.type === 'tool_use' && (b.name === 'Write' || b.name === 'Edit'); written = 0
            log.write(`${stamp}\tstart ${b.type}${b.name ? ' ' + b.name : ''}\n`)
            s = writing ? 'Writing the diagram' : b.type === 'thinking' ? 'Thinking it through' : ''
          } else if (ev?.type === 'content_block_delta' && writing && ev.delta?.type === 'input_json_delta') {
            const before = Math.floor(written / 2000)
            written += String(ev.delta.partial_json ?? '').length
            if (Math.floor(written / 2000) !== before) s = `Writing the diagram, ${Math.round(written / 1000)} kB`
          } else if (ev?.type === 'content_block_stop' && writing) { log.write(`${stamp}\twritten ${written} chars\n`) }
        } catch { /* a cut line */ }
      } else {
        log.write(`${stamp}\t${l}\n`)
        s = stepOf(root, l)
      }
      if (s && s !== a.step) { a.step = s; a.phase = Math.max(a.phase, phaseOf(s)); send(root, { ...a }) }
    }
  }
  function wire(p: ChildProcess): void {
    p.stdout!.on('data', (b: Buffer) => { buf += b.toString(); const lines = buf.split('\n'); buf = lines.pop() ?? ''; onLines(lines) })
    p.stderr!.on('data', (b: Buffer) => { err = (err + b.toString()).slice(-2000) })
    p.on('error', (e) => { if (p === proc) finish('error', e.message) })
    p.on('exit', (code) => { if (p === proc) finish(entry.stopped ? 'stopped' : code === 0 ? 'done' : 'error', code === 0 ? '' : said || err.split('\n').filter(Boolean).pop()?.slice(0, 200) || `The agent stopped (${code})`) })
    p.stdin!.on('error', () => { /* the agent closed its input */ })
    p.stdin!.end(fast ? '' : prompt(root))
  }
  wire(proc)
  return a
}

export function stopAnalyses(): void { for (const r of running.values()) { try { r.kill ? r.kill() : r.proc.kill() } catch { /* gone */ } } }

export function registerAnalysis(): void {
  ipcMain.handle('analysis:get', (_e, root: string) => (isKnown(root) && existsSync(root) ? status(root) : null))
  ipcMain.handle('analysis:start', (_e, root: string) => (isKnown(root) ? startAnalysis(root) : null))
  ipcMain.handle('analysis:stop', (_e, root: string) => { const r = running.get(root); if (r) { r.stopped = true; try { r.kill ? r.kill() : r.proc.kill() } catch { /* gone */ } } return true })
}
