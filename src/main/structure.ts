/* Structure map: derived from folders and key files, no AI, written only when there is no map yet */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { noLinks } from './safepath'

const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.nuxt', 'coverage', '.venv', 'venv', '__pycache__',
  'target', '.miraterminal', '.claude', '.idea', '.vscode', '.turbo', '.cache', 'vendor', '.DS_Store'])

type Kind = 'app' | 'server' | 'contract' | 'database' | 'code' | 'test' | 'deploy' | 'research' | 'key' | 'cloud'
type Group = { id: string; label: string; row: number; color: string }
const GROUPS: Record<string, Group> = {
  interface: { id: 'interface', label: 'Interface', row: 0, color: '#7dd3fc' },
  code: { id: 'code', label: 'Code', row: 0, color: '#a5b4fc' },
  serveur: { id: 'serveur', label: 'Server', row: 0, color: '#86efac' },
  chaine: { id: 'chaine', label: 'Contracts', row: 0, color: '#fcd34d' },
  donnees: { id: 'donnees', label: 'Data', row: 0, color: '#f9a8d4' },
  outils: { id: 'outils', label: 'Tools and tests', row: 1, color: '#cbd5e1' },
  infra: { id: 'infra', label: 'Infra and docs', row: 1, color: '#c4b5fd' },
  autre: { id: 'autre', label: 'Other', row: 1, color: '#d4d4d4' }
}
const RULES: [RegExp, Kind, string][] = [
  [/^(app|apps|web|front|frontend|client|ui|site|www|public|pages|mobile)$/i, 'app', 'interface'],
  [/^(server|api|backend|services?|worker|functions)$/i, 'server', 'serveur'],
  [/^(contracts?|solidity|programs|onchain|evm)$/i, 'contract', 'chaine'],
  [/^(db|database|migrations|prisma|data|results|datasets?)$/i, 'database', 'donnees'],
  [/^(scripts?|bin|tools|cli|bench)$/i, 'code', 'outils'],
  [/^(tests?|__tests__|spec|specs|e2e)$/i, 'test', 'outils'],
  [/^(deploy|infra|ops|docker|k8s|terraform|\.github|config)$/i, 'deploy', 'infra'],
  [/^(docs?|research|notebooks?|papers?)$/i, 'research', 'infra'],
  [/^(src|lib|libs|packages|crates|cmd|internal|core|modules)$/i, 'code', 'code']
]
const KEY_FILES = /^(readme(\.md)?|index\.[a-z]+|main\.[a-z]+|app\.[a-z]+|server\.[a-z]+|package\.json|pyproject\.toml|cargo\.toml|go\.mod|foundry\.toml|dockerfile|.*\.sol)$/i

function list(dir: string): { dirs: string[]; files: string[] } {
  try {
    const ents = readdirSync(dir, { withFileTypes: true })
    return {
      dirs: ents.filter((e) => e.isDirectory() && !IGNORE.has(e.name) && !(e.name.startsWith('.') && e.name !== '.github')).map((e) => e.name).sort(),
      files: ents.filter((e) => e.isFile() && e.name !== '.DS_Store').map((e) => e.name).sort()
    }
  } catch { return { dirs: [], files: [] } }
}
function countFiles(dir: string, budget = { n: 4000 }): number {
  let c = 0
  for (const e of (() => { try { return readdirSync(dir, { withFileTypes: true }) } catch { return [] } })()) {
    if (budget.n-- <= 0) break
    if (e.isDirectory()) { if (!IGNORE.has(e.name) && !e.name.startsWith('.')) c += countFiles(join(dir, e.name), budget) }
    else c++
  }
  return c
}
function keyFiles(rel: string, files: string[]) {
  const pick = files.filter((f) => KEY_FILES.test(f)).concat(files.filter((f) => !KEY_FILES.test(f))).slice(0, 5)
  return pick.map((f) => ({ path: rel ? `${rel}/${f}` : f, role: '' }))
}
function techOf(root: string): string[] {
  const t: string[] = []
  try {
    const p = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const d = { ...p.dependencies, ...p.devDependencies }
    for (const [k, v] of [['react', 'React'], ['next', 'Next.js'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['vite', 'Vite'], ['electron', 'Electron'], ['express', 'Express'], ['typescript', 'TypeScript'], ['tailwindcss', 'Tailwind']])
      if (d[k]) t.push(v)
  } catch { /* no package.json */ }
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt'))) t.push('Python')
  if (existsSync(join(root, 'foundry.toml'))) t.push('Foundry')
  if (existsSync(join(root, 'Cargo.toml'))) t.push('Rust')
  if (existsSync(join(root, 'go.mod'))) t.push('Go')
  return t
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'racine'

export function buildStructureMap(root: string) {
  const top = list(root)
  const nodes: Record<string, unknown>[] = []
  const used = new Set<string>()
  for (const d of top.dirs.slice(0, 24)) {
    const rule = RULES.find(([re]) => re.test(d))
    const kind: Kind = rule ? rule[1] : 'code'
    const group = rule ? rule[2] : 'autre'
    used.add(group)
    const id = slug(d)
    const sub = list(join(root, d))
    const n = countFiles(join(root, d))
    nodes.push({ id, label: d, group, kind, status: 'live', summary: `${n} file${n === 1 ? '' : 's'}`, files: keyFiles(d, sub.files), tech: [] })
    // subfolders: folded into their parent in the "Essential" view
    for (const s of sub.dirs.slice(0, 12)) {
      const sn = countFiles(join(root, d, s))
      const ss = list(join(root, d, s))
      nodes.push({ id: `${id}--${slug(s)}`, parent: id, label: s, group, kind, status: 'live', summary: `${sn} file${sn === 1 ? '' : 's'}`, files: keyFiles(`${d}/${s}`, ss.files), tech: [] })
    }
  }
  // root files: a "Root" block if any are useful
  const rootKeys = top.files.filter((f) => KEY_FILES.test(f) || /^(\.env\.example|vercel\.json|docker-compose\.ya?ml)$/i.test(f))
  if (rootKeys.length || !nodes.length) {
    used.add('code')
    nodes.unshift({ id: 'racine', label: basename(root), group: 'code', kind: 'code', status: 'live', summary: `${top.files.length} file${top.files.length === 1 ? '' : 's'} at the root`, files: rootKeys.slice(0, 6).map((f) => ({ path: f, role: '' })), tech: techOf(root) })
  }
  const order = ['interface', 'code', 'serveur', 'chaine', 'donnees', 'outils', 'infra', 'autre'].filter((g) => used.has(g))
  const cols: Record<number, number> = {}
  const groups = order.map((g) => { const G = GROUPS[g]; const col = cols[G.row] ?? 0; cols[G.row] = col + 1; return { id: G.id, label: G.label, color: G.color, col, row: G.row } })
  return {
    version: 1,
    project: basename(root),
    summary: 'Folder structure.',
    lang: 'en',
    source: 'structure',
    generated_at: new Date().toISOString().slice(0, 10),
    groups, nodes, links: [], flows: []
  }
}

/* writes the structure map if the project has no map yet; never touches an existing map */
export function ensureStructureMap(root: string): boolean {
  const dir = join(root, '.miraterminal'), f = join(dir, 'map.json')
  // a cloned repository could ship a dangling link as map.json : never written through
  if (existsSync(f) || !noLinks(root, f)) return false
  try {
    if (!statSync(root).isDirectory()) return false
    mkdirSync(dir, { recursive: true })
    writeFileSync(f, JSON.stringify(buildStructureMap(root), null, 1))
    return true
  } catch { return false }
}
