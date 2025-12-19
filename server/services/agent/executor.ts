/**
 * Code Executor
 * Safely executes generated scraper code in a sandbox
 */

import { chromium } from 'playwright'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'
import vm from 'vm'

export interface ExecutionResult {
  success: boolean
  data?: unknown
  error?: string
  executionTime: number
}

/**
 * Execute generated scraper code safely
 * Uses Node.js VM to isolate code execution
 */
export async function executeScraperCode(
  code: string,
  url: string,
  timezone: string = 'America/New_York',
  timeoutMs: number = 30000
): Promise<ExecutionResult> {
  const startTime = Date.now()

  try {
    console.log('[EXECUTOR] Starting execution for URL:', url)

    // Create sandbox context with only allowed modules
    const sandbox = {
      chromium,
      cheerio,
      fromZonedTime,
      console: {
        log: (...args: unknown[]) => {
          console.log('[SCRAPER]', ...args)
        },
        error: (...args: unknown[]) => {
          console.error('[SCRAPER]', ...args)
        },
      },
      // Required for async/await
      Promise,
      Date,
      String,
      Number,
      Array,
      Object,
      JSON,
      Math,
      parseInt,
      parseFloat,
      isNaN,
      // Common globals that LLMs often use
      URL,
      URLSearchParams,
      RegExp,
      Error,
      Map,
      Set,
      fetch,
      Buffer,
      // Exports object to capture the function
      exports: {},
      module: { exports: {} },
    }

    // Transform ES6 imports and exports to CommonJS-compatible code
    let transformedCode = code
      // Remove all import statements
      .replace(/import\s+.*?\s+from\s+['"][^'"]+['"]\s*;?/gi, '')
      // Remove export keyword from function declarations
      .replace(/export\s+async\s+function/gi, 'async function')
      .replace(/export\s+function/gi, 'function')
      // Remove standalone export statements
      .replace(/export\s*{\s*[^}]+\s*}\s*;?/gi, '')
      // Remove TypeScript type annotations that might cause issues
      .replace(/:\s*string\b/gi, '')
      .replace(/:\s*number\b/gi, '')
      .replace(/:\s*boolean\b/gi, '')
      .replace(/:\s*Date\b/gi, '')
      .replace(/:\s*any\b/gi, '')
      .replace(/:\s*void\b/gi, '')

    // Wrap code to export the function
    const wrappedCode = `
      (function() {
        ${transformedCode}

        // Export the function based on type
        if (typeof scrapeVenueInfo !== 'undefined') {
          this.module.exports = { scrapeVenueInfo };
        } else if (typeof scrapeEvents !== 'undefined') {
          this.module.exports = { scrapeEvents };
        }
      }).call(this);
    `

    // Create script
    const script = new vm.Script(wrappedCode, {
      filename: 'generated-scraper.js',
    })

    // Run script in sandbox
    script.runInNewContext(sandbox, {
      timeout: timeoutMs,
      breakOnSigint: true,
    })

    // Get exported function
    const exported = sandbox.module.exports as Record<string, unknown>

    let result: unknown

    // Execute the appropriate function
    if (exported.scrapeVenueInfo && typeof exported.scrapeVenueInfo === 'function') {
      result = await Promise.race([
        (exported.scrapeVenueInfo as (url: string) => Promise<unknown>)(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
        ),
      ])
    } else if (exported.scrapeEvents && typeof exported.scrapeEvents === 'function') {
      result = await Promise.race([
        (exported.scrapeEvents as (url: string, timezone: string) => Promise<unknown>)(url, timezone),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
        ),
      ])
    } else {
      throw new Error('No scrapeVenueInfo or scrapeEvents function found in code')
    }

    const executionTime = Date.now() - startTime

    console.log('[EXECUTOR] Execution succeeded in', executionTime, 'ms')
    console.log('[EXECUTOR] Result preview:', JSON.stringify(result)?.substring(0, 500))

    return {
      success: true,
      data: result,
      executionTime,
    }
  } catch (error) {
    const executionTime = Date.now() - startTime

    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[EXECUTOR] Execution failed:', errorMessage)
    if (errorStack) {
      console.error('[EXECUTOR] Stack:', errorStack)
    }

    return {
      success: false,
      error: errorMessage,
      executionTime,
    }
  }
}

/**
 * Fetch page HTML for analysis (before executing scraper)
 * This helps the LLM generate better code by seeing the actual HTML structure
 */
export async function fetchPageHtml(url: string, timeoutMs: number = 15000): Promise<string | null> {
  let browser = null
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // Set reasonable timeout
    page.setDefaultTimeout(timeoutMs)

    // Navigate and wait for content - use domcontentloaded instead of networkidle
    // networkidle can timeout on sites with continuous analytics/tracking
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.waitForTimeout(3000) // Wait longer for dynamic content to load

    const html = await page.content()

    await browser.close()

    return html
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {})
    }
    console.error('Error fetching page HTML:', error)
    return null
  }
}
