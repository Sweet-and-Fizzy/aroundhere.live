import { describe, it, expect, vi, beforeEach } from 'vitest'

const classifyWithFallback = vi.fn()
vi.mock('../../services/classifier', () => ({ classifier: { classifyWithFallback } }))
vi.mock('../../services/embeddings', () => ({
  generateEmbeddings: vi.fn(async () => []),
  buildEventEmbeddingText: vi.fn(() => ''),
}))
vi.mock('../../services/notifications', () => ({ sendSlackNotification: vi.fn() }))

const { backfillMissingSummaries } = await import('../classify-events')

const event = (id: string) => ({
  id,
  title: `Show ${id}`,
  description: 'A long enough description of the show to be worth summarizing.',
  genres: [],
  venue: { name: 'The Drake' },
})

const result = (eventId: string, summary?: string) => ({
  eventId,
  isMusic: true,
  eventType: 'MUSIC',
  canonicalGenres: ['rock'],
  confidence: 0.9,
  summary,
})

function mockPrisma(ids: string[]) {
  return {
    $queryRaw: vi.fn(async () => ids.map(id => ({ id }))),
    event: {
      findMany: vi.fn(async () => ids.map(event)),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({})),
    },
    $executeRawUnsafe: vi.fn(),
  }
}

describe('backfillMissingSummaries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reclassifies events that gained a description after classification', async () => {
    const prisma = mockPrisma(['a'])
    classifyWithFallback.mockResolvedValue([result('a', 'A great show.')])

    expect(await backfillMissingSummaries(prisma as never)).toBe(1)

    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ summary: 'A great show.' }),
      })
    )
    expect(prisma.event.updateMany).not.toHaveBeenCalled()
  })

  it('counts an attempt when the model still returns no summary, so it is not retried forever', async () => {
    const prisma = mockPrisma(['a', 'b'])
    classifyWithFallback.mockResolvedValue([result('a', 'Summary.'), result('b')])

    expect(await backfillMissingSummaries(prisma as never)).toBe(1)

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] } },
      data: { classificationAttempts: { increment: 1 } },
    })
  })

  it('counts an attempt for the whole batch when the classifier fails', async () => {
    const prisma = mockPrisma(['a', 'b'])
    classifyWithFallback.mockRejectedValue(new Error('rate limited'))

    expect(await backfillMissingSummaries(prisma as never)).toBe(0)

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { classificationAttempts: { increment: 1 } },
    })
  })

  it('does nothing when no events need a summary', async () => {
    const prisma = mockPrisma([])
    expect(await backfillMissingSummaries(prisma as never)).toBe(0)
    expect(classifyWithFallback).not.toHaveBeenCalled()
  })
})
