/**
 * HTML and text processing utilities
 * Consolidated from save-events.ts and dedup.ts
 */

/**
 * Check if text contains HTML tags
 */
export function containsHtml(text: string): boolean {
  return /<[^>]+>/.test(text)
}

/**
 * Decode common HTML entities including numeric entities (&#038;, &#x26;, etc.)
 */
export function decodeHtmlEntities(text: string): string {
  return text
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    // Numeric decimal entities (&#038; -> &)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Numeric hex entities (&#x26; -> &)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

/**
 * Strip HTML tags from text
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

/**
 * Strip HTML tags and decode entities, clean up whitespace
 * Use for plain text fields like description
 */
export function stripHtmlAndClean(text: string): string {
  return decodeHtmlEntities(stripHtmlTags(text))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize text for comparison (lowercase, remove punctuation, normalize whitespace)
 * Use for fuzzy matching and deduplication
 */
export function normalizeForComparison(text: string): string {
  return decodeHtmlEntities(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sanitize HTML by removing potentially problematic elements
 * - Remove iframes that could embed our own site (infinite loop)
 * - Remove script tags
 * - Remove event handlers
 */
export function sanitizeHtml(html: string, ownDomain?: string): string {
  let sanitized = html
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onerror, etc.)
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')

  // Remove iframes that reference our own domain to prevent infinite embedding
  if (ownDomain) {
    const domainPattern = new RegExp(
      `<iframe[^>]*\\ssrc=["'][^"']*${ownDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["'][^>]*>.*?</iframe>`,
      'gi'
    )
    sanitized = sanitized.replace(domainPattern, '')
    // Also handle self-closing iframes
    const selfClosingPattern = new RegExp(
      `<iframe[^>]*\\ssrc=["'][^"']*${ownDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["'][^>]*/?>`,
      'gi'
    )
    sanitized = sanitized.replace(selfClosingPattern, '')
  }

  return sanitized
}

/**
 * Process description - if it contains HTML, preserve it in descriptionHtml
 * and create a clean plain text version for description.
 */
export function processDescriptions(
  description?: string | null,
  ownDomain?: string
): { description: string | null; descriptionHtml: string | null } {
  if (!description) {
    return { description: null, descriptionHtml: null }
  }

  const cleanDescription = stripHtmlAndClean(description)

  // If description contains HTML, preserve it as descriptionHtml (sanitized)
  if (containsHtml(description)) {
    return {
      description: cleanDescription,
      descriptionHtml: sanitizeHtml(description, ownDomain),
    }
  }

  // Plain text description, no HTML
  return {
    description: cleanDescription,
    descriptionHtml: null,
  }
}

/**
 * Clean event titles by removing date prefixes and time suffixes
 * This is applied when saving events to ensure consistent, clean titles in the database
 */
export function cleanEventTitle(title: string): string {
  const cleaned = title
    // Remove generic category prefixes like "Live music: " or "Live Music - "
    .replace(/^(?:live\s+music|music|comedy|theater|performance|show)\s*[:\-–—]\s*/i, '')
    // Remove date prefixes like "Saturday December 20th - " or "Friday, January 3rd - "
    .replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*[-–—]\s*/i, '')
    // Remove time ranges like "7-10", "7-8:30", "8:30-11pm", "7pm-10pm"
    .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
    // Remove standalone times like "7pm", "8:30pm"
    .replace(/,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
    // Remove parenthetical notes about times like "(Sign-Up @ 6)"
    .replace(/\s*\([^)]*(?:sign[- ]?up|doors|@|\d{1,2}(?::\d{2})?(?:am|pm)?)[^)]*\)/gi, '')
    // Clean up trailing punctuation and whitespace
    .replace(/[,\s]+$/, '')
    .trim()

  // Only return cleaned version if it's not empty
  return cleaned.length > 0 ? cleaned : title
}

/**
 * Generate URL-safe slug from text
 */
export function generateSlug(text: string, date?: Date): string {
  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  if (date) {
    const dateStr = date.toISOString().split('T')[0]
    slug = `${slug}-${dateStr}`
  }

  return slug
}
