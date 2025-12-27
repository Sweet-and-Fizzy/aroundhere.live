import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Event Attendance API', () => {
  describe('POST /api/events/[id]/attendance', () => {
    const postFile = readFileSync(
      join(__dirname, '../events/[id]/attendance.post.ts'),
      'utf-8'
    )

    it('requires authentication', () => {
      expect(postFile).toContain('getUserSession')
      expect(postFile).toMatch(/if\s*\(\s*!session/)
      expect(postFile).toContain('Authentication required')
      expect(postFile).toContain('statusCode: 401')
    })

    it('validates event ID is provided', () => {
      expect(postFile).toContain("getRouterParam(event, 'id')")
      expect(postFile).toContain('Event ID is required')
      expect(postFile).toContain('statusCode: 400')
    })

    it('validates status is INTERESTED or GOING', () => {
      expect(postFile).toContain("['INTERESTED', 'GOING'].includes(status)")
      expect(postFile).toContain('Valid status (INTERESTED or GOING) is required')
    })

    it('verifies event exists before setting attendance', () => {
      expect(postFile).toContain('prisma.event.findUnique')
      expect(postFile).toContain('Event not found')
      expect(postFile).toContain('statusCode: 404')
    })

    it('uses upsert to handle create/update', () => {
      expect(postFile).toContain('prisma.userEventAttendance.upsert')
      expect(postFile).toContain('userId_eventId')
    })

    it('returns updated counts after setting attendance', () => {
      expect(postFile).toContain('interestedCount')
      expect(postFile).toContain('goingCount')
      expect(postFile).toContain("status: 'INTERESTED'")
      expect(postFile).toContain("status: 'GOING'")
    })

    it('returns success response with status and counts', () => {
      expect(postFile).toContain('success: true')
      expect(postFile).toContain('status: attendance.status')
      expect(postFile).toContain('interestedCount')
      expect(postFile).toContain('goingCount')
    })
  })

  describe('DELETE /api/events/[id]/attendance', () => {
    const deleteFile = readFileSync(
      join(__dirname, '../events/[id]/attendance.delete.ts'),
      'utf-8'
    )

    it('requires authentication', () => {
      expect(deleteFile).toContain('getUserSession')
      expect(deleteFile).toMatch(/if\s*\(\s*!session/)
      expect(deleteFile).toContain('Authentication required')
      expect(deleteFile).toContain('statusCode: 401')
    })

    it('validates event ID is provided', () => {
      expect(deleteFile).toContain("getRouterParam(event, 'id')")
      expect(deleteFile).toContain('Event ID is required')
      expect(deleteFile).toContain('statusCode: 400')
    })

    it('uses deleteMany to remove attendance', () => {
      expect(deleteFile).toContain('prisma.userEventAttendance.deleteMany')
      expect(deleteFile).toContain('userId')
      expect(deleteFile).toContain('eventId')
    })

    it('returns updated counts after deletion', () => {
      expect(deleteFile).toContain('interestedCount')
      expect(deleteFile).toContain('goingCount')
      expect(deleteFile).toContain('prisma.userEventAttendance.count')
    })

    it('returns null status after deletion', () => {
      expect(deleteFile).toContain('status: null')
    })
  })

  describe('GET /api/events/attendance/check', () => {
    const checkFile = readFileSync(
      join(__dirname, '../events/attendance/check.get.ts'),
      'utf-8'
    )

    it('returns empty map for unauthenticated users without error', () => {
      expect(checkFile).toContain('getUserSession')
      expect(checkFile).toContain("return { attendance: {} }")
      // Should NOT throw 401 for unauthenticated users
      expect(checkFile).not.toMatch(/!session.*throw.*401/)
    })

    it('parses eventIds from query parameter', () => {
      expect(checkFile).toContain('eventIds')
      expect(checkFile).toContain("split(',')")
    })

    it('returns empty map when no eventIds provided', () => {
      expect(checkFile).toContain('if (!eventIdsParam)')
      expect(checkFile).toContain("return { attendance: {} }")
    })

    it('limits number of event IDs to prevent abuse', () => {
      expect(checkFile).toContain('eventIds.length > 100')
      expect(checkFile).toContain('Too many event IDs')
      expect(checkFile).toContain('statusCode: 400')
    })

    it('queries attendance for provided event IDs', () => {
      expect(checkFile).toContain('prisma.userEventAttendance.findMany')
      expect(checkFile).toContain('eventId: { in: eventIds }')
    })

    it('returns map of eventId to status', () => {
      expect(checkFile).toContain('attendance[record.eventId] = record.status')
      expect(checkFile).toContain('return { attendance }')
    })
  })

  describe('Events index includes attendance counts', () => {
    const eventsIndexFile = readFileSync(
      join(__dirname, '../events/index.get.ts'),
      'utf-8'
    )

    it('supports myEvents filter for user attendance', () => {
      expect(eventsIndexFile).toContain('myEvents')
      expect(eventsIndexFile).toContain('userAttendance')
    })

    it('filters by attendance status when myEvents is set', () => {
      expect(eventsIndexFile).toContain("myEvents !== 'all'")
      expect(eventsIndexFile).toContain('status: myEvents.toUpperCase()')
    })

    it('does not cache when myEvents filter is used', () => {
      expect(eventsIndexFile).toContain('if (!myEvents)')
      expect(eventsIndexFile).toContain('setCacheHeaders')
    })
  })
})
