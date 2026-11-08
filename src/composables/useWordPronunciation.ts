export type PronunciationAccent = 'us' | 'uk'

let activeAudio: HTMLAudioElement | null = null
let activeObjectUrl = ''
const audioMemoryCache = new Map<string, { audioBase64: string; mimeType: string }>()
const MAX_MEMORY_AUDIO = 80

export function stopWordPronunciation(): void {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.src = ''
    activeAudio = null
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = ''
  }
}

export function wordPronunciationUrl(word: string, accent: PronunciationAccent): string {
  const type = accent === 'us' ? 2 : 1
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}&le=eng`
}

export function sentencePronunciationUrl(text: string, accent: PronunciationAccent): string {
  const language = accent === 'us' ? 'en-US' : 'en-GB'
  return `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${language}&q=${encodeURIComponent(text)}`
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

type PlaybackStarted = () => void

async function playAudioElement(audio: HTMLAudioElement, rate: number, onStarted?: PlaybackStarted): Promise<void> {
  audio.preload = 'auto'
  audio.volume = 1
  audio.playbackRate = Math.min(2, Math.max(0.5, rate))
  activeAudio = audio
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let playing = false
    const timer = window.setTimeout(() => {
      if (!playing) finish(new Error('在线音频加载超时'))
    }, 10000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      audio.onplaying = null
      audio.onended = null
      audio.onerror = null
      audio.onpause = null
      if (activeAudio === audio) activeAudio = null
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl)
        activeObjectUrl = ''
      }
      if (error) reject(error)
      else resolve()
    }
    audio.onplaying = () => {
      playing = true
      window.clearTimeout(timer)
      onStarted?.()
    }
    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('在线音频加载失败'))
    audio.onpause = () => finish()
    void audio.play().catch(() => finish(new Error('无法播放在线音频')))
  })
}

async function playDirectOnline(text: string, accent: PronunciationAccent, rate: number, onStarted?: PlaybackStarted): Promise<void> {
  stopWordPronunciation()
  const audio = new Audio(text.includes(' ') || text.length > 24 ? sentencePronunciationUrl(text, accent) : wordPronunciationUrl(text, accent))
  await playAudioElement(audio, rate, onStarted)
}

async function playFetchedOnline(text: string, accent: PronunciationAccent, rate: number, onStarted?: PlaybackStarted): Promise<void> {
  const cacheKey = `${accent}:${text}`
  let cached = audioMemoryCache.get(cacheKey)
  if (!cached) {
    const result = await window.cet4Api.fetchTtsAudio({ text, accent })
    if (!result.success || !result.audioBase64) throw new Error(result.message || '发音加载失败，请检查网络')
    cached = { audioBase64: result.audioBase64, mimeType: result.mimeType || 'audio/mpeg' }
    if (audioMemoryCache.size >= MAX_MEMORY_AUDIO) {
      const oldest = audioMemoryCache.keys().next().value
      if (oldest) audioMemoryCache.delete(oldest)
    }
    audioMemoryCache.set(cacheKey, cached)
  }
  stopWordPronunciation()
  const bytes = base64ToUint8Array(cached.audioBase64)
  const audioBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(audioBuffer).set(bytes)
  const blob = new Blob([audioBuffer], { type: cached.mimeType })
  activeObjectUrl = URL.createObjectURL(blob)
  const audio = new Audio(activeObjectUrl)
  await playAudioElement(audio, rate, onStarted)
}

async function playOnlineText(text: string, accent: PronunciationAccent, rate: number, onStarted?: PlaybackStarted): Promise<void> {
  let fetchedError: Error | null = null
  try {
    // 主进程会先检查磁盘缓存，再请求女声风格在线 TTS，避免每次等待直连音频。
    await playFetchedOnline(text, accent, rate, onStarted)
    return
  } catch (error) {
    fetchedError = error as Error
  }
  try {
    await playDirectOnline(text, accent, rate, onStarted)
  } catch {
    throw fetchedError || new Error('发音加载失败，请检查网络')
  }
}

export async function playWordPronunciation(word: string, accent: PronunciationAccent, rate = 1): Promise<void> {
  const text = String(word || '').trim()
  if (!text) throw new Error('没有可播放的单词')
  try {
    await playOnlineText(text, accent, rate)
  } catch {
    throw new Error('发音加载失败，请检查网络')
  }
}

async function systemVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  if (!synth) return []
  const existing = synth.getVoices()
  if (existing.length) return existing
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synth.onvoiceschanged = null
      resolve(synth.getVoices())
    }
    synth.onvoiceschanged = finish
    window.setTimeout(finish, 1500)
  })
}

async function playSystemSpeech(
  text: string,
  accent: PronunciationAccent,
  rate: number,
  onStarted?: PlaybackStarted
): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('系统语音不可用')
  }
  const language = accent === 'us' ? 'en-US' : 'en-GB'
  const voices = await systemVoices()
  const englishVoices = voices.filter(item => item.lang.toLowerCase().startsWith('en'))
  const femaleNames = ['aria', 'jenny', 'zira', 'hazel', 'sonia', 'michelle', 'eva', 'samantha', 'victoria', 'allison', 'ava', 'susan', 'karen', 'moira', 'female']
  const voice = englishVoices.find(item => item.lang === language && femaleNames.some(name => item.name.toLowerCase().includes(name)))
    || englishVoices.find(item => femaleNames.some(name => item.name.toLowerCase().includes(name)))
    || englishVoices.find(item => item.lang === language)
    || englishVoices.find(item => item.lang.startsWith(accent === 'us' ? 'en-US' : 'en-GB'))
    || englishVoices[0]
  const chunks = splitPronunciationText(text, 220)
  if (!chunks.length) throw new Error('没有可播放的句子')
  synth.cancel()
  let started = false
  for (const chunk of chunks) {
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = language
      utterance.rate = Math.min(2, Math.max(0.5, rate))
      utterance.pitch = 1
      utterance.volume = 1
      if (voice) utterance.voice = voice
      utterance.onstart = () => {
        if (!started) {
          started = true
          onStarted?.()
        }
      }
      utterance.onend = () => resolve()
      utterance.onerror = event => reject(new Error(event.error === 'interrupted' ? '系统朗读被中断' : '系统朗读失败'))
      synth.speak(utterance)
    })
  }
}

function splitPronunciationText(text: string, maxLength = 180): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["'”’)\]]*)|[^.!?]+$/g) || [normalized]
  const chunks: string[] = []
  for (const sentence of sentences) {
    const value = sentence.trim()
    if (!value) continue
    if (value.length <= maxLength) {
      chunks.push(value)
      continue
    }
    let remaining = value
    while (remaining.length > maxLength) {
      let cut = remaining.lastIndexOf(' ', maxLength)
      if (cut < maxLength * 0.55) cut = maxLength
      chunks.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }
    if (remaining) chunks.push(remaining)
  }
  return chunks
}

/**
 * 划选句子只使用在线 TTS：先尝试在线音频直连，再由主进程并发请求多个在线 TTS
 * 服务并返回内存音频。加载回调只会在首次真正开始播放时触发，便于 UI 结束转圈。
 */
export async function playPronunciationSequence(
  text: string,
  accent: PronunciationAccent,
  rate = 0.92,
  onPlaybackStarted?: PlaybackStarted
): Promise<void> {
  const chunks = splitPronunciationText(text)
  if (!chunks.length) throw new Error('没有可播放的句子')
  let started = false
  const notifyStarted = () => {
    if (started) return
    started = true
    onPlaybackStarted?.()
  }
  try {
    for (const chunk of chunks) {
      await playOnlineText(chunk, accent, rate, notifyStarted)
    }
  } catch {
    try {
      await playSystemSpeech(text, accent, rate, notifyStarted)
    } catch {
      throw new Error('在线发音和系统语音均不可用，请检查网络或系统语音设置')
    }
  }
}