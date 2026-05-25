/**
 * Capture screenshots with real content for the README.
 *
 * This script:
 * 1. Launches the full Electron app (builds first)
 * 2. Generates a real audio sample via the API
 * 3. Screenshots the generator with the sample visible
 * 4. Navigates to library (auto-saved sample should appear)
 * 5. Opens the editor with the sample loaded
 * 6. Screenshots settings
 *
 * Run: Copy to tests/ then: npx playwright test tests/screenshots.e2e.ts --timeout 600000
 */
import { test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'
import { execSync } from 'child_process'

const SCREENSHOT_DIR = resolve(__dirname, '..', 'assets', 'screenshots')
const ROOT = resolve(__dirname, '..')

test('capture all screenshots with content', async () => {
  // Build
  execSync('npx electron-vite build', { cwd: ROOT, stdio: 'pipe', timeout: 60_000 })

  const app = await electron.launch({
    args: [resolve(ROOT, 'out', 'main', 'index.js')],
    cwd: ROOT,
    timeout: 180_000,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)

  // --- Generator: type a prompt, generate audio ---
  // Fill prompt
  const promptBox = page.locator('textarea').first()
  await promptBox.fill('128 BPM tech house drum loop, punchy kick, crispy hi-hats')
  await page.waitForTimeout(500)

  // Click Generate and wait for it to finish
  const genBtn = page.locator('button:has-text("Generate")').first()
  await genBtn.click()

  // Wait for generation to complete — look for the sample card to appear
  // (the waveform-container class appears when audio is loaded)
  await page.waitForSelector('.waveform-container', { timeout: 300_000 })
  await page.waitForTimeout(3000) // let waveform render

  // Screenshot generator with sample
  await page.screenshot({ path: `${SCREENSHOT_DIR}/generator.png`, type: 'png' })

  // --- Library: should have the auto-saved sample ---
  await page.click('button:has-text("Library")')
  await page.waitForTimeout(2000)

  // Expand the first item to show inline waveform
  const expandBtn = page.locator('button:has-text("▶")').first()
  if (await expandBtn.isVisible()) {
    await expandBtn.click()
    await page.waitForTimeout(2000)
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/library.png`, type: 'png' })

  // --- Editor: load the sample into editor ---
  // Click the Edit button on the library item
  const editBtn = page.locator('button[title="Open in editor"]').first()
  if (await editBtn.isVisible()) {
    await editBtn.click()
    await page.waitForTimeout(3000)
  } else {
    // Navigate to editor directly
    await page.click('button:has-text("Editor")')
    await page.waitForTimeout(2000)
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/editor.png`, type: 'png' })

  // --- Settings ---
  await page.click('button:has-text("Settings")')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings.png`, type: 'png' })

  await app.close()
  console.log(`Screenshots saved to ${SCREENSHOT_DIR}`)
})
