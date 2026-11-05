import { describe, it, expect, vi } from 'vitest'
import {
  describeRun,
  firstEmailIntro,
  interestsNoteText,
  pauseBetweenSends,
  regionNoteText,
  renderFirstEmailIntro,
  renderRegionNote,
  weeklyEmailBlocks,
  weeklyRecipientWhere,
} from '../email-weekly-blocks'

const base = 'https://x.test'

describe('first email intro', () => {
  it('names the region', () => {
    expect(firstEmailIntro('Western MA')).toContain('live music listings for Western MA, plus picks')
  })

  it('falls back to picks wording without a region', () => {
    expect(firstEmailIntro(null)).toContain('live music picks based on what you like')
  })

  it('renders as HTML', () => {
    expect(renderFirstEmailIntro('Western MA')).toContain('Welcome to your AroundHere weekly roundup.')
  })
})

describe('region note', () => {
  it('renders in HTML', () => {
    expect(renderRegionNote('Western MA', base)).toContain('Showing events around Western MA.')
  })

  it('renders in plain text', () => {
    expect(regionNoteText('Western MA', base)).toBe('Showing events around Western MA. Change your region: https://x.test/settings')
  })
})

describe('weeklyRecipientWhere', () => {
  it('limits recipients to confirmed or previously emailed addresses, outside the cooldown', () => {
    expect(weeklyRecipientWhere(new Date('2026-11-11T13:00:00Z'))).toEqual({
      enableRecommendations: true,
      isActive: true,
      AND: [
        { OR: [{ lastRecommendationSent: null }, { lastRecommendationSent: { lt: new Date('2026-11-05T13:00:00Z') } }] },
        { OR: [{ emailVerified: true }, { lastRecommendationSent: { not: null } }] },
      ],
    })
  })
})

describe('pauseBetweenSends', () => {
  it('waits long enough to stay under the send rate limit', async () => {
    vi.useFakeTimers()
    let done = false
    void pauseBetweenSends().then(() => { done = true })

    await vi.advanceTimersByTimeAsync(599)
    expect(done).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    vi.useRealTimers()
  })
})

describe('describeRun', () => {
  it('describes a run with no region', () => {
    expect(describeRun({ hasTaste: true, ranked: 0, region: null, listings: 0 }))
      .toBe('taste=yes ranked=0 region=none listings=0')
  })

  it('names the region and its source', () => {
    const region = { id: 'r', name: 'Western MA', timezone: 'America/New_York', source: 'fallback' as const }
    expect(describeRun({ hasTaste: false, ranked: 0, region, listings: 96 }))
      .toBe('taste=no ranked=0 region=Western MA/fallback listings=96')
  })
})

describe('weeklyEmailBlocks', () => {
  it('invites users without a taste profile', () => {
    expect(weeklyEmailBlocks({ hasTasteProfile: false }, true, base).interestsNote).toContain("Tell us what you're into")
  })

  it('offers an update to users with a taste profile', () => {
    expect(weeklyEmailBlocks({ hasTasteProfile: true }, true, base).interestsNote).toContain('Update your interests')
  })

  it('links the plain text interests note', () => {
    expect(interestsNoteText(false, base)).toContain('https://x.test/interests')
  })

  it('gives a returning user no intro, even with an inferred region', () => {
    const blocks = weeklyEmailBlocks({ isFirstEmail: false, inferredRegionName: 'Western MA', hasTasteProfile: true }, true, base)
    expect(blocks.intro).toBe('')
    expect(blocks.regionNote).toContain('Western MA')
  })

  it('shows no region note without listings', () => {
    expect(weeklyEmailBlocks({ inferredRegionName: 'Western MA', hasTasteProfile: true }, false, base).regionNote).toBe('')
  })

  it('shows no region note for a chosen region', () => {
    expect(weeklyEmailBlocks({ isFirstEmail: true, hasTasteProfile: true }, true, base).regionNote).toBe('')
  })

  it('leaves the region out of the intro when there are no listings', () => {
    const { intro } = weeklyEmailBlocks({ isFirstEmail: true, listingRegionName: 'Western MA', hasTasteProfile: true }, false, base)
    expect(intro).toContain('live music picks based on what you like')
  })
})
