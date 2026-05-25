import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { registerIpcHandlers } from './ipc-handlers'
import { setupAutoUpdater } from './auto-updater'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null
let isSettingUp = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Stable Audio Studio',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.stableaudiostudio.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start Python backend
  pythonBridge = new PythonBridge()

  // In production, check if Python venv exists and offer setup if not
  isSettingUp = true
  const ready = await pythonBridge.ensureSetup()
  isSettingUp = false

  if (!ready) {
    app.quit()
    return
  }

  await pythonBridge.start()

  // Register IPC handlers
  registerIpcHandlers(ipcMain, pythonBridge)

  createWindow()

  // Check for updates (production only)
  if (mainWindow) {
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  // Don't quit during setup (progress window closing triggers this)
  if (isSettingUp) return

  if (pythonBridge) {
    await pythonBridge.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
