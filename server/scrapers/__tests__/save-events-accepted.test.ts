import { describe, it, expect, vi } from 'vitest'
import { saveScrapedEvents } from '../save-events'
import type { ScrapedEvent } from '../types'

const DAY = 24 * 60 * 60 * 1000

describe('saveScrapedEvents accepted count', () => {
  it('counts events that passed validation and saved, excluding filtered and errored ones', async () => {
    const prisma = {
      event: {
        findFirst: vi.fn(async ({ where }: { where: { sourceEventId: string } }) => {
          if (where.sourceEventId === 'broken') throw new Error('db down')
          return { id: 'existing-1' }
        }),
        update: vi.fn(async () => ({})),
      },
    }

    const events: ScrapedEvent[] = [
      { title: 'Upcoming', startsAt: new Date(Date.now() + 7 * DAY), sourceUrl: 'https://example.com/ok', sourceEventId: 'ok' },
      { title: 'Long past', startsAt: new Date(Date.now() - 30 * DAY), sourceUrl: 'https://example.com/past', sourceEventId: 'past' },
      { title: 'Throws', startsAt: new Date(Date.now() + 7 * DAY), sourceUrl: 'https://example.com/broken', sourceEventId: 'broken' },
    ]

    const result = await saveScrapedEvents(
      prisma as never,
      events,
      { id: 'venue-1', regionId: 'region-1' },
      { id: 'source-1', priority: 10 }
    )

    expect(result.updated).toBe(1)
    expect(result.filtered).toBe(1)
    expect(result.accepted).toBe(1)
  })
})
