import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AudioState {
  /** Currently loaded audio in base64 */
  currentAudio: string | null
  currentSampleRate: number
  currentDuration: number
  currentPrompt: string
  /** ID from library, if loaded from there */
  currentLibraryId: string | null
}

interface AudioContextType extends AudioState {
  setAudio: (audio: string, sampleRate: number, duration: number, prompt: string, libraryId?: string) => void
  clearAudio: () => void
}

const AudioCtx = createContext<AudioContextType | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioState>({
    currentAudio: null,
    currentSampleRate: 44100,
    currentDuration: 0,
    currentPrompt: '',
    currentLibraryId: null
  })

  const setAudio = useCallback(
    (audio: string, sampleRate: number, duration: number, prompt: string, libraryId?: string) => {
      setState({
        currentAudio: audio,
        currentSampleRate: sampleRate,
        currentDuration: duration,
        currentPrompt: prompt,
        currentLibraryId: libraryId || null
      })
    },
    []
  )

  const clearAudio = useCallback(() => {
    setState({
      currentAudio: null,
      currentSampleRate: 44100,
      currentDuration: 0,
      currentPrompt: '',
      currentLibraryId: null
    })
  }, [])

  return (
    <AudioCtx.Provider value={{ ...state, setAudio, clearAudio }}>
      {children}
    </AudioCtx.Provider>
  )
}

export function useAudio() {
  const ctx = useContext(AudioCtx)
  if (!ctx) throw new Error('useAudio must be used within AudioProvider')
  return ctx
}
