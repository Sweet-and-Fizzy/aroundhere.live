/**
 * Strips trailing CSS/style/form-widget bleed from scraped event descriptions.
 *
 * Some venue sites (Marigold WordPress + WonderPlugin, Squarespace venues like
 * Stella Blues / Incandescent / New City / Abandoned Building) leak inline CSS
 * rules into the text we extract. The junk always trails the legitimate
 * description and is anchored by a small set of recognizable markers. We find
 * the earliest anchor, walk back to the nearest sentence terminator within
 * 500 chars, and trim there. If no clean terminator is in range, we trim at
 * the anchor itself.
 */

// CSS-only patterns: each appears in inline <style> blocks but not in
// legitimate HTML content. (Squarespace uses `sqs-html-content` as a div
// class on real content, so it isn't safe to anchor on.)
export const CSS_BLEED_ANCHORS: RegExp[] = [
  /@media\s+screen/i,
  /@keyframes\b/i,
  /#wonderplugin/i,
  /var\(--tweak-/i,
  // Squarespace block IDs come in two flavors: hex hashes (#block-7c5c66...) and
  // YUI-generated IDs (#block-yui_3_17_2_1_<numbers>_<numbers>). Match both.
  /#block-(?:[0-9a-f]{8,}|yui_[0-9_]+)/i,
  /\.fe-block-[0-9a-f]{8,}/i,
]

const SENTENCE_TERMINATORS = /[.!?…]\s|\n\n/g
const TRIM_LOOKBACK_CHARS = 500
// We only discard the field when *nothing* legit remains. Even a 1-character
// result (e.g. an acronym the venue wrote) is preserved — that's their text.
const MIN_RESULT_LENGTH = 1

// Common abbreviations whose trailing period is NOT a sentence end.
// 1-2-letter uppercase tokens (St, MA, NY, etc.) plus a small explicit list.
const ABBREV_PATTERN =
  /\b(?:[A-Z]{1,2}|St|Dr|Mr|Mrs|Ms|Jr|Sr|Ave|Blvd|Rd|Apt|Dept|vs|etc)\.$/

function isSentenceEnd(text: string, matchIndex: number): boolean {
  if (text[matchIndex] !== '.') return true
  return !ABBREV_PATTERN.test(text.slice(0, matchIndex + 1))
}

export function cleanScrapedDescription(
  text: string | null | undefined
): string | undefined {
  if (!text) return undefined
  const trimmedInput = text.trim()
  if (trimmedInput.length < MIN_RESULT_LENGTH) return undefined

  let earliestAnchor = -1
  for (const anchor of CSS_BLEED_ANCHORS) {
    const match = trimmedInput.match(anchor)
    if (match && match.index !== undefined) {
      if (earliestAnchor === -1 || match.index < earliestAnchor) {
        earliestAnchor = match.index
      }
    }
  }

  let cleaned: string
  if (earliestAnchor === -1) {
    cleaned = trimmedInput
  } else {
    const windowStart = Math.max(0, earliestAnchor - TRIM_LOOKBACK_CHARS)
    const lookback = trimmedInput.slice(windowStart, earliestAnchor)
    let cutPoint = -1
    SENTENCE_TERMINATORS.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SENTENCE_TERMINATORS.exec(lookback)) !== null) {
      const absIndex = windowStart + m.index
      if (isSentenceEnd(trimmedInput, absIndex)) {
        cutPoint = absIndex + m[0].length
      }
    }
    if (cutPoint > 0) {
      cleaned = trimmedInput.slice(0, cutPoint).trim()
    } else {
      cleaned = trimmedInput.slice(0, earliestAnchor).trim()
    }
  }

  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim()

  if (cleaned.length < MIN_RESULT_LENGTH) return undefined
  return cleaned
}
