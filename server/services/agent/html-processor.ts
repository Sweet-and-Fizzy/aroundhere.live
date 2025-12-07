/**
 * HTML Processing for LLM Prompts
 * Extracts and cleans HTML to fit within context limits while preserving useful content
 */

import sanitizeHtml from 'sanitize-html'
import * as cheerio from 'cheerio'

export interface ProcessedHtml {
  /** Extracted LD+JSON Event data (compact, structured) */
  ldJson: object[]
  /** Stripped HTML content focused on event listings */
  html: string
  /** Original HTML size in bytes */
  originalSize: number
  /** Processed size in bytes */
  processedSize: number
  /** Which selector was used to find content */
  contentSelector: string | null
}

/**
 * Process HTML for inclusion in LLM prompts
 * 1. Extracts LD+JSON events (compact, valuable)
 * 2. Finds the main event content area
 * 3. Strips unnecessary tags/attributes
 * 4. Truncates to fit within limits
 */
export function processHtmlForLlm(
  html: string,
  maxSize = 30000
): ProcessedHtml {
  const $ = cheerio.load(html)
  const originalSize = html.length

  // 1. Extract LD+JSON events (these are compact and valuable)
  const ldJson: object[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      // Only include Event types or arrays that might contain events
      if (data['@type'] === 'Event' || Array.isArray(data)) {
        ldJson.push(data)
      }
    } catch {
      // Ignore parse errors
    }
  })

  // 2. Try to find the main event content area (not the whole page)
  // Priority order: most specific to least specific
  const contentSelectors = [
    // Event-specific selectors
    '.eventlist',           // Squarespace event list
    '.event-list',
    '.events-list',
    '[class*="event-list"]',
    '.events',
    '.event-calendar',
    '[class*="calendar"]',
    // Generic content areas
    'main',
    'article',
    '[role="main"]',
    '#content',
    '.content',
    'body',
  ]

  let contentHtml = html
  let contentSelector: string | null = null

  for (const selector of contentSelectors) {
    const el = $(selector).first()
    if (el.length > 0) {
      const elHtml = el.html()
      // Must have some content (more than 1KB)
      if (elHtml && elHtml.length > 1000) {
        contentHtml = elHtml
        contentSelector = selector
        break
      }
    }
  }

  // 3. Strip HTML using sanitize-html
  let strippedHtml = sanitizeHtml(contentHtml, {
    // Allow structural tags that help identify content
    allowedTags: [
      // Structure
      'div', 'span', 'section', 'article', 'main', 'aside',
      // Text
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br',
      // Lists
      'ul', 'ol', 'li',
      // Links and media
      'a', 'img',
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      // Time/date (important for events)
      'time',
    ],
    // Keep attributes useful for selectors
    allowedAttributes: {
      '*': ['class', 'id'],
      'a': ['href'],
      'img': ['src', 'alt'],
      'time': ['datetime'],
    },
    // No inline styles
    allowedStyles: {},
    // Completely remove these tags and their content
    exclusiveFilter: (frame: { tag: string }) => {
      return ['script', 'style', 'svg', 'noscript', 'nav', 'footer', 'header', 'iframe', 'form', 'input', 'button'].includes(frame.tag)
    },
  })

  // 4. Additional cleanup
  strippedHtml = strippedHtml
    // Remove data attributes
    .replace(/\s+data-[a-z0-9-]+="[^"]*"/gi, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Clean up empty tags
    .replace(/<(\w+)(\s[^>]*)?>(\s*)<\/\1>/g, '')
    .trim()

  // 5. Truncate HTML if needed (LD+JSON gets priority)
  const ldJsonSize = JSON.stringify(ldJson).length
  const availableForHtml = Math.max(0, maxSize - ldJsonSize)

  if (strippedHtml.length > availableForHtml) {
    strippedHtml = strippedHtml.substring(0, availableForHtml) + '\n[HTML truncated...]'
  }

  return {
    ldJson,
    html: strippedHtml,
    originalSize,
    processedSize: ldJsonSize + strippedHtml.length,
    contentSelector,
  }
}

/**
 * Format processed HTML for inclusion in an LLM prompt
 */
export function formatHtmlForPrompt(processed: ProcessedHtml): string {
  let prompt = ''

  // Include LD+JSON if present (compact structured data)
  if (processed.ldJson.length > 0) {
    prompt += `## Structured Data (LD+JSON)\n`
    prompt += `Found ${processed.ldJson.length} events in structured data:\n\n`
    prompt += '```json\n'
    prompt += JSON.stringify(processed.ldJson, null, 2)
    prompt += '\n```\n\n'
  }

  // Include HTML
  if (processed.contentSelector) {
    prompt += `## HTML Content (from ${processed.contentSelector})\n\n`
  } else {
    prompt += `## HTML Content\n\n`
  }
  prompt += processed.html
  prompt += '\n'

  return prompt
}
