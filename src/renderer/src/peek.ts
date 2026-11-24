/* What an agent last said, read from its terminal screen : for the card shown when a tab is hovered in the sidebar.
   Nothing is asked of the agent ; the text is the one already on screen. */
import type { Terminal } from '@xterm/xterm'

const screens = new Map<string, Terminal>()
export const keepScreen = (pty: string, term: Terminal) => { screens.set(pty, term); return () => { screens.delete(pty) } }

const FOOT = /shift\+tab|for shortcuts|\? for|auto mode|accept edits|plan mode|bypass permissions|\/effort|transcript saving|context left|esc to|ctrl\+|for agents|f2 to view|tokens|update available|enter to (confirm|select)|↑\/↓|tab to/i
const RULE = /^[\s─━═╭╮╰╯┌┐└┘├┤│┃╌┄-]*$/
// the marks agents put before what they say : Claude ⏺ (or ●), Codex •, Gemini ✦
const SAYS = /^\s*(⏺|●|•|✦)\s+/
// a turn's spinner or its closing line (“✻ Cooked for 4s”), and a tool call
const SPIN = /^\s*[✻✢✶✽✳*·]\s+\S+(ing|ed)\b/
const TOOL = /^\s*(⏺|●|•)\s+(Read|Bash|Edit|Write|Update|Search|Grep|Glob|Ran|Explored|Edited|Fetch|Web\w*|Task|Agent)\b/

export type Peek = { text: string; questions: number }
export function peek(pty?: string): Peek | null {
  const term = pty ? screens.get(pty) : undefined
  if (!term) return null
  const b = term.buffer.active
  const from = Math.max(0, b.baseY + term.rows - 80), to = b.baseY + term.rows
  const raw: string[] = []
  for (let i = from; i < to; i++) raw.push(b.getLine(i)?.translateToString(true) ?? '')
  // drop the input box and everything under it : from the last line starting with the agent's prompt mark
  // (its prompt mark near the bottom, never a numbered answer such as "❯ 1. Yes")
  let end = raw.length; while (end > 0 && !raw[end - 1].trim()) end--
  let cut = end
  for (let i = end - 1; i >= Math.max(0, end - 8); i--) if (/^(❯|›|>)(\s+(?!\d+\.)|$)/.test(raw[i].trimStart())) { cut = i; break }
  const lines = raw.slice(0, cut).map((l) => l.replace(/^[\s│┃]+|[\s│┃]+$/g, '')).filter((l) => l && !RULE.test(l) && !FOOT.test(l))
  // a question waiting on screen (a menu of numbered answers under it) : the questions are what to show
  const menu = lines.slice(-24)
  if (menu.some((l) => /^(❯\s*)?1\.\s/.test(l))) {
    const qs = menu.filter((l) => /\?\s*$/.test(l) && !/^(❯\s*)?\d+\./.test(l))
    // several questions at once : Claude shows them as tabs above the first one ("☐ Colour  ☐ Fruit  ✔ Submit")
    const tabs = menu.find((l) => /[☐☒☑]/.test(l))
    const n = tabs ? (tabs.match(/[☐☒☑]/g) ?? []).length : qs.length
    if (qs.length) return { text: qs.join('\n'), questions: Math.max(n, qs.length) }
  }
  // else the agent's answer to your last message : what follows it, without its tool calls and its "done in 4s" lines
  let after = 0
  for (let i = lines.length - 1; i >= 0; i--) if (/^(❯|›|>)\s/.test(lines[i])) { after = i + 1; break }
  const reply = lines.slice(after).filter((l) => !SPIN.test(l) && !TOOL.test(l) && !/^\s*⎿/.test(l))
  let at = -1
  for (let i = reply.length - 1; i >= 0; i--) if (SAYS.test(reply[i])) { at = i; break }
  const said = (at >= 0 ? reply.slice(at, at + 4) : reply.slice(-4)).map((l) => l.replace(SAYS, ''))
  const text = said.join(' ').replace(/\s+/g, ' ').trim()
  return text ? { text: text.length > 220 ? text.slice(0, 220).trimEnd() + '…' : text, questions: 0 } : null
}
