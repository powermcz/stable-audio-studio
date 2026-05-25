import { IpcMain, dialog, app } from 'electron'
import { PythonBridge } from './python-bridge'
import { join } from 'path'
import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null

const SETTINGS_DEFAULTS = {
  // Model & GPU
  device: 'auto',
  precision: 'fp16',
  autoLoadModel: false,
  // Generation defaults
  defaultSteps: 100,
  defaultCfgScale: 7,
  defaultDuration: 10,
  defaultNegativePrompt: 'Low quality.',
  defaultBatchCount: 1,
  // Output & storage
  defaultExportFormat: 'wav',
  autoSaveGenerated: true,
  // UI preferences
  theme: 'dark',
  waveformColor: '#92400e',
  waveformProgressColor: '#f97316',
  compactLibrary: false,
}

// electron-store v10 is ESM-only — must use dynamic import()
let settingsStore: any = null
async function getSettingsStore() {
  if (!settingsStore) {
    const { default: Store } = await import('electron-store')
    settingsStore = new Store({ name: 'settings', defaults: SETTINGS_DEFAULTS })
  }
  return settingsStore
}

function getLibraryPath(): string {
  return join(app.getPath('userData'), 'library')
}

function getDbPath(): string {
  return join(app.getPath('userData'), 'library.db')
}

function saveDb(): void {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(getDbPath(), buffer)
  }
}

