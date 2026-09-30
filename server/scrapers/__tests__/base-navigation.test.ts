import { describe, it, expect } from 'vitest'
import { navigationError } from '../base'

describe('navigationError', () => {
  it('reports an HTTP error page that yielded no events, using the final URL', () => {
    expect(navigationError(404, 'https://ironhorse.org/parlorroomshows/', 0)).toBe(
      'HTTP 404 from https://ironhorse.org/parlorroomshows/'
    )
  })

  it('ignores an error status when events were still parsed (challenge pages that resolve)', () => {
    expect(navigationError(403, 'https://example.com/events', 12)).toBeNull()
  })

  it('ignores successful responses', () => {
    expect(navigationError(200, 'https://example.com/events', 0)).toBeNull()
  })

  it('ignores a missing response', () => {
    expect(navigationError(undefined, undefined, 0)).toBeNull()
  })
})
