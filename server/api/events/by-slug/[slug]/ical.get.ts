import prisma from '../../../../utils/prisma'

/**
 * Generate ICS (iCalendar) file for an event
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Event slug is required',
    })
  }

  const eventData = await prisma.event.findFirst({
    where: { slug },
    include: {
      venue: {
        select: {
          name: true,
          address: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
    },
  })

  if (!eventData) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Format dates for ICS (UTC format: YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  // Build location string
  const locationParts = []
  if (eventData.venue?.name) {
    locationParts.push(eventData.venue.name)
  }
  if (eventData.venue?.address) {
    locationParts.push(eventData.venue.address)
  }
  if (eventData.venue?.city) {
    locationParts.push(eventData.venue.city)
  }
  if (eventData.venue?.state || eventData.venue?.postalCode) {
    locationParts.push([eventData.venue.state, eventData.venue.postalCode].filter(Boolean).join(' '))
  }
  const location = locationParts.join(', ')

  // Build description
  const description = eventData.description
    ? eventData.description.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').substring(0, 1000)
    : `Live music event at ${eventData.venue?.name || 'venue'}`

  // Use endsAt if available, otherwise add 3 hours to startsAt
  const endDate = eventData.endsAt || new Date(eventData.startsAt.getTime() + 3 * 60 * 60 * 1000)

  // Generate ICS content
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AroundHere//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventData.id}@aroundhere.live`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(eventData.startsAt)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${eventData.title.replace(/,/g, '\\,').replace(/;/g, '\\;')}`,
    `DESCRIPTION:${description.replace(/,/g, '\\,').replace(/;/g, '\\;')}`,
    location ? `LOCATION:${location.replace(/,/g, '\\,').replace(/;/g, '\\;')}` : '',
    eventData.sourceUrl ? `URL:${eventData.sourceUrl}` : '',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')

  // Set headers for ICS file download
  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${eventData.slug}.ics"`)

  return icsContent
})

