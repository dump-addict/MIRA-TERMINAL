/* Settings in the page : loaded once, kept in sync with the main process */
import { useEffect, useState } from 'react'
import type { Settings } from '../../preload'
import { applyAppearance } from './appearance'

let current: Settings | null = null
const subs = new Set<(s: Settings) => void>()
const ready = window.mira.settings.get().then((s) => { current = s; applyAppearance(s); subs.forEach((f) => f(s)); return s })
window.mira.settings.onChanged((s) => { current = s; applyAppearance(s); subs.forEach((f) => f(s)) })

export const settingsNow = () => current
export const settingsReady = () => ready
export function useSettings(): Settings | null {
  const [s, set] = useState(current)
  useEffect(() => { subs.add(set); if (current) set(current); return () => { subs.delete(set) } }, [])
  return s
}
