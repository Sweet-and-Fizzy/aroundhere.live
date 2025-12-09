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
 * Process description - if it contains HTML, preserve it in descriptionHtml
 * and create a clean plain text version for description.
 */
export function processDescriptions(
  description?: string | null
): { description: string | null; descriptionHtml: string | null } {
  if (!description) {
    return { description: null, descriptionHtml: null }
  }

  const cleanDescription = stripHtmlAndClean(description)

  // If description contains HTML, preserve it as descriptionHtml
  if (containsHtml(description)) {
    return {
      description: cleanDescription,
      descriptionHtml: description,
    }
  }

  // Plain text description, no HTML
  return {
    description: cleanDescription,
    descriptionHtml: null,
  }
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
