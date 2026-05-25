/**
 * End-to-end Electron test for Stable Audio Studio.
 *
 * Launches the REAL Electron app with the REAL model — no mocks.
 * Requires:
 *   - `npm run build` (electron-vite build) to have been run
 *   - Python venv set up with model cached
 *   - GPU with CUDA
 *
 * Run: npx playwright test tests/electron.e2e.ts
 */

import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Build the app first
  const { execSync } = await import('child_process')
  execSync('npx electron-vite build', {
    cwd: resolve(__dirname, '..'),
    stdio: 'pipe',
    timeout: 60_000,
  })

  // Launch Electron pointed at the built output
  app = await electron.launch({
    args: [resolve(__dirname, '..', 'out', 'main', 'index.js')],
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 120_000,
  })

  page = await app.firstWindow()
  // Wait for the renderer to finish loading
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  if (app) await app.close()
})

test('window.api is defined in preload', async () => {
  const apiExists = await page.evaluate(() => typeof (window as any).api)
  expect(apiExists).toBe('object')
})

test('window.api.generateAudio is a function', async () => {
  const fnType = await page.evaluate(() => typeof (window as any).api.generateAudio)
  expect(fnType).toBe('function')
})

test('window.api has all expected methods', async () => {
  const methods = await page.evaluate(() => Object.keys((window as any).api))
  expect(methods).toContain('generateAudio')
  expect(methods).toContain('getModelStatus')
  expect(methods).toContain('loadModel')
  expect(methods).toContain('librarySave')
  expect(methods).toContain('libraryList')
  expect(methods).toContain('libraryDelete')
  expect(methods).toContain('exportAudio')
  expect(methods).toContain('audioProcess')
  expect(methods).toContain('getGenerationProgress')
})

test('health check via IPC → Python backend', async () => {
  // The Python backend should be started by the Electron main process.
  // Give it time to start up (waitForReady in python-bridge.ts waits up to 60s).
  const status = await page.evaluate(async () => {
    return await (window as any).api.getModelStatus()
  })
  expect(status).toHaveProperty('device')
  expect(status).toHaveProperty('loaded')
  expect(status).toHaveProperty('model_name')
})

test('load model via IPC', async () => {
  const result = await page.evaluate(async () => {
    return await (window as any).api.loadModel()
  })
  expect(result.loaded).toBe(true)
  expect(['cuda', 'mps', 'cpu']).toContain(result.device)
})

test('generate real audio via IPC (full pipeline)', async () => {
  const result = await page.evaluate(async () => {
    return await (window as any).api.generateAudio({
      prompt: 'a short click sound',
      duration: 2,
      steps: 15,
      cfgScale: 5,
      seed: 42,
    })
  })

  expect(result).toHaveProperty('audio_base64')
  expect(result).toHaveProperty('sample_rate')
  expect(result).toHaveProperty('duration')
  expect(result.sample_rate).toBe(44100)
  expect(result.duration).toBeGreaterThan(0)
  expect(result.audio_base64.length).toBeGreaterThan(1000)

  // Verify it's a valid base64-encoded WAV
  const headerCheck = await page.evaluate((b64: string) => {
    const binary = atob(b64.substring(0, 20))
    return binary.substring(0, 4) + '|' + binary.substring(8, 12)
  }, result.audio_base64)
  expect(headerCheck).toBe('RIFF|WAVE')
})

test('save to library and list', async () => {
  // First generate
  const genResult = await page.evaluate(async () => {
    return await (window as any).api.generateAudio({
      prompt: 'test library item',
      duration: 2,
      steps: 10,
      cfgScale: 5,
      seed: 123,
    })
  })

  // Save to library
  const saveResult = await page.evaluate(async (audio: any) => {
    return await (window as any).api.librarySave({
      title: 'E2E Test Audio',
      prompt: 'test library item',
      audioBase64: audio.audio_base64,
      sampleRate: audio.sample_rate,
      duration: audio.duration,
      tags: ['e2e-test'],
    })
  }, genResult)

  expect(saveResult).toHaveProperty('id')

  // List library
  const items = await page.evaluate(async () => {
    return await (window as any).api.libraryList()
  })

  expect(items.length).toBeGreaterThanOrEqual(1)
  const found = items.find((i: any) => i.id === saveResult.id)
  expect(found).toBeTruthy()
  expect(found.title).toBe('E2E Test Audio')

  // Clean up
  await page.evaluate(async (id: string) => {
    return await (window as any).api.libraryDelete(id)
  }, saveResult.id)
})

test('audio processing via IPC', async () => {
  const genResult = await page.evaluate(async () => {
    return await (window as any).api.generateAudio({
      prompt: 'audio process test',
      duration: 2,
      steps: 10,
      cfgScale: 5,
      seed: 55,
    })
  })

  // Trim to 1 second
  const trimResult = await page.evaluate(async (audio: any) => {
    return await (window as any).api.audioProcess({
      audioBase64: audio.audio_base64,
      operations: [{ type: 'trim', params: { start: 0, end: 1.0 } }],
      sampleRate: 44100,
    })
  }, genResult)

  expect(trimResult).toHaveProperty('audio_base64')
  expect(trimResult.duration).toBeGreaterThan(0.9)
  expect(trimResult.duration).toBeLessThan(1.1)
})

test('UI renders generator view', async () => {
  // Check the main heading exists
  const heading = await page.textContent('h1')
  expect(heading).toBe('Audio Generator')

  // Check prompt textarea exists
  const textarea = await page.locator('textarea').first()
  expect(await textarea.isVisible()).toBe(true)

  // Check Generate button exists (look for the primary action button specifically)
  const genBtn = await page.locator('button:has-text("Generate")').first()
  expect(await genBtn.isVisible()).toBe(true)
})
