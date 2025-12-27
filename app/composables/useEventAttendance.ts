import type { EventAttendanceStatus } from '@prisma/client'

export function useEventAttendance() {
  const { loggedIn } = useUserSession()

  // Map of eventId -> status for quick lookups
  const attendance = useState<Record<string, EventAttendanceStatus>>(
    'user-event-attendance',
    () => ({})
  )

  const loading = ref(false)

  // Get attendance status for a single event
  function getAttendance(eventId: string): EventAttendanceStatus | null {
    return attendance.value[eventId] ?? null
  }

  // Check if user has specific status for an event
  function isInterested(eventId: string): boolean {
    return attendance.value[eventId] === 'INTERESTED'
  }

  function isGoing(eventId: string): boolean {
    return attendance.value[eventId] === 'GOING'
  }

  // Batch check attendance for multiple events
  async function checkAttendance(eventIds: string[]): Promise<void> {
    if (!loggedIn.value || eventIds.length === 0) return

    try {
      const { attendance: results } = await $fetch<{
        attendance: Record<string, EventAttendanceStatus>
      }>(`/api/events/attendance/check?eventIds=${eventIds.join(',')}`)

      // Merge results into state
      attendance.value = { ...attendance.value, ...results }
    } catch (e) {
      console.error('Error checking attendance:', e)
    }
  }

  // Set attendance status (returns updated counts)
  async function setAttendance(
    eventId: string,
    status: EventAttendanceStatus
  ): Promise<{ interestedCount: number; goingCount: number } | null> {
    if (!loggedIn.value) return null

    // Optimistic update
    const previousStatus = attendance.value[eventId]
    attendance.value = { ...attendance.value, [eventId]: status }

    try {
      const result = await $fetch<{
        success: boolean
        status: EventAttendanceStatus
        interestedCount: number
        goingCount: number
      }>(`/api/events/${eventId}/attendance`, {
        method: 'POST',
        body: { status },
      })

      return {
        interestedCount: result.interestedCount,
        goingCount: result.goingCount,
      }
    } catch (e) {
      // Rollback on error
      if (previousStatus) {
        attendance.value = { ...attendance.value, [eventId]: previousStatus }
      } else {
        const newAttendance = { ...attendance.value }
        delete newAttendance[eventId]
        attendance.value = newAttendance
      }
      console.error('Error setting attendance:', e)
      return null
    }
  }

  // Remove attendance status (returns updated counts)
  async function removeAttendance(
    eventId: string
  ): Promise<{ interestedCount: number; goingCount: number } | null> {
    if (!loggedIn.value) return null

    // Optimistic update
    const previousStatus = attendance.value[eventId]
    const newAttendance = { ...attendance.value }
    delete newAttendance[eventId]
    attendance.value = newAttendance

    try {
      const result = await $fetch<{
        success: boolean
        status: null
        interestedCount: number
        goingCount: number
      }>(`/api/events/${eventId}/attendance`, {
        method: 'DELETE',
      })

      return {
        interestedCount: result.interestedCount,
        goingCount: result.goingCount,
      }
    } catch (e) {
      // Rollback on error
      if (previousStatus) {
        attendance.value = { ...attendance.value, [eventId]: previousStatus }
      }
      console.error('Error removing attendance:', e)
      return null
    }
  }

  // Toggle attendance - if current status matches, remove; otherwise set new status
  async function toggleAttendance(
    eventId: string,
    status: EventAttendanceStatus
  ): Promise<{ interestedCount: number; goingCount: number } | null> {
    const currentStatus = getAttendance(eventId)

    if (currentStatus === status) {
      return removeAttendance(eventId)
    } else {
      return setAttendance(eventId, status)
    }
  }

  // Clear all attendance data (on logout)
  function clearAttendance() {
    attendance.value = {}
  }

  // Watch for logout
  watch(loggedIn, (isLoggedIn) => {
    if (!isLoggedIn) {
      clearAttendance()
    }
  })

  return {
    attendance,
    loading,
    getAttendance,
    isInterested,
    isGoing,
    checkAttendance,
    setAttendance,
    removeAttendance,
    toggleAttendance,
    clearAttendance,
  }
}
