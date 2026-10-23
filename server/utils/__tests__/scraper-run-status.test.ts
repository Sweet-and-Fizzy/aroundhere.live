import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordScraperSuccess, recordScraperFailure, shouldAlertScraperFailure } from '../scraper-run-status'

const mockPrisma = {
  source: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
}

describe('scraper-run-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordScraperSuccess', () => {
    it('resets failure tracking and records both counts', async () => {
      mockPrisma.source.findUnique.mockResolvedValue({ silentSince: null, lastFoundCount: 40, lastRunStatus: 'success' })
      mockPrisma.source.update.mockResolvedValue({})

      await recordScraperSuccess(mockPrisma as never, 'source-1', 42, 50)

      expect(mockPrisma.source.update).toHaveBeenCalledWith({
        where: { id: 'source-1' },
        data: {
          lastRunAt: expect.any(Date),
          lastRunStatus: 'success',
          lastEventCount: 42,
          lastFoundCount: 50,
          silentSince: null,
          consecutiveFailures: 0,
          lastFailureAt: null,
        },
      })
    })

    it('records a zero event count as zero, not null', async () => {
      mockPrisma.source.findUnique.mockResolvedValue({ silentSince: null, lastFoundCount: 3, lastRunStatus: 'success' })
      mockPrisma.source.update.mockResolvedValue({})

      await recordScraperSuccess(mockPrisma as never, 'source-1', 0, 0)

      const data = mockPrisma.source.update.mock.calls[0]![0].data
      expect(data.lastEventCount).toBe(0)
      expect(data.lastFoundCount).toBe(0)
    })

    it('starts a silent stretch on the first run with no upcoming events', async () => {
      mockPrisma.source.findUnique.mockResolvedValue({ silentSince: null, lastFoundCount: 12, lastRunStatus: 'success' })
      mockPrisma.source.update.mockResolvedValue({})

      await recordScraperSuccess(mockPrisma as never, 'source-1', 0, 12)

      expect(mockPrisma.source.update.mock.calls[0]![0].data.silentSince).toEqual(expect.any(Date))
    })

    it('keeps an ongoing silent stretch', async () => {
      const since = new Date('2026-09-01T12:00:00Z')
      mockPrisma.source.findUnique.mockResolvedValue({ silentSince: since, lastFoundCount: 12, lastRunStatus: 'success' })
      mockPrisma.source.update.mockResolvedValue({})

      await recordScraperSuccess(mockPrisma as never, 'source-1', 0, 12)

      expect(mockPrisma.source.update.mock.calls[0]![0].data.silentSince).toEqual(since)
    })
  })

  describe('recordScraperFailure', () => {
    it('increments consecutiveFailures atomically and returns the new count', async () => {
      mockPrisma.source.update.mockResolvedValue({ consecutiveFailures: 4 })

      const count = await recordScraperFailure(mockPrisma as never, 'source-1')

      expect(mockPrisma.source.update).toHaveBeenCalledWith({
        where: { id: 'source-1' },
        data: {
          lastRunAt: expect.any(Date),
          lastRunStatus: 'failed',
          consecutiveFailures: { increment: 1 },
          lastFailureAt: expect.any(Date),
        },
      })
      expect(count).toBe(4)
    })

    it('returns 1 when the update result lacks a count', async () => {
      mockPrisma.source.update.mockResolvedValue({})

      const count = await recordScraperFailure(mockPrisma as never, 'source-1')

      expect(count).toBe(1)
    })
  })
})

describe('shouldAlertScraperFailure', () => {
  it('alerts on the first failure and at three in a row, then leaves it to the digest', () => {
    expect([1, 2, 3, 4, 5, 10].map(shouldAlertScraperFailure)).toEqual([true, false, true, false, false, false])
  })

  it('alerts when the failure count could not be recorded', () => {
    expect(shouldAlertScraperFailure(undefined)).toBe(true)
  })
})
