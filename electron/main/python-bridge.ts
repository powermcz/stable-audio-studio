import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app, dialog, BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'

const PYTHON_PORT = 8765
const PYTHON_HOST = '127.0.0.1'

export class PythonBridge {
  private process: ChildProcess | null = null
  private baseUrl: string

  constructor() {
    this.baseUrl = `http://${PYTHON_HOST}:${PYTHON_PORT}`
  }

  /** Create a styled progress window for setup steps */
  private createProgressWindow(): { win: BrowserWindow; update: (step: string, detail: string, pct: number) => void } {
    const win = new BrowserWindow({
      width: 600,
      height: 360,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      frame: true,
      autoHideMenuBar: true,
      title: 'Setting up Stable Audio Studio...',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    const update = (step: string, detail: string, pct: number) => {
      const html = `<!DOCTYPE html><html><head><style>
        body { font-family: 'Segoe UI', sans-serif; background: #1c1612; color: #f3f4f6;
               display: flex; flex-direction: column; justify-content: center; align-items: center;
               height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
        h2 { color: #f97316; margin: 0 0 8px; font-size: 18px; }
        p { color: #9ca3af; margin: 0 0 24px; font-size: 13px; text-align: center; max-width: 500px; }
        .bar-bg { width: 100%; max-width: 480px; height: 8px; background: #292018; border-radius: 4px; overflow: hidden; }
        .bar { height: 100%; background: #f97316; border-radius: 4px; transition: width 0.5s; width: ${pct}%; }
        .pct { color: #f97316; font-size: 14px; margin-top: 12px; font-weight: 600; }
        .hint { color: #6b7280; font-size: 11px; margin-top: 20px; }
      </style></head><body>
        <h2>${step}</h2>
        <p>${detail}</p>
        <div class="bar-bg"><div class="bar"></div></div>
        <div class="pct">${pct}%</div>
        <div class="hint">This is a one-time setup. Please don't close this window.</div>
      </body></html>`
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }

    return { win, update }
  }

  /** Check if the Python venv is set up; if not, guide the user */
  async ensureSetup(): Promise<boolean> {
    const pythonPath = this.getPythonPath()
    if (existsSync(pythonPath)) return true

    const serverCwd = this.getServerCwd()
    const reqFile = join(serverCwd, 'requirements.txt')

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Python Setup Required',
      message: 'Stable Audio Studio needs a Python environment to run the AI model.\n\n' +
        'This is a one-time setup that installs PyTorch and dependencies (~5 GB).\n\n' +
        'Requirements:\n' +
        '\u2022 Python 3.10\u20133.12 installed and on PATH\n' +
        '\u2022 NVIDIA GPU with CUDA 12.1+ drivers (recommended)\n' +
        '\u2022 Internet connection for downloading packages',
      buttons: ['Set Up Now', 'Cancel'],
      defaultId: 0,
    })

    if (response !== 0) return false

    const { win: progressWin, update: updateProgress } = this.createProgressWindow()

    try {
      // Step 1: Create venv
      updateProgress('Creating Python environment...', 'Setting up virtual environment', 5)
      await this.runCommand('python -m venv venv', serverCwd)

      // Step 2: Upgrade pip (use python -m pip so pip.exe isn't locked)
      updateProgress('Upgrading pip...', 'Preparing package manager', 10)
      await this.runCommand(`"${pythonPath}" -m pip install --upgrade pip`, serverCwd)

      // Step 3: Install PyTorch (the big one)
      updateProgress('Installing PyTorch + CUDA...', 'Downloading ~2.5 GB. This takes a few minutes.', 15)
      await this.runCommand(
        `"${pythonPath}" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121`,
        serverCwd
      )

      // Step 4: Install remaining deps
      updateProgress('Installing dependencies...', 'diffusers, transformers, FastAPI, soundfile, librosa...', 75)
      await this.runCommand(`"${pythonPath}" -m pip install -r "${reqFile}"`, serverCwd)

      // Step 5: Check HuggingFace login
      updateProgress('Checking HuggingFace...', 'Verifying authentication for model access', 90)
      let hfLoggedIn = false
      try {
        await this.runCommand(
          `"${pythonPath}" -c "from huggingface_hub import HfApi; api = HfApi(); api.whoami(); print('OK')"`,
          serverCwd
        )
        hfLoggedIn = true
      } catch {
        hfLoggedIn = false
      }

      progressWin.close()

      if (!hfLoggedIn) {
        // Guide user through HF login
        const { response: loginChoice } = await dialog.showMessageBox({
          type: 'info',
          title: 'HuggingFace Login Required',
          message: 'Python environment installed successfully!\n\n' +
            'To download the AI model, you need a HuggingFace account.\n\n' +
            'What to do:\n' +
            '1. Create a free account at huggingface.co (if you don\'t have one)\n' +
            '2. Create an access token at huggingface.co/settings/tokens\n' +
            '3. Accept the model license (we\'ll open the page for you)\n\n' +
            'The app will start, and the Generator tab will guide you through ' +
            'the remaining steps with a setup checklist.',
          buttons: ['Open HuggingFace (Browser)', 'Continue Without Login'],
          defaultId: 0,
        })

        if (loginChoice === 0) {
          shell.openExternal('https://huggingface.co/stabilityai/stable-audio-open-1.0')
        }
      } else {
        // Check model license access
        let hasAccess = false
        try {
          await this.runCommand(
            `"${pythonPath}" -c "from huggingface_hub import HfApi; api = HfApi(); api.model_info('stabilityai/stable-audio-open-1.0'); print('OK')"`,
            serverCwd
          )
          hasAccess = true
        } catch {
          hasAccess = false
        }

        if (!hasAccess) {
          const { response: licenseChoice } = await dialog.showMessageBox({
            type: 'info',
            title: 'Model License Required',
            message: 'You\'re logged in to HuggingFace, but you need to accept the model license.\n\n' +
              'Click "Accept License" to open the model page in your browser, then click the ' +
              '"Agree and access repository" button on that page.',
            buttons: ['Accept License (Browser)', 'Continue'],
            defaultId: 0,
          })

          if (licenseChoice === 0) {
            shell.openExternal('https://huggingface.co/stabilityai/stable-audio-open-1.0')
          }
        } else {
          await dialog.showMessageBox({
            type: 'info',
            title: 'Setup Complete',
            message: 'Everything is ready!\n\n' +
              'The AI model (~5 GB) will download on your first generation.\n' +
              'This download only happens once.',
          })
        }
      }

      return true
    } catch (err) {
      progressWin.close()
      await dialog.showMessageBox({
        type: 'error',
        title: 'Setup Failed',
        message: `Python setup failed:\n\n${err}\n\nPlease set up manually. See the README for instructions.`,
      })
      return false
    }
  }

  /** Run a shell command asynchronously (non-blocking, no blank console window) */
  private runCommand(cmd: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true  // prevents blank console window
      })

      let stderr = ''
      child.stderr?.on('data', (d) => { stderr += d.toString() })
      child.stdout?.on('data', (d) => { console.log(`[Setup] ${d.toString().trim()}`) })

      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Command failed (exit ${code}): ${cmd}\n${stderr.slice(-500)}`))
      })

      child.on('error', (err) => reject(err))
    })
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
    // In production: try extraResources path first, fall back to source tree
    const prodPath = join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe')
    if (existsSync(prodPath)) return prodPath
    // Fallback for running built output from source tree (e.g. Playwright tests)
    const devPath = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
    if (existsSync(devPath)) return devPath
    return prodPath // will trigger setup dialog
  }

  private getServerCwd(): string {
    if (is.dev) {
      return join(process.cwd(), 'python')
    }
    const prodPath = join(process.resourcesPath, 'python')
    if (existsSync(join(prodPath, 'server'))) return prodPath
    const devPath = join(process.cwd(), 'python')
    if (existsSync(join(devPath, 'server'))) return devPath
    return prodPath
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