async function ensureDb(): Promise<SqlJsDatabase> {
  if (!db) {
    const SQL = await initSqlJs()
    const dbPath = getDbPath()
    if (existsSync(dbPath)) {
      const fileBuffer = readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
    } else {
      db = new SQL.Database()
    }
    db.run(`
      CREATE TABLE IF NOT EXISTS audio_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        file_path TEXT NOT NULL,
        duration REAL,
        sample_rate INTEGER,
        channels INTEGER,
        format TEXT DEFAULT 'wav',
        tags TEXT DEFAULT '[]',
        favorite INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)
    saveDb()
  }
  return db
}

function queryAll(database: SqlJsDatabase, sql: string, params?: unknown[]): Record<string, unknown>[] {
  const stmt = database.prepare(sql)
  if (params) stmt.bind(params)
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

function queryOne(database: SqlJsDatabase, sql: string, params?: unknown[]): Record<string, unknown> | undefined {
  const results = queryAll(database, sql, params)
  return results[0]
}

export function registerIpcHandlers(ipcMain: IpcMain, pythonBridge: PythonBridge): void {
  // --- Generation ---
  ipcMain.handle('generate-audio', async (_event, params: {
    prompt: string
    negativePrompt?: string
    duration: number
    steps?: number
    cfgScale?: number
    seed?: number
  }) => {
    const result = await pythonBridge.request<{
      audio_base64: string
      sample_rate: number
      duration: number
    }>('POST', '/api/generate', params)
    return result
  })

  // --- Model Status ---
  ipcMain.handle('get-model-status', async () => {
    return pythonBridge.request('GET', '/api/model/status')
  })

  ipcMain.handle('load-model', async () => {
    return pythonBridge.request('POST', '/api/model/load')
  })

  ipcMain.handle('check-model-auth', async () => {
    return pythonBridge.request('GET', '/api/model/auth')
  })

  // --- Library ---
  ipcMain.handle('library-save', async (_event, params: {
    title: string
    prompt: string
    audioBase64: string
    sampleRate: number
    duration: number
    tags?: string[]
  }) => {
    const libraryPath = getLibraryPath()
    if (!existsSync(libraryPath)) {
      await mkdir(libraryPath, { recursive: true })
    }

    const id = uuidv4()
    const fileName = `${id}.wav`
    const filePath = join(libraryPath, fileName)

    const audioBuffer = Buffer.from(params.audioBase64, 'base64')
    await writeFile(filePath, audioBuffer)

    const database = await ensureDb()
    database.run(
      `INSERT INTO audio_items (id, title, prompt, file_path, duration, sample_rate, channels, tags)
       VALUES (?, ?, ?, ?, ?, ?, 2, ?)`,
      [id, params.title, params.prompt, filePath, params.duration, params.sampleRate, JSON.stringify(params.tags || [])]
    )
    saveDb()

    return { id, filePath }
  })

  ipcMain.handle('library-list', async () => {
    const database = await ensureDb()
    return queryAll(database, 'SELECT * FROM audio_items ORDER BY created_at DESC')
  })

  ipcMain.handle('library-delete', async (_event, id: string) => {
    const database = await ensureDb()
    const item = queryOne(database, 'SELECT file_path FROM audio_items WHERE id = ?', [id]) as { file_path: string } | undefined
    if (item) {
      try {
        await unlink(item.file_path)
      } catch { /* file may already be deleted */ }
      database.run('DELETE FROM audio_items WHERE id = ?', [id])
      saveDb()
    }
    return { success: true }
  })

  ipcMain.handle('library-update', async (_event, id: string, updates: {
    title?: string
    tags?: string[]
    favorite?: boolean
  }) => {
    const database = await ensureDb()
    const sets: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) {
      sets.push('title = ?')
      values.push(updates.title)
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.favorite !== undefined) {
      sets.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    sets.push("updated_at = datetime('now')")
    values.push(id)

    database.run(`UPDATE audio_items SET ${sets.join(', ')} WHERE id = ?`, values)
    saveDb()
    return { success: true }
  })

  ipcMain.handle('library-get-audio', async (_event, id: string) => {
    const database = await ensureDb()
    const item = queryOne(database, 'SELECT file_path FROM audio_items WHERE id = ?', [id]) as { file_path: string } | undefined
    if (!item) throw new Error('Audio item not found')
    const buffer = await readFile(item.file_path)
    return buffer.toString('base64')
  })

  // --- Export ---
  ipcMain.handle('export-audio', async (_event, params: {
    audioBase64: string
    format: string
    sampleRate: number
  }) => {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: 'WAV', extensions: ['wav'] },
        { name: 'FLAC', extensions: ['flac'] },
        { name: 'MP3', extensions: ['mp3'] },
        { name: 'OGG', extensions: ['ogg'] }
      ],
      defaultPath: `audio-export.${params.format}`
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    // If format conversion needed, use Python backend
    if (params.format !== 'wav') {
      const converted = await pythonBridge.requestBuffer('POST', '/api/audio/convert', {
        audio_base64: params.audioBase64,
        target_format: params.format,
        sample_rate: params.sampleRate
      })
      await writeFile(result.filePath, converted)
    } else {
      const buffer = Buffer.from(params.audioBase64, 'base64')
      await writeFile(result.filePath, buffer)
    }

    return { success: true, filePath: result.filePath }
  })

  // --- Audio Processing ---
  ipcMain.handle('audio-process', async (_event, params: {
    audioBase64: string
    operations: Array<{
      type: 'trim' | 'fade_in' | 'fade_out' | 'normalize' | 'gain'
      params: Record<string, number>
    }>
    sampleRate: number
  }) => {
    return pythonBridge.request('POST', '/api/audio/process', {
      audio_base64: params.audioBase64,
      operations: params.operations,
      sample_rate: params.sampleRate
    })
  })

  // --- App Info ---
  ipcMain.handle('get-app-path', async () => {
    return app.getPath('userData')
  })

  // --- Generation Progress ---
  ipcMain.handle('get-generation-progress', async () => {
    try {
      return await pythonBridge.request('GET', '/api/model/status')
    } catch {
      return {
        loaded: false, loading: false, device: 'unknown', model_name: '',
        error: null, model_cached: false,
        generating: false, generation_progress: 0, generation_total: 0
      }
    }
  })

  // --- Settings ---
  ipcMain.handle('settings-get-all', async () => {
    const store = await getSettingsStore()
    return store.store
  })

  ipcMain.handle('settings-get', async (_event, key: string) => {
    const store = await getSettingsStore()
    return store.get(key)
  })

  ipcMain.handle('settings-set', async (_event, key: string, value: unknown) => {
    const store = await getSettingsStore()
    store.set(key, value)
    return { success: true }
  })

  ipcMain.handle('settings-set-many', async (_event, obj: Record<string, unknown>) => {
    const store = await getSettingsStore()
    for (const [key, value] of Object.entries(obj)) {
      store.set(key, value)
    }
    return { success: true }
  })

  ipcMain.handle('settings-reset', async () => {
    const store = await getSettingsStore()
    store.clear()
    return store.store
  })
}
