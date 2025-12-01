/**
 * HTML and text processing utilities (client-side)
 * Mirrors server/utils/html.ts for consistent behavior
 */

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
 */
export function stripHtmlAndClean(text: string): string {
  return decodeHtmlEntities(stripHtmlTags(text))
    .replace(/\s+/g, ' ')
    .trim()
}
