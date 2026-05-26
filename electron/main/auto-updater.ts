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
      try {
        await autoUpdater.downloadUpdate()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Download update failed:', msg)
        mainWindow.setProgressBar(-1)
        mainWindow.setTitle('Stable Audio Studio')
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Update Failed',
          message: `Failed to download the update.\n\n${msg}\n\nYou can download it manually from the GitHub releases page.`,
        })
      }
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    mainWindow.setProgressBar(pct / 100)
    mainWindow.setTitle(`Stable Audio Studio - Downloading update ${pct}%`)
  })

  autoUpdater.on('update-downloaded', async () => {
    mainWindow.setProgressBar(-1)
    mainWindow.setTitle('Stable Audio Studio')

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
    console.error('Auto-updater error:', err.message)
    mainWindow.setProgressBar(-1)
    mainWindow.setTitle('Stable Audio Studio')
  })

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('Update check failed:', err.message)
    })
  }, 5000)
}
