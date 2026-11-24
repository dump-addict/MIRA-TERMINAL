/* Paths inside a folder that a repository controls. A cloned project can turn any part of a path into a symbolic link
   to something elsewhere (.miraterminal/analysis.log -> ~/.zshrc, notes -> ~). Before Mira reads or writes there,
   every part from the base folder down to the file must be a real folder or file, never a link, and the real path
   must stay inside the base. */
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const isLink = (p: string) => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }

/** true when `path` is `base` itself or lies inside it, with no symbolic link on the way (for the parts that exist yet) */
export function noLinks(base: string, path: string): boolean {
  const b = resolve(base), p = resolve(path)
  const rel = relative(b, p)
  if (rel.startsWith('..') || isAbsolute(rel)) return false
  let cur = b
  for (const part of rel ? rel.split(sep) : []) { cur = join(cur, part); if (isLink(cur)) return false }
  try {
    const rb = realpathSync(b)
    // the nearest part that exists, resolved, stays inside the base
    for (let d = p; ; d = dirname(d)) {
      try { const rd = realpathSync(d); return rd === rb || rd.startsWith(rb + sep) } catch { if (dirname(d) === d) return false }
    }
  } catch { return false }
}
