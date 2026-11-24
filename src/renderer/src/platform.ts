/* The platform the app runs on, and the shortcut keys that go with it.
   macOS : ⌘. Windows and Linux : Ctrl+Shift (Ctrl alone belongs to the shell in a terminal), and ⌘⇧ becomes Ctrl+Alt. */
export const platform: string = window.mira?.platform ?? 'darwin'
export const isMac = platform === 'darwin'

/* a shortcut label written the macOS way ('⌘⇧M', 'Search (⌘K)'), as it is pressed on this platform */
export const kbd = (s: string): string =>
  isMac ? s : s.replace(/⌘⌥/g, 'Ctrl+Shift+Alt+').replace(/⌘⇧/g, 'Ctrl+Alt+').replace(/⌘/g, 'Ctrl+Shift+').replace(/⌃/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+')

/* which shortcut a key press is : `plain` for ⌘X, `shifted` for ⌘⇧X, `alt` for ⌘⌥X, and the key itself from its
   physical place (Shift on Windows changes 1 into !) */
export function shortcut(e: KeyboardEvent): { plain: boolean; shifted: boolean; alt: boolean; key: string } {
  // AltGr (Ctrl+Alt on Windows) types characters such as # { [ | € : never a shortcut
  const altGr = !isMac && e.getModifierState?.('AltGraph')
  const mod = !altGr && (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
  const c = e.code
  // a letter as the layout types it (⌘Z on AZERTY is z), unless a modifier turned it into another character (⌥T gives †)
  const typed = e.key.length === 1 ? e.key.toLowerCase() : ''
  const key = /^[a-z]$/.test(typed) ? typed : /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase() : /^Digit\d$/.test(c) ? c.slice(5)
    : /^[,\[\]./]$/.test(typed) ? typed
    : ({ Comma: ',', BracketLeft: '[', BracketRight: ']', Period: '.', Slash: '/' } as Record<string, string>)[c] ?? typed
  if (isMac) return { plain: mod && !e.shiftKey && !e.altKey, shifted: mod && e.shiftKey && !e.altKey, alt: mod && e.altKey && !e.shiftKey, key }
  return { plain: mod && e.shiftKey && !e.altKey, shifted: mod && e.altKey && !e.shiftKey, alt: mod && e.shiftKey && e.altKey, key }
}
