import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  FiPlay, FiDownload, FiRefreshCw, FiSliders,
  FiTrash2, FiX, FiZap
} from 'react-icons/fi'
import WaveformPlayer from '../shared/WaveformPlayer'
import ExportDialog from '../shared/ExportDialog'
import { toast } from '../shared/Toast'
import { useAudio } from '../../contexts/AudioContext'
import { useNavigate } from 'react-router-dom'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GeneratedSample {
  id: string
  prompt: string
  negativePrompt: string
  duration: number
  steps: number
  cfgScale: number
  seed?: number
  audioBase64: string
  sampleRate: number
  audioDuration: number
  timestamp: number
  libraryId?: string          // set once auto-saved
}

interface Preset {
  name: string
  negativePrompt: string
  duration: number
  steps: number
  cfgScale: number
}

const DEFAULT_PRESETS: Preset[] = [
  { name: 'Quick Draft', negativePrompt: 'Low quality, noise', duration: 5, steps: 50, cfgScale: 7 },
  { name: 'Balanced', negativePrompt: 'Low quality, distortion', duration: 10, steps: 100, cfgScale: 7 },
  { name: 'High Quality', negativePrompt: 'Low quality, noise, distortion, artifacts', duration: 15, steps: 200, cfgScale: 7 },
  { name: 'Long Form', negativePrompt: 'Low quality, noise', duration: 30, steps: 150, cfgScale: 7 },
  { name: 'Max Length', negativePrompt: 'Low quality', duration: 47, steps: 100, cfgScale: 5 }
]

interface PromptSuggestion { text: string; type: 'music' | 'sfx' }

const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  // Music
  { text: '128 BPM tech house drum loop', type: 'music' },
  { text: 'Lo-fi hip hop drum break with vinyl crackle', type: 'music' },
  { text: 'Fast breakbeat drum pattern 170 BPM', type: 'music' },
  { text: 'Tribal percussion loop with congas and shakers', type: 'music' },
  { text: 'Warm analog synth pad with slow filter sweep', type: 'music' },
  { text: 'Ambient piano melody in C minor, reverb', type: 'music' },
  { text: 'Plucked acoustic guitar fingerpicking pattern', type: 'music' },
  { text: 'Deep sub bass wobble, dubstep style', type: 'music' },
  { text: 'Ethereal female vocal choir, legato', type: 'music' },
  { text: 'Funky slap bass groove, 100 BPM', type: 'music' },
  { text: 'Jazz saxophone solo with reverb', type: 'music' },
  { text: 'Orchestral strings tremolo, dramatic', type: 'music' },
  { text: 'Reggaeton dembow beat 95 BPM', type: 'music' },
  { text: '80s synthwave arpeggiated bassline', type: 'music' },
  { text: 'Acoustic fingerstyle blues guitar', type: 'music' },
  { text: 'Minimal techno hi-hat pattern, crispy', type: 'music' },
  { text: 'Chill R&B Rhodes electric piano chords', type: 'music' },
  { text: 'Heavy metal double kick blast beat', type: 'music' },
  { text: 'Indian sitar melody with tabla rhythm', type: 'music' },
  { text: 'Chiptune 8-bit melody, retro game music', type: 'music' },
  { text: 'Bossa nova acoustic guitar, mellow', type: 'music' },
  { text: 'Trap 808 bass pattern with hi-hats', type: 'music' },
  { text: 'Celtic fiddle jig, fast and lively', type: 'music' },
  { text: 'Gospel choir harmonies, uplifting', type: 'music' },
  { text: 'Glitchy IDM percussion, complex rhythm', type: 'music' },
  // Sound Effects
  { text: 'Thunder and heavy rain storm ambience', type: 'sfx' },
  { text: 'Sci-fi spaceship engine hum and beeps', type: 'sfx' },
  { text: 'Cinematic orchestral hit with timpani', type: 'sfx' },
  { text: 'Retro 8-bit video game coin pickup', type: 'sfx' },
  { text: 'Underwater bubbling and whale call', type: 'sfx' },
  { text: 'Forest ambience with birds and wind', type: 'sfx' },
  { text: 'Vinyl record crackle and pop noise', type: 'sfx' },
  { text: 'Crystal singing bowl meditation tone', type: 'sfx' },
  { text: 'Explosion with debris and fire crackle', type: 'sfx' },
  { text: 'Old wooden door creaking open slowly', type: 'sfx' },
  { text: 'Crowd cheering in a stadium', type: 'sfx' },
  { text: 'Sword clashing in medieval battle', type: 'sfx' },
  { text: 'Car engine revving, sports car', type: 'sfx' },
  { text: 'Church bells ringing in the distance', type: 'sfx' },
  { text: 'Footsteps on gravel, slow walk', type: 'sfx' },
  { text: 'Clock ticking in a quiet room', type: 'sfx' },
  { text: 'Futuristic UI beep notification sound', type: 'sfx' },
  { text: 'Wolf howling at night, eerie', type: 'sfx' },
  { text: 'Crackling campfire with crickets', type: 'sfx' },
  { text: 'Typing on a mechanical keyboard, fast', type: 'sfx' },
  { text: 'Glass shattering impact', type: 'sfx' },
  { text: 'Helicopter flyby overhead', type: 'sfx' },
  { text: 'Ocean waves crashing on rocks', type: 'sfx' },
  { text: 'Spooky haunted house ghost whisper', type: 'sfx' },
  { text: 'Robotic servo motor whirring', type: 'sfx' },
]

