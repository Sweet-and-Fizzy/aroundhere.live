/**
 * Composable for formatting event times in their region's timezone
 * Shows timezone abbreviation when user is in a different timezone
 */

// Default timezone for events (most venues are in Eastern time)
const DEFAULT_EVENT_TIMEZONE = 'America/New_York'

// Get the user's local timezone
function getUserTimezone(): string {
  if (typeof Intl !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return DEFAULT_EVENT_TIMEZONE
}

// Check if two timezones are effectively the same (same offset at a given time)
function isSameTimezone(tz1: string, tz2: string, date: Date): boolean {
  const formatter1 = new Intl.DateTimeFormat('en-US', { timeZone: tz1, timeZoneName: 'short' })
  const formatter2 = new Intl.DateTimeFormat('en-US', { timeZone: tz2, timeZoneName: 'short' })

  const parts1 = formatter1.formatToParts(date)
  const parts2 = formatter2.formatToParts(date)

  const tzAbbr1 = parts1.find(p => p.type === 'timeZoneName')?.value
  const tzAbbr2 = parts2.find(p => p.type === 'timeZoneName')?.value

  return tzAbbr1 === tzAbbr2
}

export function useEventTime() {
  const userTimezone = getUserTimezone()

  /**
   * Format a time in the event's timezone
   * Includes timezone abbreviation if user is in a different timezone
   */
  function formatTime(
    dateStr: string | Date,
    eventTimezone: string = DEFAULT_EVENT_TIMEZONE,
    options: { includeTimezone?: 'auto' | 'always' | 'never' } = {}
  ): string | null {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

    // Check if time is midnight (indicating no time was specified)
    // Need to check in the event's timezone
    const eventHours = new Intl.DateTimeFormat('en-US', {
      timeZone: eventTimezone,
      hour: 'numeric',
      hour12: false,
    }).format(date)
    const eventMinutes = new Intl.DateTimeFormat('en-US', {
      timeZone: eventTimezone,
      minute: 'numeric',
    }).format(date)

    if (parseInt(eventHours) === 0 && parseInt(eventMinutes) === 0) {
      return null
    }

    const { includeTimezone = 'auto' } = options
    const showTimezone = includeTimezone === 'always' ||
      (includeTimezone === 'auto' && !isSameTimezone(userTimezone, eventTimezone, date))

    const formatted = date.toLocaleTimeString('en-US', {
      timeZone: eventTimezone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: showTimezone ? 'short' : undefined,
    })

    return formatted
  }

  /**
   * Format a date in the event's timezone
   */
  function formatDate(
    dateStr: string | Date,
    eventTimezone: string = DEFAULT_EVENT_TIMEZONE,
    options: Intl.DateTimeFormatOptions = {}
  ): string {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

    return date.toLocaleDateString('en-US', {
      timeZone: eventTimezone,
      ...options,
    })
  }

  /**
   * Get date parts (weekday, month, day) in the event's timezone
   */
  function getDateParts(dateStr: string | Date, eventTimezone: string = DEFAULT_EVENT_TIMEZONE) {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

    return {
      weekday: date.toLocaleDateString('en-US', { timeZone: eventTimezone, weekday: 'short' }),
      month: date.toLocaleDateString('en-US', { timeZone: eventTimezone, month: 'short' }),
      day: parseInt(date.toLocaleDateString('en-US', { timeZone: eventTimezone, day: 'numeric' })),
    }
  }

  /**
   * Check if user is in a different timezone than the event
   */
  function isUserInDifferentTimezone(eventTimezone: string = DEFAULT_EVENT_TIMEZONE): boolean {
    return !isSameTimezone(userTimezone, eventTimezone, new Date())
  }

  return {
    userTimezone,
    defaultEventTimezone: DEFAULT_EVENT_TIMEZONE,
    formatTime,
    formatDate,
    getDateParts,
    isUserInDifferentTimezone,
  }
}
