import { useRef, useEffect, useCallback, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions.js'
import { FiPlay, FiPause, FiSkipBack, FiVolume2, FiVolumeX, FiRepeat } from 'react-icons/fi'

interface WaveformPlayerProps {
  audioBase64?: string
  audioUrl?: string
  sampleRate?: number
  enableRegions?: boolean
  onRegionChange?: (start: number, end: number) => void
  height?: number
  compact?: boolean
}

function base64ToBlob(b64: string, mime = 'audio/wav'): Blob {
  const binaryString = atob(b64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let offset = 0; offset < len; offset += 8192) {
    const end = Math.min(offset + 8192, len)
    for (let i = offset; i < end; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
  }
  return new Blob([bytes], { type: mime })
}

export default function WaveformPlayer({
  audioBase64,
  audioUrl,
  sampleRate,
  enableRegions = false,
  onRegionChange,
  height = 128,
  compact = false
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const loopRef = useRef(false)

  // Keep ref in sync so the 'finish' handler sees the latest value
  useEffect(() => { loopRef.current = isLooping }, [isLooping])

  const destroyWaveSurfer = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const plugins: RegionsPlugin[] = []
    if (enableRegions) {
      const regions = RegionsPlugin.create()
      regionsRef.current = regions
      plugins.push(regions)
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#92400e',
      progressColor: '#f97316',
      cursorColor: '#fb923c',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height,
      normalize: true,
      plugins
    })

    ws.setVolume(volume)

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => {
      if (loopRef.current) {
        ws.seekTo(0)
        ws.play()
      } else {
        setIsPlaying(false)
      }
    })
    ws.on('timeupdate', (time) => setCurrentTime(time))
    ws.on('ready', () => setDuration(ws.getDuration()))

    if (enableRegions && regionsRef.current) {
      regionsRef.current.enableDragSelection({ color: 'rgba(249, 115, 22, 0.2)' })
      regionsRef.current.on('region-updated', (region: Region) => {
        onRegionChange?.(region.start, region.end)
      })
      regionsRef.current.on('region-created', (region: Region) => {
        const allRegions = regionsRef.current?.getRegions() || []
        allRegions.forEach((r) => { if (r.id !== region.id) r.remove() })
        onRegionChange?.(region.start, region.end)
      })
    }

    wavesurferRef.current = ws
    return () => destroyWaveSurfer()
  }, [enableRegions, height])

  // Load audio when source changes
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    if (audioBase64) {
      try {
        ws.loadBlob(base64ToBlob(audioBase64))
      } catch (err) {
        console.error('Failed to decode audio:', err)
      }
    } else if (audioUrl) {
      ws.load(audioUrl)
    }
  }, [audioBase64, audioUrl])

  const togglePlay = () => wavesurferRef.current?.playPause()
  const stop = () => wavesurferRef.current?.stop()

  const toggleMute = () => {
    if (isMuted) { wavesurferRef.current?.setVolume(volume); setIsMuted(false) }
    else { wavesurferRef.current?.setVolume(0); setIsMuted(true) }
  }

  const handleVolumeChange = (val: number) => {
    setVolume(val)
    wavesurferRef.current?.setVolume(val)
    if (val > 0 && isMuted) setIsMuted(false)
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  // Expose wavesurfer instance for parent components
  useEffect(() => {
    const el = containerRef.current
    if (el && wavesurferRef.current) {
      ;(el as any).__wavesurfer = wavesurferRef.current
      ;(el as any).__regions = regionsRef.current
    }
  })

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center hover:bg-orange-500/30 transition-colors shrink-0">
          {isPlaying ? <FiPause size={14} /> : <FiPlay size={14} />}
        </button>
        <div ref={containerRef} className="flex-1 min-w-0" />
        <span className="text-xs text-gray-500 tabular-nums shrink-0">{formatTime(currentTime)}</span>
        <button onClick={() => setIsLooping(!isLooping)} title="Loop"
          className={`p-1 rounded transition-colors ${isLooping ? 'text-orange-400' : 'text-gray-500 hover:text-gray-400'}`}>
          <FiRepeat size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="waveform-container rounded-lg bg-surface-900 border border-surface-700 p-2 cursor-pointer" />
      <div className="flex items-center gap-3">
        <button onClick={stop} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-surface-800 transition-colors" title="Stop">
          <FiSkipBack size={16} />
        </button>
        <button onClick={togglePlay} className="p-2 rounded-full bg-orange-500 hover:bg-orange-400 text-white transition-colors" title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <FiPause size={16} /> : <FiPlay size={16} />}
        </button>
        <button onClick={() => setIsLooping(!isLooping)} title={isLooping ? 'Loop on' : 'Loop off'}
          className={`p-1.5 rounded transition-colors ${isLooping ? 'text-orange-400 bg-orange-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'}`}>
          <FiRepeat size={16} />
        </button>

        <span className="text-sm text-gray-400 tabular-nums min-w-[80px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {sampleRate && <span className="text-xs text-gray-500">{sampleRate} Hz</span>}

        <div className="flex-1" />

        <button onClick={toggleMute} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-surface-800 transition-colors">
          {isMuted ? <FiVolumeX size={16} /> : <FiVolume2 size={16} />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))} className="w-20 accent-orange-400" />
      </div>
    </div>
  )
}


