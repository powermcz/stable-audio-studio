import { ElectronAPI } from '../../electron/preload/index'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
