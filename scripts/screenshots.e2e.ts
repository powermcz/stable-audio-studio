/**
 * Capture screenshots of each view for the README.
 * Run: npx playwright test scripts/screenshots.e2e.ts
 */
import { test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'
import { execSync } from 'child_process'

const SCREENSHOT_DIR = resolve(__dirname, '..', 'assets', 'screenshots')

test('capture all screenshots', async () => {
  // Build first
  execSync('npx electron-vite build', { cwd: resolve(__dirname, '..'), stdio: 'pipe', timeout: 60_000 })

  const app = await electron.launch({
    args: [resolve(__dirname, '..', 'out', 'main', 'index.js')],
    cwd: resolve(__dirname, '..'),
    timeout: 120_000,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Wait for the UI to render
  await page.waitForTimeout(3000)

  // Generator view (default)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/generator.png`, type: 'png' })

  // Library view
  await page.click('button:has-text("Library")')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/library.png`, type: 'png' })

  // Editor view
  await page.click('button:has-text("Editor")')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/editor.png`, type: 'png' })

  // Settings view
  await page.click('button:has-text("Settings")')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings.png`, type: 'png' })

  await app.close()
  console.log(`Screenshots saved to ${SCREENSHOT_DIR}`)
})
