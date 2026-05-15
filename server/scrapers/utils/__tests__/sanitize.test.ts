import { describe, expect, it } from 'vitest'
import { cleanScrapedDescription, CSS_BLEED_ANCHORS } from '../sanitize'

describe('cleanScrapedDescription', () => {
  it('returns undefined for null/undefined/empty input', () => {
    expect(cleanScrapedDescription(null)).toBeUndefined()
    expect(cleanScrapedDescription(undefined)).toBeUndefined()
    expect(cleanScrapedDescription('')).toBeUndefined()
    expect(cleanScrapedDescription('   ')).toBeUndefined()
  })

  it('preserves short legit text the venue actually wrote (e.g. "TBD")', () => {
    expect(cleanScrapedDescription('TBD')).toBe('TBD')
    expect(cleanScrapedDescription('TBD #block-44ee3e74fd3c157cb5c1 { }')).toBe('TBD')
  })

  it('passes through clean text unchanged', () => {
    const clean = 'Come check out our show! Doors at 7pm, music at 8pm. Tickets $15.'
    expect(cleanScrapedDescription(clean)).toBe(clean)
  })

  it('trims Marigold WonderPlugin CSS bleed at the menu nav boundary', () => {
    const dirty =
      'Come through for a sweet rocking time with Blue Devil Bluez. ' +
      'If you like your blues with a rock edge, this band has it all. ' +
      'Blue Devil Bluez puts it all together into a tasty rocking blues gumbo. ' +
      'Main Theater and Brattleboro Menu Events Bar & Cafe Connect ' +
      '#wonderplugingridgallery-48 .wonderplugin-gridgallery-item-container { text-align: center; } ' +
      '#wonderplugingridgallery-48 .wonderplugin-gridgallery-item-text { color: #fff; }'
    const result = cleanScrapedDescription(dirty)
    expect(result).toBeDefined()
    expect(result).toContain('Blue Devil Bluez puts it all together into a tasty rocking blues gumbo.')
    expect(result).not.toContain('wonderplugin')
    expect(result).not.toContain('Main Theater and Brattleboro')
    expect(result).not.toContain('{')
  })

  it('trims Marigold bleed when legit text ends with emoji-structured info', () => {
    // Real Marigold prod descriptions end with an artist bio whose final
    // sentence terminator (here "!") sits right before the nav-junk + CSS.
    const dirty =
      'Join us for an evening of deadly enchantment. ' +
      '😈Saturday, May 16th 📍84 Cottage St. Easthampton MA 🍷Bar Open 7pm 🎟️$15 18+ ' +
      'HEXXXPLODE will be twisting us upside down with something strange! ' +
      'Main Theater and Brattleboro Menu Events Bar & Cafe Connect ' +
      '#wonderplugingridgallery-48 .x { color: red; }'
    const result = cleanScrapedDescription(dirty)
    expect(result).toBeDefined()
    expect(result).toContain('🎟️$15 18+')
    expect(result).toContain('strange!')
    expect(result).not.toContain('wonderplugin')
    expect(result).not.toContain('Main Theater and Brattleboro')
  })

  it('trims Squarespace sqs-html-content bleed', () => {
    const dirty =
      'Live music at Stella Blues! Doors 8pm. Come hang out. ' +
      '#block-7c5c66f0a92688c9870b { mix-blend-mode: var(--tweak-text-block-blend); ' +
      'border-radius: var(--tweak-text-block-radius); } ' +
      '@media screen and (max-width: 767px) { #block-7c5c66f0a92688c9870b { } }'
    const result = cleanScrapedDescription(dirty)
    expect(result).toBeDefined()
    expect(result).toContain('Live music at Stella Blues! Doors 8pm. Come hang out.')
    expect(result).not.toContain('@media')
    expect(result).not.toContain('var(--tweak-')
    expect(result).not.toContain('#block-')
  })

  it('trims when the only anchor is a var(--tweak- token', () => {
    const dirty =
      'Open mic night, all welcome! Sign up at 7. var(--tweak-text-block-padding): 6%;'
    const result = cleanScrapedDescription(dirty)
    expect(result).toBeDefined()
    expect(result).toContain('Open mic night, all welcome! Sign up at 7.')
    expect(result).not.toContain('var(--tweak-')
  })

  it('returns undefined when nothing legitimate remains after trim', () => {
    const dirty = '#wonderplugin .item { color: red; } @media screen { }'
    expect(cleanScrapedDescription(dirty)).toBeUndefined()
  })

  it('falls back to trimming at the anchor when no sentence terminator is near', () => {
    const legit = 'word '.repeat(120).trim()
    const dirty = `${legit} #wonderplugin .x { }`
    const result = cleanScrapedDescription(dirty)
    expect(result).toBeDefined()
    expect(result).not.toContain('wonderplugin')
    expect(result!.length).toBeGreaterThan(100)
  })

  it('collapses excessive whitespace', () => {
    const dirty = 'Hello   world   with    many    spaces.'
    const result = cleanScrapedDescription(dirty)
    expect(result).toBe('Hello world with many spaces.')
  })

  it('exports the documented anchor list — anchors must be reviewed if this fails', () => {
    const sources = CSS_BLEED_ANCHORS.map((r) => r.source)
    expect(sources).toEqual([
      '@media\\s+screen',
      '@keyframes\\b',
      '#wonderplugin',
      'var\\(--tweak-',
      '#block-(?:[0-9a-f]{8,}|yui_[0-9_]+)',
      '\\.fe-block-[0-9a-f]{8,}',
    ])
  })
})
