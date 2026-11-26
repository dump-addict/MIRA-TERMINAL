// Syntax checks for the parts TypeScript does not cover: the map's Python and the plain JavaScript of the viewer and the site
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// a folder that is not there is skipped : the public repository has no site
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(ext)).map((f) => join(dir, f))
const js = [...list('skill/miraterminal/viewer', '.js'), ...list('site', '.js')]
const py = list('skill/miraterminal', '.py')

let failed = 0
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }) } catch (e) { failed++; console.error(String(e.stderr)) }
}
// ast.parse rather than py_compile: nothing is written to __pycache__
const parse = 'import ast, sys\nfor f in sys.argv[1:]:\n    ast.parse(open(f, encoding="utf-8").read(), f)'
try { execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', parse, ...py], { stdio: 'pipe' }) } catch (e) { failed++; console.error(String(e.stderr)) }

if (failed) process.exit(1)
console.log(`syntax ok: ${js.length} JavaScript and ${py.length} Python files`)
