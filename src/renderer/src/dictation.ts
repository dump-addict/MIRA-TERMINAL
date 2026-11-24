/* Dictation : the microphone is recorded in the page at 16 kHz, the text is made on this Mac, then typed where you are */
import { settingsNow } from './settings'

// where dictated text goes : the terminal or editor that last had the focus registers itself here
type Target = (text: string) => void
let target: Target | null = null
// inBox : the target is an agent's message box, which shows the recording itself (no floating pill then)
let boxTarget = false
export const setDictationTarget = (t: Target | null, inBox = false) => { target = t; boxTarget = inBox }
export const dictatesInBox = () => boxTarget
// listening, writing or off : told to whoever shows it
export const voiceEvent = (state: 'off' | 'listening' | 'working') => window.dispatchEvent(new CustomEvent('mira-voice', { detail: state }))

let rec: { ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[] } | null = null
// what has been said so far, shown live while you speak (the final text is only typed when you stop)
export const voicePartial = (text: string) => window.dispatchEvent(new CustomEvent('mira-voice-partial', { detail: text }))
let live = 0
// the live transcription in flight : the final one waits for it (one model, one job at a time)
let inflight: Promise<unknown> = Promise.resolve()
const joined = (chunks: Float32Array[], maxSamples = Infinity) => {
  let n = chunks.reduce((a, c) => a + c.length, 0), from = 0
  // the live preview only reads the last 25 s, so it stays quick in a long dictation
  while (n > maxSamples && from < chunks.length - 1) { n -= chunks[from].length; from++ }
  const all = new Float32Array(n)
  let o = 0
  for (let i = from; i < chunks.length; i++) { all.set(chunks[i], o); o += chunks[i].length }
  return all
}
export const isRecording = () => !!rec

export async function startDictation(): Promise<string | null> {
  if (rec) return null
  try {
    // asked first through macOS (the page alone cannot make it show its window)
    const access = await window.mira.micAccess()
    if (access !== 'granted') { void window.mira.openPath('microphone'); return 'Allow Mira to use the microphone in System Settings, then try again' }
    const mic = settingsNow()?.voiceMic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: mic ? { exact: mic } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    const ctx = new AudioContext({ sampleRate: 16000 })
    const src = ctx.createMediaStreamSource(stream)
    // a ScriptProcessor keeps it simple : 16 kHz mono chunks, kept until the end
    const node = ctx.createScriptProcessor(4096, 1, 1)
    const chunks: Float32Array[] = []
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    src.connect(node); node.connect(ctx.destination)
    rec = { ctx, stream, node, chunks }
    // about every second, the words so far : one at a time, never piling up
    const mine = rec
    let busy = false
    clearInterval(live)
    live = window.setInterval(() => {
      if (busy || rec !== mine || chunks.length < 4) return
      busy = true
      inflight = window.mira.voice.transcribe(joined(chunks, 16000 * 25)).then((r) => { if (rec === mine && r.text) voicePartial(r.text) }).finally(() => { busy = false })
    }, 900)
    return null
  } catch (e) {
    return (e as Error).name === 'NotAllowedError' ? 'Mira cannot use the microphone. Allow it in System Settings, Privacy, Microphone.' : 'No microphone found'
  }
}

/* stops, transcribes, and types the text where you are */
export async function stopDictation(): Promise<{ text?: string; error?: string }> {
  if (!rec) return {}
  const { ctx, stream, node, chunks } = rec
  rec = null
  clearInterval(live)
  node.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close()
  await inflight.catch(() => {})
  const r = await window.mira.voice.transcribe(joined(chunks))
  voicePartial('')
  if (r.text && target) target(r.text.endsWith(' ') ? r.text : r.text + ' ')
  return r
}
