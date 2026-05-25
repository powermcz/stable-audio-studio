export interface GenerateParams {
  prompt: string
  negativePrompt?: string
  duration: number
  steps?: number
  cfgScale?: number
  seed?: number
}

export interface GenerateResult {
  audio_base64: string
  sample_rate: number
  duration: number
}

export interface AudioItem {
  id: string
  title: string
  prompt: string
  file_path: string
  duration: number
  sample_rate: number
  channels: number
  format: string
  tags: string // JSON string array
  favorite: number
  created_at: string
  updated_at: string
}

export interface ModelStatus {
  loaded: boolean
  loading: boolean
  device: string
  model_name: string
  error?: string
}

export interface AudioProcessOperation {
  type: 'trim' | 'fade_in' | 'fade_out' | 'normalize' | 'gain'
  params: Record<string, number>
}
