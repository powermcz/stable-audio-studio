import { contextBridge, ipcRenderer } from 'electron'

export type GenerateParams = {
  prompt: string
  negativePrompt?: string
  duration: number
  steps?: number
  cfgScale?: number
  seed?: number
}

export type AudioItem = {
  id: string
  title: string
  prompt: string
  file_path: string
  duration: number
  sample_rate: number
  channels: number
  format: string
  tags: string
  favorite: number
  created_at: string
  updated_at: string
}

export type AudioProcessOperation = {
  type: 'trim' | 'fade_in' | 'fade_out' | 'normalize' | 'gain'
  params: Record<string, number>
}

const api = {
  // Generation
  generateAudio: (params: GenerateParams) =>
    ipcRenderer.invoke('generate-audio', params),

  // Model
  getModelStatus: () =>
    ipcRenderer.invoke('get-model-status'),
  loadModel: () =>
    ipcRenderer.invoke('load-model'),
  checkModelAuth: () =>
    ipcRenderer.invoke('check-model-auth'),

  // Library
  librarySave: (params: {
    title: string
    prompt: string
    audioBase64: string
    sampleRate: number
    duration: number
    tags?: string[]
  }) => ipcRenderer.invoke('library-save', params),
  libraryList: () =>
    ipcRenderer.invoke('library-list'),
  libraryDelete: (id: string) =>
    ipcRenderer.invoke('library-delete', id),
  libraryUpdate: (id: string, updates: {
    title?: string
    tags?: string[]
    favorite?: boolean
  }) => ipcRenderer.invoke('library-update', id, updates),
  libraryGetAudio: (id: string) =>
    ipcRenderer.invoke('library-get-audio', id),

  // Export
  exportAudio: (params: {
    audioBase64: string
    format: string
    sampleRate: number
  }) => ipcRenderer.invoke('export-audio', params),

  // Audio Processing
  audioProcess: (params: {
    audioBase64: string
    operations: AudioProcessOperation[]
    sampleRate: number
  }) => ipcRenderer.invoke('audio-process', params),

  // App
  getAppPath: () =>
    ipcRenderer.invoke('get-app-path'),

  // Generation Progress
  getGenerationProgress: () =>
    ipcRenderer.invoke('get-generation-progress') as Promise<{
      loaded: boolean
      loading: boolean
      device: string
      model_name: string
      error: string | null
      model_cached: boolean
      generating: boolean
      generation_progress: number
      generation_total: number
    }>,

  // Settings
  settingsGetAll: () =>
    ipcRenderer.invoke('settings-get-all') as Promise<Record<string, unknown>>,
  settingsGet: (key: string) =>
    ipcRenderer.invoke('settings-get', key) as Promise<unknown>,
  settingsSet: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings-set', key, value) as Promise<{ success: boolean }>,
  settingsSetMany: (obj: Record<string, unknown>) =>
    ipcRenderer.invoke('settings-set-many', obj) as Promise<{ success: boolean }>,
  settingsReset: () =>
    ipcRenderer.invoke('settings-reset') as Promise<Record<string, unknown>>
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
