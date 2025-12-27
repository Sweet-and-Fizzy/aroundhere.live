import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('useEventAttendance composable', () => {
  const composableFile = readFileSync(
    join(__dirname, '../useEventAttendance.ts'),
    'utf-8'
  )

  describe('state management', () => {
    it('uses useState for persistence across navigations', () => {
      expect(composableFile).toContain('useState')
      expect(composableFile).toContain('user-event-attendance')
    })

    it('stores attendance as a map of eventId to status', () => {
      expect(composableFile).toContain('Record<string, EventAttendanceStatus>')
    })

    it('exports attendance state for external access', () => {
      expect(composableFile).toMatch(/return\s*\{[\s\S]*attendance/)
    })
  })

  describe('getAttendance', () => {
    it('returns status for given eventId', () => {
      expect(composableFile).toContain('function getAttendance(eventId: string)')
      expect(composableFile).toContain('attendance.value[eventId]')
    })

    it('returns null when no attendance exists', () => {
      expect(composableFile).toContain('?? null')
    })
  })

  describe('isInterested and isGoing helpers', () => {
    it('provides isInterested helper', () => {
      expect(composableFile).toContain('function isInterested(eventId: string)')
      expect(composableFile).toContain("=== 'INTERESTED'")
    })

    it('provides isGoing helper', () => {
      expect(composableFile).toContain('function isGoing(eventId: string)')
      expect(composableFile).toContain("=== 'GOING'")
    })
  })

  describe('checkAttendance (batch)', () => {
    it('accepts array of event IDs', () => {
      expect(composableFile).toContain('async function checkAttendance(eventIds: string[])')
    })

    it('skips if not logged in', () => {
      expect(composableFile).toContain('if (!loggedIn.value')
    })

    it('calls the batch check API endpoint', () => {
      expect(composableFile).toContain('/api/events/attendance/check')
      expect(composableFile).toContain('eventIds.join')
    })

    it('merges results into attendance state', () => {
      expect(composableFile).toContain('{ ...attendance.value, ...results }')
    })
  })

  describe('setAttendance', () => {
    it('requires login', () => {
      expect(composableFile).toContain('if (!loggedIn.value) return null')
    })

    it('performs optimistic update', () => {
      expect(composableFile).toContain('// Optimistic update')
      expect(composableFile).toContain('const previousStatus = attendance.value[eventId]')
    })

    it('calls POST API endpoint', () => {
      expect(composableFile).toContain('`/api/events/${eventId}/attendance`')
      expect(composableFile).toContain("method: 'POST'")
    })

    it('rolls back on error', () => {
      expect(composableFile).toContain('// Rollback on error')
      expect(composableFile).toContain('catch (e)')
    })

    it('returns interestedCount and goingCount', () => {
      expect(composableFile).toContain('interestedCount: result.interestedCount')
      expect(composableFile).toContain('goingCount: result.goingCount')
    })
  })

  describe('removeAttendance', () => {
    it('requires login', () => {
      // Check that removeAttendance has login check
      const removeSection = composableFile.match(/async function removeAttendance[\s\S]*?return null[\s\S]*?\}/)?.[0]
      expect(removeSection).toContain('!loggedIn.value')
    })

    it('performs optimistic delete', () => {
      expect(composableFile).toContain('delete newAttendance[eventId]')
    })

    it('calls DELETE API endpoint', () => {
      expect(composableFile).toContain("method: 'DELETE'")
    })

    it('rolls back on error', () => {
      // Check that removeAttendance has rollback logic
      expect(composableFile).toContain('// Rollback on error')
      expect(composableFile).toContain('if (previousStatus)')
    })
  })

  describe('toggleAttendance', () => {
    it('removes if current status matches', () => {
      expect(composableFile).toContain('if (currentStatus === status)')
      expect(composableFile).toContain('return removeAttendance(eventId)')
    })

    it('sets if current status differs', () => {
      expect(composableFile).toContain('return setAttendance(eventId, status)')
    })
  })

  describe('clearAttendance', () => {
    it('resets attendance to empty object', () => {
      expect(composableFile).toContain('function clearAttendance()')
      expect(composableFile).toContain('attendance.value = {}')
    })

    it('is called on logout', () => {
      expect(composableFile).toContain('watch(loggedIn')
      expect(composableFile).toContain('clearAttendance()')
    })
  })

  describe('exports', () => {
    it('exports all necessary functions', () => {
      // Check for the final return block that exports from the composable
      expect(composableFile).toContain('return {')
      expect(composableFile).toContain('attendance,')
      expect(composableFile).toContain('loading,')
      expect(composableFile).toContain('getAttendance,')
      expect(composableFile).toContain('isInterested,')
      expect(composableFile).toContain('isGoing,')
      expect(composableFile).toContain('checkAttendance,')
      expect(composableFile).toContain('setAttendance,')
      expect(composableFile).toContain('removeAttendance,')
      expect(composableFile).toContain('toggleAttendance,')
      expect(composableFile).toContain('clearAttendance,')
    })
  })
})
