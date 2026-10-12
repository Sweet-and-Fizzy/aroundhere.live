/**
 * Date handling for the chat assistant's tools. The model passes plain
 * YYYY-MM-DD strings that mean days in the region's timezone, and it sometimes
 * asks for days that have already passed (e.g. "this weekend" on a Sunday
 * becomes Saturday-Sunday). The assistant only ever recommends upcoming shows.
 */

import { addDays } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function regionToday(now: Date, timezone: string): string {
  return now.toLocaleDateString('en-CA', { timeZone: timezone })
}

/** The requested start day, moved up to today if it is in the past. */
export function upcomingStartDate(startDate: string | undefined, now: Date, timezone: string): string | undefined {
  if (!startDate || !ISO_DAY.test(startDate)) return undefined
  const today = regionToday(now, timezone)
  return startDate < today ? today : startDate
}

/** Start and end instants for a day range, defaulting to the next two weeks. */
export function recommendationWindow(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date,
  timezone: string,
): { start: Date; end: Date } {
  const startDay = upcomingStartDate(startDate, now, timezone)
  const start = startDay && startDay > regionToday(now, timezone)
    ? fromZonedTime(`${startDay}T00:00:00`, timezone)
    : now
  const end = endDate && ISO_DAY.test(endDate)
    ? fromZonedTime(`${endDate}T23:59:59.999`, timezone)
    : addDays(now, 14)
  return { start, end }
}
