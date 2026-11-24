/* Voice : dictation that runs on this Mac (sherpa-onnx with Whisper or Parakeet). The audio never leaves the computer ;
   the model is downloaded once from the sherpa-onnx releases on GitHub. */
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { execFile } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getSettings } from './settings'

export type VoiceModel = { id: string; label: string; detail: string; quality: string; mb: number; kind: 'whisper' | 'transducer'; file: string; recommended?: boolean }
export const MODELS: VoiceModel[] = [
  { id: 'parakeet-v3', label: 'Parakeet v3', detail: 'Fast. 25 European languages, French included.', quality: 'Very good', mb: 487, kind: 'transducer', file: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', recommended: true },
  { id: 'whisper-turbo', label: 'Whisper Turbo', detail: 'About 100 languages. Slower without a GPU.', quality: 'Very good', mb: 564, kind: 'whisper', file: 'sherpa-onnx-whisper-turbo' },
  { id: 'whisper-small', label: 'Whisper Small', detail: 'About 100 languages.', quality: 'Good', mb: 639, kind: 'whisper', file: 'sherpa-onnx-whisper-small' },
  { id: 'whisper-base', label: 'Whisper Base', detail: 'Small download, to try dictation.', quality: 'Fair', mb: 208, kind: 'whisper', file: 'sherpa-onnx-whisper-base' },
  { id: 'whisper-tiny', label: 'Whisper Tiny', detail: 'The smallest download.', quality: 'Basic', mb: 116, kind: 'whisper', file: 'sherpa-onnx-whisper-tiny' }
]
const URL = (f: string) => `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${f}.tar.bz2`
const dir = () => join(app.getPath('userData'), 'voice')
const modelDir = (m: VoiceModel) => join(dir(), m.file)
const installed = (m: VoiceModel) => existsSync(join(modelDir(m), '.ready'))

let downloading: { id: string; done: number; total: number } | null = null
const send = (ch: string, ...a: unknown[]) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(ch, ...a))

async function download(m: VoiceModel): Promise<string> {
  if (downloading) return 'A download is already running'
  mkdirSync(dir(), { recursive: true })
  const tmp = join(dir(), `${m.file}.tar.bz2`)
  downloading = { id: m.id, done: 0, total: m.mb * 1024 * 1024 }
  try {
    const r = await net.fetch(URL(m.file))
    if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`)
    downloading.total = Number(r.headers.get('content-length')) || downloading.total
    let last = 0
    const body = Readable.fromWeb(r.body as never)
    body.on('data', (c: Buffer) => { downloading!.done += c.length; if (Date.now() - last > 250) { last = Date.now(); send('voice:progress', { ...downloading }) } })
    await pipeline(body, createWriteStream(tmp))
    send('voice:progress', { ...downloading, done: downloading.total, unpacking: true })
    await new Promise<void>((res, rej) => execFile(process.platform === 'darwin' ? '/usr/bin/tar' : 'tar', ['-xjf', tmp, '-C', dir()], (e) => (e ? rej(e) : res())))
    rmSync(tmp, { force: true })
    writeFileSync(join(modelDir(m), '.ready'), '')
    return ''
  } catch (e) {
    rmSync(tmp, { force: true })
    return (e as Error).message
  } finally {
    downloading = null
    send('voice:progress', null)
  }
}

/* the files a model needs, found in its folder (int8 versions first, they are smaller and faster) */
function filesOf(m: VoiceModel) {
  const d = modelDir(m), all = readdirSync(d)
  const pick = (part: string) => {
    const l = all.filter((f) => f.includes(part) && f.endsWith('.onnx'))
    return join(d, l.find((f) => f.includes('int8')) ?? l[0] ?? '')
  }
  return { encoder: pick('encoder'), decoder: pick('decoder'), joiner: pick('joiner'), tokens: join(d, all.find((f) => f.endsWith('tokens.txt')) ?? 'tokens.txt') }
}

let recognizer: { id: string; lang: string; rec: { createStream(): { acceptWaveform(o: { sampleRate: number; samples: Float32Array }): void }; decodeAsync(s: unknown): Promise<unknown>; getResult(s: unknown): { text: string } } } | null = null
// 'system' : the Mac's first preferred language, when the model knows it ; else the model guesses
const SPOKEN = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl']
const resolveLang = (lang: string) => {
  if (lang !== 'system') return lang
  const mac = (app.getPreferredSystemLanguages()[0] || app.getLocale() || '').slice(0, 2).toLowerCase()
  return SPOKEN.includes(mac) ? mac : 'auto'
}
async function getRecognizer(m: VoiceModel, wanted: string) {
  const lang = resolveLang(wanted)
  if (recognizer?.id === m.id && recognizer.lang === lang) return recognizer.rec
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx-node')
  const f = filesOf(m)
  const modelConfig = m.kind === 'whisper'
    ? { whisper: { encoder: f.encoder, decoder: f.decoder, language: lang === 'auto' ? '' : lang, task: 'transcribe' }, tokens: f.tokens, numThreads: 4, provider: 'cpu' }
    : { transducer: { encoder: f.encoder, decoder: f.decoder, joiner: f.joiner }, modelType: 'nemo_transducer', tokens: f.tokens, numThreads: 4, provider: 'cpu' }
  const rec = await sherpa.OfflineRecognizer.createAsync({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig })
  recognizer = { id: m.id, lang, rec }
  return rec
}

/* "euh", "hum", "um", "uh" and the like, and the user's own corrections */
function tidy(text: string): string {
  const s = getSettings()
  let t = text.trim()
  if (s.voiceFillers) t = t.replace(/\b(euh+|heu+|hum+|hmm+|um+|uh+|erm+|ah+)\b[,.]?\s*/gi, '').replace(/\s{2,}/g, ' ').trim()
  for (const line of s.voiceVocabulary.split('\n')) {
    const [heard, written] = line.split('=>').map((x) => x?.trim())
    if (heard && written) t = t.replace(new RegExp(`\\b${heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), written)
  }
  return t
}

export function registerVoice(): void {
  ipcMain.handle('voice:models', () => MODELS.map((m) => ({ ...m, installed: installed(m), size: installed(m) ? m.mb : 0 })))
  ipcMain.handle('voice:download', (_e, id: string) => { const m = MODELS.find((x) => x.id === id); return m ? download(m) : 'Unknown model' })
  ipcMain.handle('voice:remove', (_e, id: string) => {
    const m = MODELS.find((x) => x.id === id)
    if (!m || !modelDir(m).startsWith(dir())) return false
    if (recognizer?.id === id) recognizer = null
    rmSync(modelDir(m), { recursive: true, force: true }); return true
  })
  // 16 kHz mono samples from the microphone, recorded in the page ; the text comes back
  ipcMain.handle('voice:transcribe', async (_e, samples: Float32Array) => {
    const s = getSettings()
    const m = MODELS.find((x) => x.id === s.voiceModel && installed(x)) ?? MODELS.find(installed)
    if (!m) return { error: 'Download a voice model in Settings, Voice' }
    if (!(samples instanceof Float32Array) || samples.length < 1600 || samples.length > 16000 * 600) return { text: '' }
    try {
      const rec = await getRecognizer(m, s.voiceLanguage)
      const st = rec.createStream()
      st.acceptWaveform({ sampleRate: 16000, samples })
      await rec.decodeAsync(st)
      return { text: tidy(rec.getResult(st).text) }
    } catch (e) { return { error: (e as Error).message } }
  })
}
