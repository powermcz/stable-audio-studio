import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Layout/Sidebar'
import GeneratorView from './components/AudioGenerator/GeneratorView'
import LibraryView from './components/AudioLibrary/LibraryView'
import EditorView from './components/WaveformEditor/EditorView'
import SettingsView from './components/Settings/SettingsView'
import { ToastContainer } from './components/shared/Toast'
import { AudioProvider } from './contexts/AudioContext'

export default function App() {
  const [currentView, setCurrentView] = useState<'generator' | 'library' | 'editor' | 'settings'>('generator')

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { setCurrentView('generator'); window.location.hash = '#/' }
        if (e.key === '2') { setCurrentView('library'); window.location.hash = '#/library' }
        if (e.key === '3') { setCurrentView('editor'); window.location.hash = '#/editor' }
        if (e.key === '4') { setCurrentView('settings'); window.location.hash = '#/settings' }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <AudioProvider>
      <HashRouter>
        <div className="flex h-screen bg-surface-950">
          <Sidebar currentView={currentView} onNavigate={setCurrentView} />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<GeneratorView />} />
              <Route path="/library" element={<LibraryView />} />
              <Route path="/editor" element={<EditorView />} />
              <Route path="/editor/:id" element={<EditorView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          </main>
        </div>
        <ToastContainer />
      </HashRouter>
    </AudioProvider>
  )
}

