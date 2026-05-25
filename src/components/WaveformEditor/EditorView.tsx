import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiScissors, FiTrendingUp, FiVolume2, FiSave, FiDownload, FiRotateCcw, FiRotateCw, FiUpload, FiEdit2 } from 'react-icons/fi'
import WaveformPlayer from '../shared/WaveformPlayer'
import ExportDialog from '../shared/ExportDialog'
import { toast } from '../shared/Toast'
import { useAudio } from '../../contexts/AudioContext'

interface UndoEntry {
  audioBase64: string
  label: string
}

export default function EditorView() {
  const navigate = useNavigate()
  const { currentAudio, currentSampleRate, currentDuration, currentPrompt, currentLibraryId, setAudio, clearAudio } = useAudio()

  const [audioBase64, setAudioBase64] = useState<string | null>(null)
  const [sampleRate, setSampleRate] = useState(44100)
  const [duration, setDuration] = useState(0)
  const [regionStart, setRegionStart] = useState<number | null>(null)
  const [regionEnd, setRegionEnd] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Editing tool params
  const [fadeInDuration, setFadeInDuration] = useState(0.5)
  const [fadeOutDuration, setFadeOutDuration] = useState(0.5)
  const [gainDb, setGainDb] = useState(0)
  const [showParams, setShowParams] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)

  const waveformKey = useRef(0)

  // Load from AudioContext if available
  useEffect(() => {
    if (currentAudio) {
      setAudioBase64(currentAudio)
      setSampleRate(currentSampleRate)
      setDuration(currentDuration)
      setUndoStack([])
      setRedoStack([])
    }
  }, [currentAudio, currentSampleRate, currentDuration])

  const pushUndo = useCallback((label: string) => {
    if (audioBase64) {
      setUndoStack((prev) => [...prev.slice(-19), { audioBase64, label }])
      setRedoStack([])
    }
  }, [audioBase64])

  const handleUndo = () => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    if (audioBase64) {
      setRedoStack((prev) => [...prev, { audioBase64, label: 'redo' }])
    }
    setAudioBase64(last.audioBase64)
    setUndoStack((prev) => prev.slice(0, -1))
    waveformKey.current++
    toast('info', `Undo: ${last.label}`)
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    if (audioBase64) {
      setUndoStack((prev) => [...prev, { audioBase64, label: 'undo' }])
    }
    setAudioBase64(last.audioBase64)
    setRedoStack((prev) => prev.slice(0, -1))
    waveformKey.current++
    toast('info', 'Redo')
  }

  const applyOperation = async (
    type: string,
    params: Record<string, number>,
    label: string
  ) => {
    if (!audioBase64) return
    setIsProcessing(true)
    pushUndo(label)
    try {
      const result = await window.api.audioProcess({
        audioBase64,
        operations: [{ type: type as any, params }],
        sampleRate
      })
      setAudioBase64(result.audio_base64)
      setSampleRate(result.sample_rate)
      setDuration(result.duration)
      waveformKey.current++
      toast('success', label)
    } catch (err) {
      toast('error', `Failed: ${label}`)
      // Revert undo push
      setUndoStack((prev) => prev.slice(0, -1))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleTrim = () => {
    if (regionStart === null || regionEnd === null) {
      toast('warning', 'Select a region on the waveform first')
      return
    }
    applyOperation('trim', { start: regionStart, end: regionEnd }, 'Trim')
    setRegionStart(null)
    setRegionEnd(null)
  }

  const handleFadeIn = () => applyOperation('fade_in', { duration: fadeInDuration }, `Fade in (${fadeInDuration}s)`)
  const handleFadeOut = () => applyOperation('fade_out', { duration: fadeOutDuration }, `Fade out (${fadeOutDuration}s)`)
  const handleNormalize = () => applyOperation('normalize', {}, 'Normalize')
  const handleGain = () => applyOperation('gain', { gain_db: gainDb }, `Gain (${gainDb > 0 ? '+' : ''}${gainDb}dB)`)

  const handleSave = async () => {
    if (!audioBase64) return
    try {
      if (currentLibraryId) {
        // Overwrite existing library item — save as new file
        await window.api.librarySave({
          title: currentPrompt || 'Edited audio',
          prompt: currentPrompt || '',
          audioBase64,
          sampleRate,
          duration,
          tags: ['edited']
        })
        toast('success', 'Saved edited copy to library')
      } else {
        await window.api.librarySave({
          title: currentPrompt || 'Edited audio',
          prompt: currentPrompt || '',
          audioBase64,
          sampleRate,
          duration,
          tags: ['edited']
        })
        toast('success', 'Saved to library')
      }
    } catch {
      toast('error', 'Failed to save')
    }
  }

  const handleExport = async () => {
    if (!audioBase64) return
    setShowExport(true)
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.match(/\.(wav|flac|mp3|ogg)$/i)) {
      toast('error', 'Unsupported file format. Use WAV, FLAC, MP3, or OGG.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      setAudioBase64(base64)
      setSampleRate(44100) // Default, actual rate will come from processing
      setDuration(0)
      setUndoStack([])
      setRedoStack([])
      waveformKey.current++
      toast('info', `Loaded: ${file.name}`)
    }
    reader.readAsArrayBuffer(file)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if (e.ctrlKey && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo() }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo() }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const hasAudio = !!audioBase64

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2"><FiEdit2 className="text-orange-400" /> Waveform Editor</h1>
          <p className="text-gray-400 text-sm mt-1">
            {currentPrompt ? `Editing: "${currentPrompt.slice(0, 60)}${currentPrompt.length > 60 ? '...' : ''}"` : 'Trim, adjust, and prepare your audio for production'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAudio && (
            <>
              <span className="text-xs text-gray-500">{duration.toFixed(1)}s • {sampleRate}Hz</span>
              <button onClick={handleUndo} disabled={undoStack.length === 0}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (Ctrl+Z)">
                <FiRotateCcw size={16} />
              </button>
              <button onClick={handleRedo} disabled={redoStack.length === 0}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (Ctrl+Shift+Z)">
                <FiRotateCw size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Waveform Display */}
      <div
        className="flex-1 min-h-[250px] rounded-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
      >
        {hasAudio ? (
          <WaveformPlayer
            key={waveformKey.current}
            audioBase64={audioBase64!}
            sampleRate={sampleRate}
            height={220}
            enableRegions
            onRegionChange={(start, end) => { setRegionStart(start); setRegionEnd(end) }}
          />
        ) : (
          <div className="h-full flex items-center justify-center border border-surface-700 border-dashed rounded-lg bg-surface-900/50">
            <div className="text-center text-gray-500">
              <FiUpload className="text-4xl mx-auto mb-3" />
              <p>Drop an audio file here</p>
              <p className="text-sm mt-1 text-gray-700">or generate audio and click "Edit"</p>
            </div>
          </div>
        )}
      </div>

      {regionStart !== null && regionEnd !== null && (
        <div className="text-sm text-gray-400">
          Selection: {regionStart.toFixed(2)}s — {regionEnd.toFixed(2)}s ({(regionEnd - regionStart).toFixed(2)}s)
        </div>
      )}

      {/* Editing Tools */}
      <div className="bg-surface-900 border border-surface-700 rounded-lg p-4">
        <div className="flex gap-2 flex-wrap items-end">
          {/* Trim */}
          <ToolButton icon={<FiScissors />} label="Trim" disabled={!hasAudio || isProcessing} onClick={handleTrim}
            hint={regionStart !== null ? `${regionStart.toFixed(1)}s–${regionEnd?.toFixed(1)}s` : 'Select region'} />

          {/* Fade In */}
          <div className="relative">
            <ToolButton icon={<FiTrendingUp />} label="Fade In" disabled={!hasAudio || isProcessing}
              onClick={() => showParams === 'fadeIn' ? handleFadeIn() : setShowParams('fadeIn')} />
            {showParams === 'fadeIn' && (
              <ParamPopover onClose={() => setShowParams(null)} onApply={handleFadeIn}>
                <label className="text-xs text-gray-400">Duration: {fadeInDuration}s</label>
                <input type="range" min={0.1} max={5} step={0.1} value={fadeInDuration} onChange={(e) => setFadeInDuration(Number(e.target.value))} className="w-full accent-orange-400" />
              </ParamPopover>
            )}
          </div>

          {/* Fade Out */}
          <div className="relative">
            <ToolButton icon={<FiTrendingUp className="rotate-180" />} label="Fade Out" disabled={!hasAudio || isProcessing}
              onClick={() => showParams === 'fadeOut' ? handleFadeOut() : setShowParams('fadeOut')} />
            {showParams === 'fadeOut' && (
              <ParamPopover onClose={() => setShowParams(null)} onApply={handleFadeOut}>
                <label className="text-xs text-gray-400">Duration: {fadeOutDuration}s</label>
                <input type="range" min={0.1} max={5} step={0.1} value={fadeOutDuration} onChange={(e) => setFadeOutDuration(Number(e.target.value))} className="w-full accent-orange-400" />
              </ParamPopover>
            )}
          </div>

          {/* Normalize */}
          <ToolButton icon={<FiVolume2 />} label="Normalize" disabled={!hasAudio || isProcessing} onClick={handleNormalize} />

          {/* Gain */}
          <div className="relative">
            <ToolButton icon={<FiVolume2 />} label="Gain" disabled={!hasAudio || isProcessing}
              onClick={() => showParams === 'gain' ? handleGain() : setShowParams('gain')} />
            {showParams === 'gain' && (
              <ParamPopover onClose={() => setShowParams(null)} onApply={handleGain}>
                <label className="text-xs text-gray-400">Gain: {gainDb > 0 ? '+' : ''}{gainDb}dB</label>
                <input type="range" min={-20} max={20} step={0.5} value={gainDb} onChange={(e) => setGainDb(Number(e.target.value))} className="w-full accent-orange-400" />
              </ParamPopover>
            )}
          </div>

          <div className="flex-1" />

          <ToolButton icon={<FiDownload />} label="Export" disabled={!hasAudio} onClick={handleExport} />
          <ToolButton icon={<FiSave />} label="Save" disabled={!hasAudio} onClick={handleSave} primary />
        </div>
      </div>

      {showExport && audioBase64 && (
        <ExportDialog audioBase64={audioBase64} sampleRate={sampleRate} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}

function ToolButton({
  icon, label, disabled, primary, onClick, hint
}: {
  icon: React.ReactNode; label: string; disabled?: boolean; primary?: boolean; onClick?: () => void; hint?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
        primary
          ? 'bg-orange-500 hover:bg-orange-400 text-white disabled:bg-surface-700'
          : 'bg-surface-800 hover:bg-surface-700 text-gray-300 disabled:bg-surface-800/50'
      } disabled:text-gray-500 disabled:cursor-not-allowed`}
      title={hint}
    >
      {icon} {label}
    </button>
  )
}

function ParamPopover({
  children, onClose, onApply
}: {
  children: React.ReactNode; onClose: () => void; onApply: () => void
}) {
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-surface-800 border border-surface-700 rounded-lg p-3 w-48 shadow-lg z-10">
      <div className="flex flex-col gap-2">
        {children}
        <div className="flex gap-1 mt-1">
          <button onClick={() => { onApply(); onClose() }} className="flex-1 px-2 py-1 text-xs bg-orange-500 hover:bg-orange-400 text-white rounded transition-colors">Apply</button>
          <button onClick={onClose} className="px-2 py-1 text-xs bg-surface-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}