/* ------------------------------------------------------------------ */
/*  Module-level state — survives component unmount / tab switches     */
/* ------------------------------------------------------------------ */

let _samples: GeneratedSample[] = []
let _nextId = 1
let _isGenerating = false
let _listeners: Set<() => void> = new Set()

// --- Queue ---
interface QueueItem {
  prompt: string
  negativePrompt: string
  duration: number
  steps: number
  cfgScale: number
  seed?: number
}
let _queue: QueueItem[] = []
let _queueListeners: Set<() => void> = new Set()

function notifyQueueChange() { _queueListeners.forEach((fn) => fn()) }

function useQueue() {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const cb = () => forceRender((n) => n + 1)
    _queueListeners.add(cb)
    return () => { _queueListeners.delete(cb) }
  }, [])
  return _queue
}

/** Notify all mounted components to re-read _samples */
function notifySampleChange() {
  _listeners.forEach((fn) => fn())
}

function addSample(s: GeneratedSample) {
  _samples = [s, ..._samples]
  notifySampleChange()
}

function removeSample(id: string) {
  _samples = _samples.filter((s) => s.id !== id)
  notifySampleChange()
}

function clearAllSamples() {
  _samples = []
  notifySampleChange()
}

function patchSample(id: string, patch: Partial<GeneratedSample>) {
  _samples = _samples.map((s) => s.id === id ? { ...s, ...patch } : s)
  notifySampleChange()
}

/** Hook that re-renders when _samples changes */
function useSamples(): GeneratedSample[] {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const cb = () => forceRender((n) => n + 1)
    _listeners.add(cb)
    return () => { _listeners.delete(cb) }
  }, [])
  return _samples
}

/* ------------------------------------------------------------------ */
/*  Auto-save helper                                                   */
/* ------------------------------------------------------------------ */

