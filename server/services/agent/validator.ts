/**
 * Code Safety Validator
 * Validates generated scraper code for dangerous patterns
 */

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// Note: Use 'i' flag only (not 'g') to avoid regex lastIndex issues with .test()
const DANGEROUS_PATTERNS = [
  // Code execution
  { pattern: /\beval\s*\(/i, message: 'eval() is not allowed' },
  { pattern: /new\s+Function\s*\(/i, message: 'Function constructor is not allowed' },
  { pattern: /\bexec\s*\(/i, message: 'exec() is not allowed (use execSync if needed)' },

  // Filesystem operations (we only allow Playwright/Cheerio operations)
  { pattern: /\brequire\s*\(\s*['"]fs['"]\s*\)/i, message: 'Filesystem access not allowed' },
  { pattern: /\bimport\s+.*\s+from\s+['"]fs['"]/i, message: 'Filesystem access not allowed' },
  { pattern: /fs\.(writeFile|readFile|unlink|mkdir|rmdir)/i, message: 'Filesystem operations not allowed' },

  // Process/system access
  { pattern: /process\.(exit|kill|abort)/i, message: 'Process control not allowed' },
  { pattern: /process\.env\s*=/i, message: 'Modifying environment variables not allowed' },
  { pattern: /child_process/i, message: 'Child process spawning not allowed' },

  // Network requests outside of Playwright (but allow fetch inside page.evaluate)
  { pattern: /axios\./i, message: 'Use Playwright page.goto() instead of axios' },
  { pattern: /\brequire\s*\(\s*['"]http[s]?['"]\s*\)/i, message: 'Use Playwright for network requests' },

  // Database operations
  { pattern: /prisma\./i, message: 'Direct database access not allowed in scrapers' },
  { pattern: /\bconnect\s*\(\s*['"]postgres/i, message: 'Database connections not allowed in scrapers' },
]

const WARNING_PATTERNS = [
  { pattern: /console\.log/i, message: 'Consider removing console.log statements for production' },
  { pattern: /debugger/i, message: 'Remove debugger statements before deployment' },
  { pattern: /setTimeout.*9\d{4,}/i, message: 'Very long timeouts detected (> 90 seconds)' },
]

// Imports are optional since we provide them in the sandbox
// const REQUIRED_IMPORTS = [
//   { pattern: /from\s+['"]playwright['"]/, name: 'playwright' },
//   { pattern: /from\s+['"]cheerio['"]/, name: 'cheerio' },
// ]

/**
 * Validate generated scraper code for security and correctness
 */
export function validateScraperCode(code: string, scraperType: 'venue' | 'event'): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for valid JavaScript syntax by attempting to parse it
  try {
    // Use Function constructor to check syntax without executing
    // This catches truncated code, missing brackets, etc.
    new Function(code)
  } catch (syntaxError: any) {
    errors.push(`Syntax error: ${syntaxError.message}`)
    // Return early - no point checking other things if syntax is invalid
    return { isValid: false, errors, warnings }
  }

  // Note: We don't check brace/paren balance here because:
  // 1. new Function() above already catches real syntax errors
  // 2. Naive counting produces false positives from parens in strings/regexes

  // Check for dangerous patterns
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(message)
    }
  }

  // Check for warning patterns
  for (const { pattern, message } of WARNING_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(message)
    }
  }

  // Check for required imports (optional since we provide them in sandbox)
  // Removed - imports are handled by the executor sandbox

  // Check for correct function signature
  if (scraperType === 'venue') {
    if (!code.includes('function scrapeVenueInfo') && !code.includes('const scrapeVenueInfo')) {
      errors.push('Function must be named "scrapeVenueInfo"')
    }
    if (!code.includes('scrapeVenueInfo(url') && !code.includes('scrapeVenueInfo (url')) {
      errors.push('Function must accept "url" parameter')
    }
  } else if (scraperType === 'event') {
    if (!code.includes('function scrapeEvents') && !code.includes('const scrapeEvents')) {
      errors.push('Function must be named "scrapeEvents"')
    }
    if (!code.includes('scrapeEvents(url') && !code.includes('scrapeEvents (url')) {
      errors.push('Function must accept "url" and "timezone" parameters')
    }
    // fromZonedTime should be used for date conversion
    if (!code.includes('fromZonedTime')) {
      warnings.push('Consider using fromZonedTime for timezone conversion')
    }
  }

  // Check for browser cleanup
  if (!code.includes('await browser.close()')) {
    errors.push('Code must close the browser (await browser.close())')
  }

  // Check for try-catch or try-finally
  if (!code.includes('try') || !code.includes('catch')) {
    warnings.push('Consider adding try-catch for error handling')
  }

  // Check for reasonable timeout values
  const timeoutMatches = code.match(/waitForTimeout\((\d+)\)/g)
  if (timeoutMatches) {
    for (const match of timeoutMatches) {
      const timeout = parseInt(match.match(/\d+/)?.[0] || '0')
      if (timeout > 30000) {
        warnings.push(`Long timeout detected: ${timeout}ms. Consider reducing for faster execution.`)
      }
    }
  }

  // Check that code has a return statement
  if (!code.includes('return')) {
    errors.push('Scraper must return data')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Extract function code from markdown or plain text response
 */
export function extractCode(response: string): string {
  // Remove markdown code fences if present
  let code = response.trim()

  // Match ```typescript or ```ts or ``` code blocks
  const codeBlockMatch = code.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)\n```/)
  if (codeBlockMatch?.[1]) {
    code = codeBlockMatch[1]
  }

  // Remove any leading/trailing whitespace
  code = code.trim()

  return code
}
