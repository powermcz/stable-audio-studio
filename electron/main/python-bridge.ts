import { ChildProcess, spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app, dialog } from 'electron'
import { is } from '@electron-toolkit/utils'

const PYTHON_PORT = 8765
const PYTHON_HOST = '127.0.0.1'

export class PythonBridge {
  private process: ChildProcess | null = null
  private baseUrl: string

  constructor() {
    this.baseUrl = `http://${PYTHON_HOST}:${PYTHON_PORT}`
  }

  /** Check if the Python venv is set up; if not, guide the user */
  async ensureSetup(): Promise<boolean> {
    const pythonPath = this.getPythonPath()
    if (existsSync(pythonPath)) return true

    // In production, the venv doesn't exist yet — user needs to set it up
    const serverCwd = this.getServerCwd()
    const reqFile = join(serverCwd, 'requirements.txt')

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Python Setup Required',
      message: 'Stable Audio Studio needs a Python environment to run the AI model.\n\n' +
        'This is a one-time setup that installs PyTorch and dependencies (~5 GB).\n\n' +
        'Requirements:\n' +
        '• Python 3.10–3.12 installed and on PATH\n' +
        '• NVIDIA GPU with CUDA 12.1+ drivers (recommended)\n' +
        '• HuggingFace account (for model download)',
      buttons: ['Set Up Now', 'Cancel'],
      defaultId: 0,
    })

    if (response !== 0) return false

    try {
      // Create venv
      console.log('Creating Python venv...')
      execSync('python -m venv venv', { cwd: serverCwd, stdio: 'inherit', timeout: 120_000 })

      // Install PyTorch with CUDA
      const pip = this.getPythonPath().replace('python.exe', 'pip.exe')
      console.log('Installing PyTorch with CUDA...')
      execSync(`"${pip}" install torch torchaudio --index-url https://download.pytorch.org/whl/cu121`, {
        cwd: serverCwd, stdio: 'inherit', timeout: 600_000
      })

      // Install requirements
      console.log('Installing dependencies...')
      execSync(`"${pip}" install -r "${reqFile}"`, {
        cwd: serverCwd, stdio: 'inherit', timeout: 600_000
      })

      await dialog.showMessageBox({
        type: 'info',
        title: 'Setup Complete',
        message: 'Python environment is ready!\n\nThe AI model (~5 GB) will download on first generation.',
      })
      return true
    } catch (err) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Setup Failed',
        message: `Python setup failed:\n\n${err}\n\nPlease set up manually — see the README for instructions.`,
      })
      return false
    }
  }

  async start(): Promise<void> {
    const pythonPath = this.getPythonPath()
    const serverScript = this.getServerScript()

    console.log(`Starting Python backend: ${pythonPath} -m uvicorn server.main:app --host ${PYTHON_HOST} --port ${PYTHON_PORT}`)

    this.process = spawn(pythonPath, [
      '-m', 'uvicorn',
      'server.main:app',
      '--host', PYTHON_HOST,
      '--port', String(PYTHON_PORT)
    ], {
      cwd: this.getServerCwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    this.process.stdout?.on('data', (data) => {
      console.log(`[Python] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[Python] ${data.toString().trim()}`)
    })

    this.process.on('error', (err) => {
      console.error('Failed to start Python backend:', err)
    })

    this.process.on('exit', (code) => {
      console.log(`Python backend exited with code ${code}`)
      this.process = null
    })

    // Wait for the server to be ready
    await this.waitForReady()
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' }
    }
    if (body) {
      options.body = JSON.stringify(body)
    }
    const response = await fetch(url, options)
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Python API error ${response.status}: ${errorText}`)
    }
    return response.json() as Promise<T>
  }

  async requestBuffer(method: string, path: string, body?: unknown): Promise<Buffer> {
    const url = `${this.baseUrl}${path}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' }
    }
    if (body) {
      options.body = JSON.stringify(body)
    }
    const response = await fetch(url, options)
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Python API error ${response.status}: ${errorText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  private getPythonPath(): string {
    if (is.dev) {
      return join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
    }
    // In production, extraResources places python/ next to the app
    return join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe')
  }

  private getServerCwd(): string {
    if (is.dev) {
      return join(process.cwd(), 'python')
    }
    return join(process.resourcesPath, 'python')
  }

  private getServerScript(): string {
    return join(this.getServerCwd(), 'server', 'main.py')
  }

  private async waitForReady(timeout = 60000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        await fetch(`${this.baseUrl}/api/health`)
        console.log('Python backend is ready')
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    console.warn('Python backend did not become ready within timeout, continuing anyway')
  }
}
