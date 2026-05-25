import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog, app } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Don't check for updates in dev mode
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (v${info.version}) is available.\n\nWould you like to download and install it?`,
      buttons: ['Download Update', 'Later'],
      defaultId: 0,
    })

    if (response === 0) {
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'The update has been downloaded.\n\nRestart now to install it?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    })

    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (err) => {
    console.log('Auto-updater error:', err.message)
  })

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('Update check failed:', err.message)
    })
  }, 5000)
}
