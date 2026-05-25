import { useNavigate } from 'react-router-dom'
import { FiFolder, FiSliders, FiSettings } from 'react-icons/fi'
import { FiMusic } from 'react-icons/fi'
import logoImg from '/assets/logo-transparent.png'

interface SidebarProps {
  currentView: 'generator' | 'library' | 'editor' | 'settings'
  onNavigate: (view: 'generator' | 'library' | 'editor' | 'settings') => void
}

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const navigate = useNavigate()

  const navItems = [
    { id: 'generator' as const, label: 'Generate', icon: FiMusic, path: '/', shortcut: '⌃1' },
    { id: 'library' as const, label: 'Library', icon: FiFolder, path: '/library', shortcut: '⌃2' },
    { id: 'editor' as const, label: 'Editor', icon: FiSliders, path: '/editor', shortcut: '⌃3' }
  ]

  return (
    <aside className="w-16 bg-surface-900 border-r border-surface-700 flex flex-col items-center py-4 gap-2">
      <div className="mb-4">
        <img src={logoImg} alt="" className="w-10 h-10 object-contain" />
      </div>

      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            onNavigate(item.id)
            navigate(item.path)
          }}
          className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
            currentView === item.id
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
          }`}
          title={`${item.label} (Ctrl+${navItems.indexOf(item) + 1})`}
        >
          <item.icon className="text-lg" />
          <span className="text-[10px]">{item.label}</span>
        </button>
      ))}

      <div className="mt-auto">
        <button
          onClick={() => { onNavigate('settings'); navigate('/settings') }}
          className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
            currentView === 'settings'
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
          }`}
          title="Settings (Ctrl+4)">
          <FiSettings className="text-lg" />
          <span className="text-[10px]">Settings</span>
        </button>
      </div>
    </aside>
  )
}


