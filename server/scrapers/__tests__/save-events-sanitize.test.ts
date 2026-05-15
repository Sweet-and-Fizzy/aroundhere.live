import { describe, expect, it } from 'vitest'
import { cleanScrapedDescription } from '../utils/sanitize'
import { processDescriptions } from '../../utils/html'

describe('description pipeline: sanitize then processDescriptions', () => {
  it('cleans CSS bleed before HTML processing splits text/html fields', () => {
    const dirty =
      'Live music tonight at 8pm! Free admission. ' +
      '#block-abc12345 { color: red; } @media screen { }'
    const cleaned = cleanScrapedDescription(dirty)
    expect(cleaned).toBeDefined()
    const processed = processDescriptions(cleaned)
    expect(processed.description).toContain('Live music tonight at 8pm! Free admission.')
    expect(processed.description).not.toContain('@media')
    expect(processed.description).not.toContain('#block-')
  })

  it('handles HTML input with embedded <style> tags', () => {
    const dirty =
      '<p>Live music tonight at 8pm!</p><style>#block-abc12345 { color: red; }</style>'
    const cleaned = cleanScrapedDescription(dirty)
    expect(cleaned).toBeDefined()
    expect(cleaned).not.toContain('#block-')
    const processed = processDescriptions(cleaned)
    expect(processed.description).toContain('Live music tonight at 8pm!')
  })
})
