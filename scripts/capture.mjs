import { mkdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const urlValue = process.env.CAPTURE_URL
const outputValue = process.env.CAPTURE_DIR
if (!urlValue || !outputValue) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')

let target
try {
  target = new URL(urlValue)
} catch {
  throw new Error('CAPTURE_URL must be an absolute HTTP or HTTPS URL.')
}
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('CAPTURE_URL must use HTTP or HTTPS.')
}

const outputDir = resolve(outputValue)
const projectRelativeOutput = relative(projectDir, outputDir)
if (!isAbsolute(outputValue) || projectRelativeOutput === '' || (projectRelativeOutput !== '..' && !projectRelativeOutput.startsWith(`..${sep}`))) {
  throw new Error('CAPTURE_DIR must be absolute and outside the project directory.')
}
await mkdir(outputDir, { recursive: true })

const runtime = join(process.env.HOME || '/home/runner', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(await readFile(
  join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') {
  process.env.DISPLAY ||= `:${(await readFile(join(runtime, 'display'), 'utf8')).trim()}`
}

const transient = error => {
  const message = String(error?.message || error)
  return error?.name === 'TimeoutError' || /ERR_(?:NAME_NOT_RESOLVED|CONNECTION|NETWORK|INTERNET|TIMED_OUT)|browser has been closed|target closed|browser disconnected/i.test(message)
}
const browserUnavailable = error => /browser has been closed|target closed|browser disconnected|browser process/i.test(String(error?.message || error))
let browser
let exitCode = 0
try {
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })
  } catch (error) {
    console.error(`Browser launch failed: ${error.message}`)
    process.exitCode = 75
    throw error
  }

  const origin = target.origin
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page
    try {
      page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    } catch (error) {
      console.error(`Could not create ${name} page: ${error.message}`)
      process.exitCode = 75
      throw error
    }

    const defects = []
    page.on('pageerror', error => defects.push(`JavaScript error: ${error.message}`))
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === origin) {
        defects.push(`HTTP ${response.status()} for ${response.url()}`)
      }
    })

    let response
    try {
      response = await page.goto(target.href, { waitUntil: 'load', timeout: 45000 })
    } catch (error) {
      console.error(`Navigation failed for ${name}: ${error.message}`)
      if (transient(error)) process.exitCode = 75
      else process.exitCode ||= 1
      throw error
    }
    if (!response) {
      console.error(`No main-document response for ${name}.`)
      process.exitCode = 75
      throw new Error('Navigation returned no response.')
    }
    if (!response.ok()) {
      const status = response.status()
      console.error(`Preview returned HTTP ${status} for ${name}.`)
      process.exitCode = [408, 425, 429, 500, 502, 503, 504].includes(status) ? 75 : 1
      throw new Error(`Preview returned HTTP ${status}.`)
    }

    try {
      await page.locator('body').waitFor({ state: 'visible', timeout: 15000 })
      await page.locator('.shell').waitFor({ state: 'visible', timeout: 15000 })
      const rendered = await page.evaluate(() => ({
        title: document.title,
        textLength: document.body.innerText.trim().length,
        width: document.documentElement.scrollWidth,
      }))
      if (!rendered.title.includes('Blocksmith') || rendered.textLength < 40 || rendered.width < 100) {
        throw new Error(`Page rendered unexpectedly: ${JSON.stringify(rendered)}`)
      }
      await page.waitForTimeout(1000)
      if (defects.length) throw new Error(defects.join('; '))
      const file = join(outputDir, `final-${name}.png`)
      try {
        await page.screenshot({ path: file, fullPage: false, timeout: 30000 })
      } catch (error) {
        console.error(`${name} screenshot failed: ${error.message}`)
        process.exitCode ||= transient(error) ? 75 : 1
        throw error
      }
      if ((await stat(file)).size === 0) throw new Error(`Screenshot is empty: ${file}`)
      console.log(`Captured ${name} (${width}x${height}) to ${file}`)
    } catch (error) {
      console.error(`${name} capture/rendering defect: ${error.message}`)
      process.exitCode ||= browserUnavailable(error) ? 75 : 1
      throw error
    } finally {
      await page.close().catch(error => {
        console.error(`Could not close ${name} page: ${error.message}`)
        process.exitCode ||= 75
      })
    }
  }
} catch (error) {
  if (!process.exitCode) process.exitCode = transient(error) ? 75 : 1
} finally {
  if (browser) {
    await browser.close().catch(error => {
      console.error(`Could not close capture browser: ${error.message}`)
      process.exitCode ||= 75
    })
  }
}
