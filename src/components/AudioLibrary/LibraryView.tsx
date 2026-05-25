import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiTrash2, FiHeart, FiSearch, FiSliders, FiDownload, FiTag, FiX, FiCheck, FiFolder } from 'react-icons/fi'
import WaveformPlayer from '../shared/WaveformPlayer'
import { toast } from '../shared/Toast'
import { useAudio } from '../../contexts/AudioContext'

interface AudioItem {
  id: string
  title: string
  prompt: string
  duration: number
  sample_rate: number
  tags: string
  favorite: number
  created_at: string
}

type SortField = 'created_at' | 'duration' | 'title'
type SortDir = 'asc' | 'desc'

export default function LibraryView() {
  const navigate = useNavigate()
  const { setAudio } = useAudio()
  const [items, setItems] = useState<AudioItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedAudio, setExpandedAudio] = useState<string | null>(null)
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterFavorites, setFilterFavorites] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => { loadLibrary() }, [])

  const loadLibrary = async () => {
    try {
      const result = await window.api.libraryList()
      setItems(result)
    } catch (err) {
      toast('error', 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await window.api.libraryDelete(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    toast('info', 'Audio deleted')
  }

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await window.api.libraryDelete(id)
    }
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)))
    toast('info', `Deleted ${selectedIds.size} items`)
    setSelectedIds(new Set())
  }

  const handleToggleFavorite = async (id: string, current: number) => {
    await window.api.libraryUpdate(id, { favorite: !current })
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, favorite: current ? 0 : 1 } : item))
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedAudio(null)
      return
    }
    setExpandedId(id)
    try {
      const base64 = await window.api.libraryGetAudio(id)
      setExpandedAudio(base64)
    } catch {
      toast('error', 'Failed to load audio')
    }
  }

  const handleOpenInEditor = async (item: AudioItem) => {
    try {
      const base64 = await window.api.libraryGetAudio(item.id)
      setAudio(base64, item.sample_rate, item.duration, item.prompt, item.id)
      navigate('/editor')
    } catch {
      toast('error', 'Failed to load audio')
    }
  }

  const handleExport = async (item: AudioItem) => {
    try {
      const base64 = await window.api.libraryGetAudio(item.id)
      const result = await window.api.exportAudio({ audioBase64: base64, format: 'wav', sampleRate: item.sample_rate })
      if (result.success) toast('success', 'Audio exported')
    } catch {
      toast('error', 'Export failed')
    }
  }

  const handleSaveTags = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const existingTags: string[] = JSON.parse(item.tags || '[]')
    const newTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    const mergedTags = [...new Set([...existingTags, ...newTags])]
    await window.api.libraryUpdate(id, { tags: mergedTags })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, tags: JSON.stringify(mergedTags) } : i))
    setEditingTagsId(null)
    setTagInput('')
    toast('success', 'Tags updated')
  }

  const handleRemoveTag = async (id: string, tag: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const tags: string[] = JSON.parse(item.tags || '[]').filter((t: string) => t !== tag)
    await window.api.libraryUpdate(id, { tags })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, tags: JSON.stringify(tags) } : i))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const filteredItems = items
    .filter((item) => {
      if (filterFavorites && !item.favorite) return false
      if (!search) return true
      const q = search.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.prompt.toLowerCase().includes(q) || item.tags.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortField === 'created_at') cmp = a.created_at.localeCompare(b.created_at)
      else if (sortField === 'duration') cmp = a.duration - b.duration
      else if (sortField === 'title') cmp = a.title.localeCompare(b.title)
      return sortDir === 'desc' ? -cmp : cmp
    })

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2"><FiFolder className="text-orange-400" /> Audio Library</h1>
          <p className="text-gray-400 text-sm mt-1">{items.length} items{filteredItems.length !== items.length ? ` (${filteredItems.length} shown)` : ''}</p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">{selectedIds.size} selected</span>
            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-sm bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors">Delete Selected</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg transition-colors">Clear</button>
          </div>
        )}
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, prompt, or tags..."
            className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors" />
        </div>
        <button onClick={() => setFilterFavorites(!filterFavorites)}
          className={`px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm transition-colors ${filterFavorites ? 'bg-red-900/30 text-red-400' : 'bg-surface-800 text-gray-400 hover:bg-surface-700'}`}>
          <FiHeart size={14} /> Favorites
        </button>
        <select value={`${sortField}-${sortDir}`} onChange={(e) => { const [f, d] = e.target.value.split('-'); setSortField(f as SortField); setSortDir(d as SortDir) }}
          className="bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500">
          <option value="created_at-desc">Newest first</option>
          <option value="created_at-asc">Oldest first</option>
          <option value="duration-desc">Longest first</option>
          <option value="duration-asc">Shortest first</option>
          <option value="title-asc">Title A-Z</option>
          <option value="title-desc">Title Z-A</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">Loading library...</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {items.length === 0 ? 'No audio in library. Generate some audio first!' : 'No matching items'}
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredItems.map((item) => {
              const tags: string[] = JSON.parse(item.tags || '[]')
              const isExpanded = expandedId === item.id
              return (
                <div key={item.id} className={`bg-surface-900 border rounded-lg transition-colors ${selectedIds.has(item.id) ? 'border-orange-500' : 'border-surface-700 hover:border-surface-700'}`}>
                  <div className="p-4 flex items-center gap-4">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 rounded bg-surface-800 border-surface-600 text-orange-500 focus:ring-0 cursor-pointer" />

                    <button onClick={() => handleExpand(item.id)}
                      className="w-10 h-10 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center hover:bg-orange-500/30 transition-colors shrink-0">
                      {isExpanded ? '▼' : '▶'}
                    </button>

                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleExpand(item.id)}>
                      <h3 className="text-white font-medium truncate">{item.title}</h3>
                      <p className="text-gray-500 text-sm truncate">{item.prompt}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">{item.duration.toFixed(1)}s • {item.sample_rate}Hz</span>
                        {tags.map((tag) => (
                          <span key={tag} className="text-xs bg-surface-800 text-gray-400 px-2 py-0.5 rounded inline-flex items-center gap-1">
                            {tag}
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveTag(item.id, tag) }} className="hover:text-red-400"><FiX size={10} /></button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggleFavorite(item.id, item.favorite)}
                        className={`p-2 rounded-lg transition-colors ${item.favorite ? 'text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-gray-400 hover:bg-surface-800'}`} title="Favorite">
                        <FiHeart size={16} />
                      </button>
                      <button onClick={() => { setEditingTagsId(editingTagsId === item.id ? null : item.id); setTagInput('') }}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-400 hover:bg-surface-800 transition-colors" title="Add tags">
                        <FiTag size={16} />
                      </button>
                      <button onClick={() => handleOpenInEditor(item)}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-400 hover:bg-surface-800 transition-colors" title="Open in editor">
                        <FiSliders size={16} />
                      </button>
                      <button onClick={() => handleExport(item)}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-400 hover:bg-surface-800 transition-colors" title="Export">
                        <FiDownload size={16} />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors" title="Delete">
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {editingTagsId === item.id && (
                    <div className="px-4 pb-3 flex gap-2">
                      <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTags(item.id) }}
                        placeholder="Add tags (comma separated)" autoFocus
                        className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                      <button onClick={() => handleSaveTags(item.id)} className="p-1.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg"><FiCheck size={14} /></button>
                      <button onClick={() => setEditingTagsId(null)} className="p-1.5 bg-surface-800 hover:bg-surface-700 text-gray-400 rounded-lg"><FiX size={14} /></button>
                    </div>
                  )}

                  {isExpanded && expandedAudio && (
                    <div className="px-4 pb-4">
                      <WaveformPlayer audioBase64={expandedAudio} sampleRate={item.sample_rate} height={100} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}



