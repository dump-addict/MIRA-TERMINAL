/* What differs between macOS, Windows and Linux, in one place.
   Mira runs the agents and its own helper commands through a POSIX login shell : the user's shell on macOS and Linux,
   Git Bash on Windows (Git for Windows is already required by Claude Code there). Plain terminals keep the user's
   own shell (PowerShell on Windows). */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const isMac = process.platform === 'darwin'
export const isWin = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

/* Git Bash on Windows, or null when Git for Windows is missing */
let bashPath: string | null | undefined
export function gitBash(): string | null {
  if (!isWin) return null
  if (bashPath !== undefined) return bashPath
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const cands = [
    process.env.MIRA_BASH,
    join(pf, 'Git', 'bin', 'bash.exe'),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')
  ]
  try {
    const git = execFileSync('where', ['git'], { encoding: 'utf8', timeout: 3000, windowsHide: true }).split(/\r?\n/)[0].trim()
    // ...\Git\cmd\git.exe -> ...\Git\bin\bash.exe
    if (git) cands.push(join(dirname(dirname(git)), 'bin', 'bash.exe'))
  } catch { /* git is not on PATH */ }
  bashPath = cands.find((c) => !!c && existsSync(c)) ?? null
  return bashPath
}

/* the POSIX shell Mira's own commands run in (always called with -ilc or -l -c) */
export const posixShell = (): string => (isWin ? gitBash() || 'bash.exe' : process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash'))

/* Python 3 : python3 on macOS and Linux, python on Windows (python3 there is often only the Store's placeholder) */
export const PYTHON = isWin ? 'python' : 'python3'

/* runs a command line in the login shell (the user's full PATH), resolves with its output, never rejects */
export const shellOut = (cmd: string, timeout = 8000, env?: NodeJS.ProcessEnv): Promise<string> =>
  new Promise((res) => execFile(posixShell(), ['-ilc', cmd], { timeout, windowsHide: true, env: env ? { ...process.env, ...env } : process.env }, (_e, out) => res(String(out ?? '').trim())))

/* `command -v` as a path this process can run : on Windows, Git Bash gives /c/... and cygpath turns it into C:\... */
export const nativePathOf = (cmd: string) => (isWin ? `p=$(command -v ${cmd}) && cygpath -w "$p"` : `command -v ${cmd}`)

/* a path printed by the login shell is a real path : /usr/local/bin/x on macOS and Linux, C:\...\x.exe on Windows */
export const looksLikePath = (s: string) => /^\/|^[A-Za-z]:\\/.test(s)
