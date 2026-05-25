import { useState, useEffect } from 'react'
import { FiSave, FiRotateCcw, FiCpu, FiSliders, FiHardDrive, FiMonitor } from 'react-icons/fi'
import { toast } from '../shared/Toast'

interface Settings {
  // Model & GPU
  device: string
  precision: string
  autoLoadModel: boolean
  // Generation defaults
  defaultSteps: number
  defaultCfgScale: number
  defaultDuration: number
  defaultNegativePrompt: string
  defaultBatchCount: number
  // Output & storage
  defaultExportFormat: string
  autoSaveGenerated: boolean
  // UI preferences
  theme: string
  waveformColor: string
  waveformProgressColor: string
  compactLibrary: boolean
}

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [modelStatus, setModelStatus] = useState<{ loaded: boolean; device: string; model_name: string } | null>(null)

  useEffect(() => {
    loadSettings()
    loadModelStatus()
  }, [])

  const loadSettings = async () => {
    const all = await window.api.settingsGetAll() as unknown as Settings
    setSettings(all)
    setDirty(false)
  }

  const loadModelStatus = async () => {
    try {
      const status = await window.api.getGenerationProgress()
      setModelStatus({ loaded: status.loaded, device: status.device, model_name: status.model_name })
    } catch { /* ignore */ }
  }

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  const handleSave = async () => {
    if (!settings) return
    await window.api.settingsSetMany(settings as unknown as Record<string, unknown>)
    setDirty(false)
    toast('success', 'Settings saved')
  }

  const handleReset = async () => {
    const defaults = await window.api.settingsReset() as unknown as Settings
    setSettings(defaults)
    setDirty(false)
    toast('info', 'Settings reset to defaults')
  }

  if (!settings) return <div className="h-full flex items-center justify-center text-gray-500">Loading settings...</div>

  return (
    <div className="h-full flex flex-col p-6 gap-6 overflow-y-auto">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2"><FiSliders className="text-orange-400" /> Settings</h1>
          <p className="text-gray-400 text-sm mt-1">Configure model, generation defaults, output, and UI</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg flex items-center gap-1.5 transition-colors">
            <FiRotateCcw size={14} /> Reset Defaults
          </button>
          <button onClick={handleSave} disabled={!dirty}
            className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 disabled:bg-surface-700 disabled:text-gray-500 text-white rounded-lg flex items-center gap-1.5 transition-colors">
            <FiSave size={14} /> Save
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-6">

        {/* ---- Model & GPU ---- */}
        <Section icon={<FiCpu />} title="Model & GPU">
          {modelStatus && (
            <div className="mb-4 px-3 py-2 bg-surface-800/50 rounded-lg text-sm">
              <span className="text-gray-400">Status: </span>
              <span className={modelStatus.loaded ? 'text-green-400' : 'text-yellow-400'}>
                {modelStatus.loaded ? 'Loaded' : 'Not loaded'}
              </span>
              <span className="text-gray-500 mx-2">•</span>
              <span className="text-gray-400">Device: </span>
              <span className="text-white">{modelStatus.device}</span>
              <span className="text-gray-500 mx-2">•</span>
              <span className="text-gray-400">Model: </span>
              <span className="text-gray-300">{modelStatus.model_name || 'stabilityai/stable-audio-open-1.0'}</span>
            </div>
          )}

          <Row label="Device">
            <select value={settings.device} onChange={(e) => update('device', e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 w-48">
              <option value="auto">Auto (best available)</option>
              <option value="cuda">CUDA (NVIDIA GPU)</option>
              <option value="cpu">CPU (slow)</option>
            </select>
          </Row>
          <Row label="Precision">
            <select value={settings.precision} onChange={(e) => update('precision', e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 w-48">
              <option value="fp16">FP16 (faster, less VRAM)</option>
              <option value="fp32">FP32 (higher precision)</option>
            </select>
          </Row>
          <Row label="Auto-load model on startup">
            <Toggle checked={settings.autoLoadModel} onChange={(v) => update('autoLoadModel', v)} />
          </Row>
        </Section>

        {/* ---- Generation Defaults ---- */}
        <Section icon={<FiSliders />} title="Generation Defaults">
          <Row label={`Steps: ${settings.defaultSteps}`}>
            <input type="range" min={10} max={200} step={10} value={settings.defaultSteps}
              onChange={(e) => update('defaultSteps', Number(e.target.value))} className="w-48 accent-orange-400" />
          </Row>
          <Row label={`CFG Scale: ${settings.defaultCfgScale}`}>
            <input type="range" min={1} max={15} step={0.5} value={settings.defaultCfgScale}
              onChange={(e) => update('defaultCfgScale', Number(e.target.value))} className="w-48 accent-orange-400" />
          </Row>
          <Row label={`Duration: ${settings.defaultDuration}s`}>
            <input type="range" min={1} max={47} value={settings.defaultDuration}
              onChange={(e) => update('defaultDuration', Number(e.target.value))} className="w-48 accent-orange-400" />
          </Row>
          <Row label={`Batch Count: ${settings.defaultBatchCount}`}>
            <input type="range" min={1} max={8} value={settings.defaultBatchCount}
              onChange={(e) => update('defaultBatchCount', Number(e.target.value))} className="w-48 accent-orange-400" />
          </Row>
          <Row label="Default Negative Prompt">
            <input type="text" value={settings.defaultNegativePrompt}
              onChange={(e) => update('defaultNegativePrompt', e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 w-72" />
          </Row>
        </Section>

        {/* ---- Output & Storage ---- */}
        <Section icon={<FiHardDrive />} title="Output & Storage">
          <Row label="Default Export Format">
            <select value={settings.defaultExportFormat} onChange={(e) => update('defaultExportFormat', e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 w-48">
              <option value="wav">WAV (lossless)</option>
              <option value="flac">FLAC (lossless compressed)</option>
              <option value="mp3">MP3 (lossy)</option>
              <option value="ogg">OGG Vorbis (lossy)</option>
            </select>
          </Row>
          <Row label="Auto-save generated samples to library">
            <Toggle checked={settings.autoSaveGenerated} onChange={(v) => update('autoSaveGenerated', v)} />
          </Row>
        </Section>

        {/* ---- UI Preferences ---- */}
        <Section icon={<FiMonitor />} title="UI Preferences">
          <Row label="Waveform Color">
            <div className="flex items-center gap-2">
              <input type="color" value={settings.waveformColor}
                onChange={(e) => update('waveformColor', e.target.value)}
                className="w-8 h-8 rounded border border-surface-700 bg-transparent cursor-pointer" />
              <span className="text-xs text-gray-500 font-mono">{settings.waveformColor}</span>
            </div>
          </Row>
          <Row label="Waveform Progress Color">
            <div className="flex items-center gap-2">
              <input type="color" value={settings.waveformProgressColor}
                onChange={(e) => update('waveformProgressColor', e.target.value)}
                className="w-8 h-8 rounded border border-surface-700 bg-transparent cursor-pointer" />
              <span className="text-xs text-gray-500 font-mono">{settings.waveformProgressColor}</span>
            </div>
          </Row>
          <Row label="Compact library view">
            <Toggle checked={settings.compactLibrary} onChange={(v) => update('compactLibrary', v)} />
          </Row>
        </Section>

        {/* ---- Keyboard Shortcuts reference ---- */}
        <Section icon={<FiMonitor />} title="Keyboard Shortcuts">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <Shortcut keys="Ctrl+1" action="Switch to Generator" />
            <Shortcut keys="Ctrl+2" action="Switch to Library" />
            <Shortcut keys="Ctrl+3" action="Switch to Editor" />
            <Shortcut keys="Ctrl+4" action="Switch to Settings" />
            <Shortcut keys="Ctrl+Enter" action="Generate audio" />
            <Shortcut keys="Ctrl+S" action="Save (in editor)" />
            <Shortcut keys="Ctrl+Z" action="Undo (in editor)" />
            <Shortcut keys="Ctrl+Shift+Z" action="Redo (in editor)" />
          </div>
        </Section>
      </div>
    </div>
  )
}

/* ---- Helper components ---- */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-lg p-5">
      <h2 className="text-base font-semibold text-white font-display flex items-center gap-2 mb-4">
        <span className="text-orange-400">{icon}</span> {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-300 shrink-0">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-surface-700'}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Shortcut({ keys, action }: { keys: string; action: string }) {
  return (
    <>
      <span className="text-gray-500">{action}</span>
      <kbd className="text-xs font-mono bg-surface-800 text-gray-400 px-1.5 py-0.5 rounded">{keys}</kbd>
    </>
  )
}