async function autoSaveToLibrary(s: GeneratedSample): Promise<string | null> {
  try {
    const result = await window.api.librarySave({
      title: s.prompt.slice(0, 100),
      prompt: s.prompt,
      audioBase64: s.audioBase64,
      sampleRate: s.sampleRate,
      duration: s.audioDuration,
      tags: []
    })
    return result.id
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GeneratorView() {
  const navigate = useNavigate()
  const { setAudio } = useAudio()
  const samples = useSamples()
  const queue = useQueue()

  // Shuffled prompt suggestions — stable across re-renders, mix of both types
  const suggestions = useMemo(
    () => [...PROMPT_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 8),
    []
  )

  // --- Prompt params ---
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('Low quality.')
  const [duration, setDuration] = useState(10)
  const [steps, setSteps] = useState(100)
  const [cfgScale, setCfgScale] = useState(7)
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [batchCount, setBatchCount] = useState(1)

  // --- Generation state ---
  const [isGenerating, setIsGenerating] = useState(_isGenerating)
  const [stepProgress, setStepProgress] = useState({ step: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<{ loaded: boolean; loading: boolean; device: string } | null>(null)

  // --- UI toggles ---
  const [showPresets, setShowPresets] = useState(false)
  const [exportSampleId, setExportSampleId] = useState<string | null>(null)

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check model status on mount and while generating
  useEffect(() => {
    const check = async () => {
      try {
        const s = await window.api.getGenerationProgress()
        setModelStatus({ loaded: s.loaded, loading: s.loading, device: s.device })
      } catch { /* ignore */ }
    }
    check()
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [])

  // Poll step progress while generating
  useEffect(() => {
    if (isGenerating) {
      progressInterval.current = setInterval(async () => {
        try {
          const status = await window.api.getGenerationProgress()
          if (status.generating) {
            setStepProgress({ step: status.generation_progress, total: status.generation_total })
          }
        } catch { /* ignore */ }
      }, 500)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
      setStepProgress({ step: 0, total: 0 })
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [isGenerating])

  /* ---- Generation with queue ---- */

  const enqueueItems = useCallback((count: number) => {
    for (let i = 0; i < count; i++) {
      const currentSeed = seed !== undefined ? seed + i + (_queue.length) : undefined
      _queue.push({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        duration,
        steps,
        cfgScale,
        seed: currentSeed
      })
    }
    notifyQueueChange()
  }, [prompt, negativePrompt, duration, steps, cfgScale, seed])

  const processQueue = useCallback(async () => {
    if (_isGenerating) return  // already running
    _isGenerating = true
    setIsGenerating(true)
    setError(null)

    while (_queue.length > 0) {
      const item = _queue[0]
      notifyQueueChange()

      try {
        const result = await window.api.generateAudio({
          prompt: item.prompt,
          negativePrompt: item.negativePrompt || undefined,
          duration: item.duration,
          steps: item.steps,
          cfgScale: item.cfgScale,
          seed: item.seed
        })
        const sample: GeneratedSample = {
          id: `gen-${_nextId++}`,
          prompt: item.prompt,
          negativePrompt: item.negativePrompt,
          duration: item.duration,
          steps: item.steps,
          cfgScale: item.cfgScale,
          seed: item.seed,
          audioBase64: result.audio_base64,
          sampleRate: result.sample_rate,
          audioDuration: result.duration,
          timestamp: Date.now()
        }
        addSample(sample)
        const libId = await autoSaveToLibrary(sample)
        if (libId) patchSample(sample.id, { libraryId: libId })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        setError(msg)
        toast('error', msg)
      }

      // Remove processed item
      _queue.shift()
      notifyQueueChange()
    }

    _isGenerating = false
    setIsGenerating(false)
    toast('success', 'Generation complete')
  }, [])

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return
    enqueueItems(batchCount)
    processQueue()
  }, [prompt, batchCount, enqueueItems, processQueue])

  const handleQueueMore = useCallback(() => {
    if (!prompt.trim()) return
    enqueueItems(batchCount)
    // processQueue is already running if _isGenerating
    if (!_isGenerating) processQueue()
  }, [prompt, batchCount, enqueueItems, processQueue])

  /* ---- Per-sample actions ---- */

  const handleDelete = async (s: GeneratedSample) => {
    // Delete from library if it was auto-saved
    if (s.libraryId) {
      try { await window.api.libraryDelete(s.libraryId) } catch { /* ignore */ }
    }
    removeSample(s.id)
    toast('info', 'Sample deleted')
  }

  const handleEdit = (s: GeneratedSample) => {
    setAudio(s.audioBase64, s.sampleRate, s.audioDuration, s.prompt)
    navigate('/editor')
  }

  const handleClearAll = async () => {
    // Delete all from library
    for (const s of _samples) {
      if (s.libraryId) {
        try { await window.api.libraryDelete(s.libraryId) } catch { /* ignore */ }
      }
    }
    clearAllSamples()
    toast('info', 'All samples deleted')
  }

  const loadPreset = (preset: Preset) => {
    setNegativePrompt(preset.negativePrompt)
    setDuration(preset.duration)
    setSteps(preset.steps)
    setCfgScale(preset.cfgScale)
    setShowPresets(false)
    toast('info', `Loaded preset: ${preset.name}`)
  }

  const exportSample = samples.find((s) => s.id === exportSampleId)

  return (
    <div className="h-full flex flex-col p-6 gap-4 overflow-y-auto">

      {/* ---- Header ---- */}
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2"><FiZap className="text-orange-400" /> Audio Generator</h1>
          <p className="text-gray-400 text-sm mt-1">
            Generate audio from text prompts — all samples auto-save to library
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPresets(!showPresets)}
            className="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg flex items-center gap-1.5 transition-colors">
            <FiSliders size={14} /> Presets
          </button>
          {samples.length > 0 && (
            <button onClick={handleClearAll}
              className="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg flex items-center gap-1.5 transition-colors">
              <FiTrash2 size={14} /> Clear All ({samples.length})
            </button>
          )}
        </div>
      </header>

      {showPresets && (
        <div className="bg-surface-900 border border-surface-700 rounded-lg p-3 shrink-0">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Parameter Presets</h3>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_PRESETS.map((p) => (
              <button key={p.name} onClick={() => loadPreset(p)}
                className="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg transition-colors">
                {p.name} <span className="text-gray-500 ml-1">({p.duration}s / {p.steps} steps)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 min-h-0">

        {/* ---- Model status banner ---- */}
        {modelStatus && !modelStatus.loaded && !modelStatus.loading && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-2 shrink-0">
            <p className="text-sm text-orange-300">
              Model not loaded — will load on first generation
              <span className="text-orange-400/50 ml-2">({modelStatus.device})</span>
            </p>
          </div>
        )}

        {/* ---- Controls ---- */}
        <div className="grid grid-cols-[1fr_1fr] gap-6 shrink-0 items-start">
          {/* Left: Prompts */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Prompt</label>
              <textarea value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
                placeholder="128 BPM tech house drum loop..."
                className="w-full h-20 bg-surface-900 border border-surface-700 rounded-lg p-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-orange-500 transition-colors" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.map((s) => (
                  <button key={s.text} onClick={() => setPrompt(s.text)}
                    className={`px-2 py-0.5 text-[11px] rounded-full transition-colors truncate max-w-[220px] ${
                      s.type === 'music'
                        ? 'bg-orange-500/10 text-orange-400/70 hover:bg-orange-500/25 hover:text-orange-300'
                        : 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/25 hover:text-amber-300'
                    }`}>
                    {s.type === 'music' ? '♪' : '◆'} {s.text}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Negative Prompt</label>
              <textarea value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Low quality, noise..."
                className="w-full h-12 bg-surface-900 border border-surface-700 rounded-lg p-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-orange-500 transition-colors" />
            </div>
          </div>

          {/* Right: Params — each slider on its own row */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-400 w-24 shrink-0 text-right">Duration: {duration}s</label>
              <input type="range" min={1} max={47} value={duration}
                onChange={(e) => setDuration(Number(e.target.value))} className="flex-1 accent-orange-400" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-400 w-24 shrink-0 text-right">Steps: {steps}</label>
              <input type="range" min={10} max={200} step={10} value={steps}
                onChange={(e) => setSteps(Number(e.target.value))} className="flex-1 accent-orange-400" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-400 w-24 shrink-0 text-right">CFG Scale: {cfgScale}</label>
              <input type="range" min={1} max={15} step={0.5} value={cfgScale}
                onChange={(e) => setCfgScale(Number(e.target.value))} className="flex-1 accent-orange-400" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-400 w-24 shrink-0 text-right">Batch: {batchCount}</label>
              <input type="range" min={1} max={8} value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))} className="flex-1 accent-orange-400" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-400 w-24 shrink-0 text-right">Seed</label>
              <div className="flex gap-1 flex-1">
                <input type="number" value={seed ?? ''} placeholder="Random"
                  onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                  className="flex-1 min-w-0 bg-surface-900 border border-surface-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                <button onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}
                  className="p-1 bg-surface-800 hover:bg-surface-700 text-gray-400 rounded transition-colors" title="Random seed">
                  <FiRefreshCw size={12} />
                </button>
              </div>
            </div>

            {/* Generate / Queue buttons */}
            <div className="flex gap-2 mt-1">
              <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-surface-700 disabled:text-gray-500 text-white font-medium rounded-lg flex items-center justify-center gap-2 text-sm transition-colors">
                {isGenerating && queue.length === 0 ? (
                  <><FiRefreshCw className="animate-spin" size={14} /> Generating...</>
                ) : (
                  <><FiPlay size={14} /> Generate{batchCount > 1 ? ` (${batchCount})` : ''}</>
                )}
              </button>
              {isGenerating && (
                <button onClick={handleQueueMore} disabled={!prompt.trim()}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-orange-400 font-medium rounded-lg flex items-center justify-center gap-2 text-sm transition-colors border border-orange-500/30">
                  <FiPlay size={14} /> +{batchCount} More
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Ctrl+Enter to generate
              {batchCount > 1 && seed !== undefined ? ` • Seeds: ${seed}–${seed + batchCount - 1}` : ''}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm shrink-0">{error}</div>
        )}

        {/* Progress / Queue status */}
        {isGenerating && (
          <div className="bg-surface-900 border border-surface-700 rounded-lg p-3 shrink-0">
            {stepProgress.total > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm text-gray-400 mb-1.5">
                  <span>Generating audio...{queue.length > 0 ? ` (${queue.length} queued)` : ''}</span>
                  <span>{Math.round((stepProgress.step / stepProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${(stepProgress.step / stepProgress.total) * 100}%` }} />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <FiRefreshCw className="animate-spin text-orange-400" size={16} />
                <div>
                  <p className="text-sm text-gray-300">Loading model to GPU...</p>
                  <p className="text-xs text-gray-500">First generation loads the model (~12s on CUDA)</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- Samples list (full width) ---- */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
          {samples.length > 0 ? (
            samples.map((s) => (
              <SampleCard
                key={s.id}
                sample={s}
                onExport={() => setExportSampleId(s.id)}
                onEdit={() => handleEdit(s)}
                onDelete={() => handleDelete(s)}
              />
            ))
          ) : !isGenerating ? (
            <div className="flex-1 flex items-center justify-center border border-surface-700 border-dashed rounded-lg">
              <div className="text-center text-gray-500">
                <FiPlay className="text-4xl mx-auto mb-3 opacity-50" />
                <p>Enter a prompt and click Generate</p>
                <p className="text-sm mt-1 text-gray-500">or press Ctrl+Enter</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Export dialog */}
      {exportSample && (
        <ExportDialog
          audioBase64={exportSample.audioBase64}
          sampleRate={exportSample.sampleRate}
          onClose={() => setExportSampleId(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sample card                                                        */
/* ------------------------------------------------------------------ */

function SampleCard({ sample, onExport, onEdit, onDelete }: {
  sample: GeneratedSample
  onExport: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-lg p-4 flex flex-col gap-3 shrink-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white truncate">{sample.prompt}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {sample.audioDuration.toFixed(1)}s • {sample.steps} steps • CFG {sample.cfgScale}
            {sample.seed !== undefined && ` • seed ${sample.seed}`}
            {' • '}{new Date(sample.timestamp).toLocaleTimeString()}
            {sample.libraryId && <span className="text-green-600 ml-1">✓ saved</span>}
          </p>
        </div>
      </div>

      {/* Waveform + playback */}
      <WaveformPlayer
        audioBase64={sample.audioBase64}
        sampleRate={sample.sampleRate}
        height={80}
      />

      {/* Actions: Export, Edit, Delete (delete last) */}
      <div className="flex gap-2">
        <button onClick={onExport}
          className="flex-1 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors">
          <FiDownload size={12} /> Export
        </button>
        <button onClick={onEdit}
          className="flex-1 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors">
          <FiSliders size={12} /> Edit
        </button>
        <button onClick={onDelete}
          className="flex-1 px-3 py-1.5 bg-surface-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors">
          <FiTrash2 size={12} /> Delete
        </button>
      </div>
    </div>
  )
}



