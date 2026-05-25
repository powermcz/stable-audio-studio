import { useState } from 'react'
import { FiX, FiDownload } from 'react-icons/fi'
import { toast } from './Toast'

interface ExportDialogProps {
  audioBase64: string
  sampleRate: number
  onClose: () => void
}

const FORMATS = [
  { id: 'wav', label: 'WAV', desc: 'Uncompressed, highest quality' },
  { id: 'flac', label: 'FLAC', desc: 'Lossless compression' },
  { id: 'mp3', label: 'MP3', desc: 'Compressed, widely compatible' },
  { id: 'ogg', label: 'OGG Vorbis', desc: 'Open format, good quality' }
]

export default function ExportDialog({ audioBase64, sampleRate, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState('wav')
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await window.api.exportAudio({ audioBase64, format, sampleRate })
      if (result.success) {
        toast('success', `Exported as ${format.toUpperCase()}`)
        onClose()
      }
    } catch (err) {
      toast('error', 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Export Audio</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><FiX size={18} /></button>
        </div>

        <div className="grid gap-2 mb-6">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                format === f.id
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-surface-700 bg-surface-800/50 text-gray-300 hover:border-surface-600'
              }`}
            >
              <span className="font-medium">{f.label}</span>
              <span className="text-sm text-gray-500 ml-2">.{f.id}</span>
              <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
            </button>
          ))}
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:bg-surface-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <FiDownload size={16} /> {isExporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  )
}


