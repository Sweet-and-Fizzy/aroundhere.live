import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Shared email layout wrapper
 * Provides consistent header, content area, and footer across all emails
 */
function emailLayout(options: {
  logoUrl: string
  content: string
  footerContent: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* Prevent auto-linking of dates/times */
          a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
          }
          .no-link, .no-link * {
            color: #6b7280 !important;
            text-decoration: none !important;
            pointer-events: none !important;
          }
          u + #body a {
            color: inherit;
            text-decoration: none;
            font-size: inherit;
            font-family: inherit;
            font-weight: inherit;
            line-height: inherit;
          }
          @media only screen and (max-width: 480px) {
            .email-body {
              padding: 24px 16px !important;
            }
            .email-header {
              padding: 24px 16px !important;
            }
            .email-footer {
              padding: 16px !important;
            }
            .card-grid td {
              display: block !important;
              width: 100% !important;
              padding: 8px 0 !important;
            }
            .card-grid tr {
              display: block !important;
            }
            .listing-table {
              display: block !important;
            }
            .listing-table tr {
              display: block !important;
              padding: 10px 0 !important;
              border-bottom: 1px solid #e5e7eb !important;
            }
            .listing-table td {
              display: inline !important;
              width: auto !important;
              padding: 0 !important;
            }
            .listing-table td.listing-time {
              display: block !important;
              font-size: 11px !important;
              font-weight: 600 !important;
              color: #6b7280 !important;
              text-transform: uppercase !important;
              letter-spacing: 0.5px !important;
              margin-bottom: 2px !important;
            }
            .listing-table td.listing-title {
              display: block !important;
              font-size: 15px !important;
              font-weight: 500 !important;
              color: #111827 !important;
              margin-bottom: 2px !important;
            }
            .listing-table td.listing-venue {
              display: block !important;
              font-size: 13px !important;
              color: #6b7280 !important;
            }
          }
        </style>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f3f4f6;">
        <div class="email-header" style="background-color: #111827; padding: 32px 30px; text-align: center;">
          <!--[if mso]>
          <table role="presentation" align="center"><tr><td>
          <![endif]-->
          <img src="${options.logoUrl}" alt="AroundHere.Live" style="height: 28px; width: auto; display: inline-block;" />
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
          <div style="display: none; max-height: 0; overflow: hidden; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
            AroundHere<span style="color: #22c55e; font-weight: 400;">.Live</span>
          </div>
        </div>

        <div class="email-body" style="background-color: #ffffff; padding: 40px 30px;">
          ${options.content}
        </div>

        <div class="email-footer" style="background-color: #f3f4f6; padding: 20px 30px; text-align: center;">
          ${options.footerContent}
        </div>
      </body>
    </html>
  `
}

interface FavoriteEvent {
  id: string
  title: string
  slug: string
  startsAt: Date
  imageUrl?: string | null
  venue: {
    name: string
    city?: string | null
  }
  matchedArtists: string[]
  matchedVenue: boolean
  matchedGenres: string[]
}

export async function sendMagicLinkEmail(email: string, magicLink: string) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const logoUrl = `${baseUrl}/around-here-logo-email.png`

  // Log magic link for local development
  if (process.dev) {
    console.log('\n========== MAGIC LINK ==========')
    console.log(`Email: ${email}`)
    console.log(`Link: ${magicLink}`)
    console.log('=================================\n')
  }

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: email,
      subject: 'Sign in to AroundHere',
      html: emailLayout({
        logoUrl,
        content: `
          <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Sign in to your account</h2>

          <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
            Click the button below to sign in. This link will expire in 15 minutes.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${magicLink}"
               style="background-color: #111827;
                      color: #ffffff;
                      text-decoration: none;
                      padding: 14px 32px;
                      border-radius: 8px;
                      font-weight: 600;
                      font-size: 15px;
                      display: inline-block;">
              Sign In
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
            If you didn't request this email, you can safely ignore it.
          </p>
        `,
        footerContent: `
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This link expires in 15 minutes for security.
          </p>
        `,
      }),
      text: `
Sign in to AroundHere

Click the link below to sign in to your account:

${magicLink}

This link will expire in 15 minutes.

If you didn't request this email, you can safely ignore it.
      `.trim(),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send magic link email:', error)
    return { success: false, error }
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const logoUrl = `${baseUrl}/around-here-logo-email.png`

  // Log reset link for local development
  if (process.dev) {
    console.log('\n========== PASSWORD RESET LINK ==========')
    console.log(`Email: ${email}`)
    console.log(`Link: ${resetLink}`)
    console.log('==========================================\n')
  }

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: email,
      subject: 'Reset your password',
      html: emailLayout({
        logoUrl,
        content: `
          <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Reset your password</h2>

          <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
            Click the button below to reset your password. This link will expire in 1 hour.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}"
               style="background-color: #111827;
                      color: #ffffff;
                      text-decoration: none;
                      padding: 14px 32px;
                      border-radius: 8px;
                      font-weight: 600;
                      font-size: 15px;
                      display: inline-block;">
              Reset Password
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
        `,
        footerContent: `
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This link expires in 1 hour for security.
          </p>
        `,
      }),
      text: `
Reset your password

Click the link below to reset your password:

${resetLink}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.
      `.trim(),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send password reset email:', error)
    return { success: false, error }
  }
}

/**
 * Send artist alert email when favorite artists have new shows
 */
export async function sendFavoriteNotificationEmail(
  email: string,
  events: FavoriteEvent[]
) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const logoUrl = `${baseUrl}/around-here-logo-email.png`

  // Group events by date
  const eventsByDate = new Map<string, FavoriteEvent[]>()
  for (const event of events) {
    const dateKey = new Date(event.startsAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, [])
    }
    eventsByDate.get(dateKey)!.push(event)
  }

  // Generate HTML for events
  const eventsHtml = Array.from(eventsByDate.entries())
    .map(([date, dateEvents]) => {
      const eventItems = dateEvents
        .map((event) => {
          const artistNames = event.matchedArtists.join(', ')

          const time = new Date(event.startsAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })

          const imageHtml = event.imageUrl
            ? `<td style="padding: 12px 12px 12px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; width: 80px;">
                <a href="${baseUrl}/events/${event.slug}">
                  <img src="${event.imageUrl}" alt="" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; display: block;" />
                </a>
              </td>`
            : ''

          return `
            <tr>
              ${imageHtml}
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
                <a href="${baseUrl}/events/${event.slug}" style="color: #111827; text-decoration: none; font-weight: 500; font-size: 15px;">
                  ${escapeHtml(event.title)}
                </a>
                <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">
                  ${time} @ ${escapeHtml(event.venue.name)}${event.venue.city ? `, ${escapeHtml(event.venue.city)}` : ''}
                </div>
                ${artistNames ? `<div style="color: #9ca3af; font-size: 12px; margin-top: 2px;">Featuring: ${escapeHtml(artistNames)}</div>` : ''}
              </td>
            </tr>
          `
        })
        .join('')

      return `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #374151; font-size: 14px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">
            ${date}
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${eventItems}
          </table>
        </div>
      `
    })
    .join('')

  // Generate plain text version
  const eventsText = Array.from(eventsByDate.entries())
    .map(([date, dateEvents]) => {
      const eventItems = dateEvents
        .map((event) => {
          const time = new Date(event.startsAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })
          return `  - ${event.title}\n    ${time} @ ${event.venue.name}\n    ${baseUrl}/events/${event.slug}`
        })
        .join('\n\n')

      return `${date}\n${eventItems}`
    })
    .join('\n\n')

  const subjectCount = events.length === 1 ? '1 new show' : `${events.length} new shows`

  // Log for local development
  if (process.dev) {
    console.log('\n========== FAVORITE NOTIFICATION ==========')
    console.log(`Email: ${email}`)
    console.log(`Events: ${events.length}`)
    console.log('============================================\n')
  }

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: email,
      subject: `${subjectCount} from your favorite artists`,
      html: emailLayout({
        logoUrl,
        content: `
          <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">
            New shows from your favorite artists
          </h2>

          <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
            ${events.length === 1 ? 'A new show has' : `${events.length} new shows have`} been announced featuring artists you follow.
          </p>

          ${eventsHtml}

          <div style="text-align: center; margin: 32px 0;">
            <a href="${baseUrl}/"
               style="background-color: #111827;
                      color: #ffffff;
                      text-decoration: none;
                      padding: 14px 32px;
                      border-radius: 8px;
                      font-weight: 600;
                      font-size: 15px;
                      display: inline-block;">
              Browse All Events
            </a>
          </div>
        `,
        footerContent: `
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            <a href="${baseUrl}/interests" style="color: #6b7280; text-decoration: underline;">Manage interests</a>
            &nbsp;•&nbsp;
            <a href="${baseUrl}/settings" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
          </p>
        `,
      }),
      text: `
New shows from your favorite artists

${events.length === 1 ? 'A new show has' : `${events.length} new shows have`} been announced featuring artists you follow.

${eventsText}

---
Browse all events: ${baseUrl}/
Manage interests: ${baseUrl}/interests
      `.trim(),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send favorite notification email:', error)
    return { success: false, error }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Zero-width space character to break up date/time patterns
const ZWSP = '\u200B'

/**
 * Break up date patterns with zero-width spaces to prevent auto-linking
 * Email clients detect patterns like "Fri, Dec 27" and auto-link them
 */
function breakUpDatePattern(text: string): string {
  // Insert zero-width space after commas and before numbers
  return escapeHtml(text)
    .replace(/,/g, `,${ZWSP}`)
    .replace(/(\d+)/g, `${ZWSP}$1`)
}

/**
 * Break up time patterns with zero-width spaces to prevent auto-linking
 * Email clients detect patterns like "6:00 PM" and auto-link them
 */
function breakUpTimePattern(text: string): string {
  // Insert zero-width space before colon and before AM/PM
  return escapeHtml(text)
    .replace(/:/, `${ZWSP}:`)
    .replace(/(AM|PM)/i, `${ZWSP}$1`)
}

/**
 * Types for recommendation email
 */
interface RecommendationEvent {
  event: {
    id: string
    title: string
    slug: string
    startsAt: Date
    coverCharge: string | null
    summary: string | null
    eventType: string | null
    imageUrl: string | null
    venue: {
      name: string
      city: string | null
    } | null
    artists: Array<{ name: string }>
  }
  matchedArtists?: string[]
  explanation?: string
}

interface WeekendListingEvent {
  time: string
  venue: string
  title: string
  slug: string
  attendanceStatus?: 'INTERESTED' | 'GOING'
}

interface WeekendDayListings {
  date: Date
  dayLabel: string // "Friday Dec 27"
  events: WeekendListingEvent[]
}

interface UpcomingAttendanceEvent {
  id: string
  title: string
  slug: string
  startsAt: Date
  imageUrl: string | null
  venue: {
    name: string
    city: string | null
  } | null
  status: 'INTERESTED' | 'GOING'
}

interface RecommendationEmailData {
  favoriteArtistEvents: RecommendationEvent[]
  weekendPicks: RecommendationEvent[]
  comingUpPicks: RecommendationEvent[]
  upcomingAttendanceEvents?: UpcomingAttendanceEvent[]
  fullWeekendListings?: WeekendDayListings[]
}

/**
 * Send weekly AI-curated recommendations email
 */
export async function sendRecommendationEmail(
  email: string,
  data: RecommendationEmailData
) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://aroundhere.live'
  const logoUrl = `${baseUrl}/around-here-logo-email.png`

  const { favoriteArtistEvents, weekendPicks, comingUpPicks, upcomingAttendanceEvents, fullWeekendListings } = data
  const totalRecommendations = favoriteArtistEvents.length + weekendPicks.length + comingUpPicks.length
  const totalListingEvents = fullWeekendListings?.reduce((sum, day) => sum + day.events.length, 0) || 0
  const totalAttendance = upcomingAttendanceEvents?.length || 0

  // Generate HTML for favorite artist section
  const favoriteArtistsHtml = favoriteArtistEvents.length > 0
    ? `
      <div style="margin-bottom: 32px;">
        <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center;">
          <span style="display: inline-block; width: 24px; height: 24px; background-color: #dc2626; border-radius: 50%; margin-right: 10px; text-align: center; line-height: 24px; color: white; font-size: 12px; flex-shrink: 0;">&#9829;</span>
          Your Favorite Artists This Week
        </h3>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Artists you've favorited are playing soon.</p>
        ${renderEventGrid(favoriteArtistEvents, baseUrl, true)}
      </div>
    `
    : ''

  // Generate HTML for weekend picks section
  const weekendPicksHtml = weekendPicks.length > 0
    ? `
      <div style="margin-bottom: 32px;">
        <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center;">
          <span style="display: inline-block; width: 24px; height: 24px; background-color: #7c3aed; border-radius: 50%; margin-right: 10px; text-align: center; line-height: 24px; color: white; font-size: 12px; flex-shrink: 0;">&#9733;</span>
          Weekend Picks
        </h3>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Shows we think you'll enjoy based on your taste.</p>
        ${renderEventGrid(weekendPicks, baseUrl, false)}
      </div>
    `
    : ''

  // Generate HTML for coming up section
  const comingUpHtml = comingUpPicks.length > 0
    ? `
      <div style="margin-bottom: 32px;">
        <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center;">
          <span style="display: inline-block; width: 24px; height: 24px; background-color: #0891b2; border-radius: 50%; margin-right: 10px; text-align: center; line-height: 24px; color: white; font-size: 12px; flex-shrink: 0;">&#10148;</span>
          Coming Up
        </h3>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">More recommendations for the weeks ahead.</p>
        ${renderEventGrid(comingUpPicks, baseUrl, false)}
      </div>
    `
    : ''

  // Generate HTML for user's upcoming attendance (events they're interested in or going to)
  const upcomingAttendanceHtml = renderUpcomingAttendance(upcomingAttendanceEvents || [], baseUrl)

  // Generate HTML for full weekend listings
  const fullListingsHtml = renderWeekendListings(fullWeekendListings || [], baseUrl)

  // Generate plain text version
  const plainText = generateRecommendationPlainText(data, baseUrl)

  // Log for local development
  if (process.dev) {
    console.log('\n========== WEEKLY RECOMMENDATIONS ==========')
    console.log(`Email: ${email}`)
    console.log(`Favorites: ${favoriteArtistEvents.length}`)
    console.log(`Weekend Picks: ${weekendPicks.length}`)
    console.log(`Coming Up: ${comingUpPicks.length}`)
    console.log(`Upcoming Attendance: ${totalAttendance} events`)
    console.log(`Full Listings: ${totalListingEvents} events`)
    console.log('=============================================\n')
  }

  // Build subject line
  const subjectParts: string[] = []
  if (totalRecommendations > 0) {
    subjectParts.push(`${totalRecommendations} picks for you`)
  }
  if (totalListingEvents > 0) {
    subjectParts.push(`${totalListingEvents} shows this week`)
  }
  const subject = subjectParts.length > 0
    ? `This week: ${subjectParts.join(' + ')}`
    : 'Your weekly event roundup'

  // Build intro text
  const hasPersonalized = totalRecommendations > 0
  const hasAttendance = totalAttendance > 0
  let introText: string
  if (hasPersonalized && hasAttendance) {
    introText = `You have ${totalAttendance} upcoming ${totalAttendance === 1 ? 'event' : 'events'}, plus ${totalRecommendations} ${totalRecommendations === 1 ? 'show' : 'shows'} we think you'll love and the full week's listings.`
  } else if (hasAttendance) {
    introText = `You have ${totalAttendance} upcoming ${totalAttendance === 1 ? 'event' : 'events'}. Here's what else is happening this week.`
  } else if (hasPersonalized) {
    introText = `Here are ${totalRecommendations} ${totalRecommendations === 1 ? 'show' : 'shows'} we think you'll love, plus the full week's listings for your area.`
  } else {
    introText = `Here's what's happening this week in your area.`
  }

  try {
    await resend.emails.send({
      from: config.emailFrom || 'AroundHere <whatsup@aroundhere.live>',
      to: email,
      subject,
      html: emailLayout({
        logoUrl,
        content: `
          <h2 style="color: #111827; margin-top: 0; font-size: 22px; font-weight: 600;">
            Your Weekly Roundup
          </h2>

          <p style="color: #4b5563; font-size: 15px; margin-bottom: 28px;">
            ${introText}
          </p>

          ${upcomingAttendanceHtml}
          ${favoriteArtistsHtml}
          ${weekendPicksHtml}
          ${comingUpHtml}
          ${fullListingsHtml}

          <div style="text-align: center; margin: 32px 0;">
            <a href="${baseUrl}/"
               style="background-color: #111827;
                      color: #ffffff;
                      text-decoration: none;
                      padding: 14px 32px;
                      border-radius: 8px;
                      font-weight: 600;
                      font-size: 15px;
                      display: inline-block;">
              Browse All Events
            </a>
          </div>
        `,
        footerContent: `
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 12px 0;">
            <a href="${baseUrl}" style="color: #374151; text-decoration: none; font-weight: 500;">AroundHere</a> aggregates local event listings from venues in your area. Always check the venue website before heading out to confirm times and details.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            <a href="${baseUrl}/settings" style="color: #6b7280; text-decoration: underline;">Manage preferences</a>
            &nbsp;•&nbsp;
            <a href="${baseUrl}/settings" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
          </p>
        `,
      }),
      text: plainText,
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send recommendation email:', error)
    return { success: false, error }
  }
}

/**
 * Render a single event card for the recommendation email
 * Uses aspect-ratio container with object-contain like the app's EventCard
 */
function renderEventCard(
  item: RecommendationEvent,
  baseUrl: string,
  isFavoriteArtist: boolean
): string {
  const { event, explanation } = item

  const date = new Date(event.startsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const time = new Date(event.startsAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const venue = event.venue?.name || 'TBA'
  const city = event.venue?.city ? `, ${event.venue.city}` : ''

  // Show AI explanation for non-favorites
  const explanationHtml = !isFavoriteArtist && explanation
    ? `<div style="color: #9ca3af; font-size: 12px; margin-top: 6px; font-style: italic; line-height: 1.4;">${escapeHtml(explanation)}</div>`
    : ''

  // 16:9 aspect ratio container - use background-image for Gmail compatibility (object-fit not supported)
  const imageHtml = event.imageUrl
    ? `<a href="${baseUrl}/events/${event.slug}" style="display: block; background-color: #111827; background-image: url('${event.imageUrl}'); background-size: contain; background-position: center; background-repeat: no-repeat; border-radius: 8px 8px 0 0; overflow: hidden; position: relative; width: 100%; padding-bottom: 56.25%;"></a>`
    : `<a href="${baseUrl}/events/${event.slug}" style="display: block; background-color: #111827; border-radius: 8px 8px 0 0; overflow: hidden; position: relative; width: 100%; padding-bottom: 56.25%;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; padding: 16px; width: 90%;">
          <div style="color: #ffffff; font-weight: 700; font-size: 14px; line-height: 1.3;">${escapeHtml(event.title)}</div>
          <div style="color: #d1d5db; font-size: 11px; margin-top: 4px;">at ${escapeHtml(venue)}</div>
        </div>
      </a>`

  return `
    <td style="width: 50%; padding: 8px; vertical-align: top;">
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
        ${imageHtml}
        <div style="padding: 12px;">
          <a href="${baseUrl}/events/${event.slug}" style="color: #111827; text-decoration: none; font-weight: 600; font-size: 14px; line-height: 1.3; display: block;">
            ${escapeHtml(event.title)}
          </a>
          <div style="color: #6b7280; font-size: 12px; margin-top: 6px;">
            ${breakUpDatePattern(date)} &bull; ${breakUpTimePattern(time)}
          </div>
          <div style="color: #6b7280; font-size: 12px; margin-top: 2px;">
            ${escapeHtml(venue)}${escapeHtml(city)}
          </div>
          ${explanationHtml}
        </div>
      </div>
    </td>
  `
}

/**
 * Render events in a 2-column grid
 */
function renderEventGrid(
  items: RecommendationEvent[],
  baseUrl: string,
  isFavoriteArtist: boolean
): string {
  if (items.length === 0) return ''

  const rows: string[] = []
  for (let i = 0; i < items.length; i += 2) {
    const item1 = items[i]
    const item2 = items[i + 1]
    if (!item1) continue
    const card1 = renderEventCard(item1, baseUrl, isFavoriteArtist)
    const card2 = item2
      ? renderEventCard(item2, baseUrl, isFavoriteArtist)
      : '<td style="width: 50%; padding: 8px;"></td>'
    rows.push(`<tr>${card1}${card2}</tr>`)
  }

  return `<table class="card-grid" style="width: 100%; border-collapse: collapse;">${rows.join('')}</table>`
}

/**
 * Render a single attendance event card
 * Uses aspect-ratio container with object-contain like the app's EventCard
 */
function renderAttendanceCard(
  event: UpcomingAttendanceEvent,
  baseUrl: string
): string {
  const date = new Date(event.startsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const time = new Date(event.startsAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const venue = event.venue?.name || 'TBA'
  const city = event.venue?.city ? `, ${event.venue.city}` : ''
  const statusIcon = event.status === 'GOING' ? '✓' : '⭐'
  const statusLabel = event.status === 'GOING' ? 'Going' : 'Interested'
  const statusColor = event.status === 'GOING' ? '#059669' : '#d97706'
  const statusBgColor = event.status === 'GOING' ? '#ecfdf5' : '#fffbeb'

  // 16:9 aspect ratio container - use background-image for Gmail compatibility (object-fit not supported)
  const imageHtml = event.imageUrl
    ? `<a href="${baseUrl}/events/${event.slug}" style="display: block; background-color: #111827; background-image: url('${event.imageUrl}'); background-size: contain; background-position: center; background-repeat: no-repeat; border-radius: 8px 8px 0 0; overflow: hidden; position: relative; width: 100%; padding-bottom: 56.25%;"></a>`
    : `<a href="${baseUrl}/events/${event.slug}" style="display: block; background-color: #111827; border-radius: 8px 8px 0 0; overflow: hidden; position: relative; width: 100%; padding-bottom: 56.25%;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; padding: 16px; width: 90%;">
          <div style="color: #ffffff; font-weight: 700; font-size: 14px; line-height: 1.3;">${escapeHtml(event.title)}</div>
          <div style="color: #d1d5db; font-size: 11px; margin-top: 4px;">at ${escapeHtml(venue)}</div>
        </div>
      </a>`

  return `
    <td style="width: 50%; padding: 8px; vertical-align: top;">
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
        ${imageHtml}
        <div style="padding: 12px;">
          <a href="${baseUrl}/events/${event.slug}" style="color: #111827; text-decoration: none; font-weight: 600; font-size: 14px; line-height: 1.3; display: block;">
            ${escapeHtml(event.title)}
          </a>
          <div style="color: #6b7280; font-size: 12px; margin-top: 6px;">
            ${breakUpDatePattern(date)} &bull; ${breakUpTimePattern(time)}
          </div>
          <div style="color: #6b7280; font-size: 12px; margin-top: 2px;">
            ${escapeHtml(venue)}${escapeHtml(city)}
          </div>
          <div style="margin-top: 8px;">
            <span style="display: inline-block; background-color: ${statusBgColor}; color: ${statusColor}; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px;">
              ${statusIcon} ${statusLabel}
            </span>
          </div>
        </div>
      </div>
    </td>
  `
}

/**
 * Render user's upcoming attendance events (interested/going) in card grid
 */
function renderUpcomingAttendance(
  events: UpcomingAttendanceEvent[],
  baseUrl: string
): string {
  if (!events || events.length === 0) return ''

  // Render as 2-column grid like recommendations
  const rows: string[] = []
  for (let i = 0; i < events.length; i += 2) {
    const event1 = events[i]
    const event2 = events[i + 1]
    if (!event1) continue
    const card1 = renderAttendanceCard(event1, baseUrl)
    const card2 = event2
      ? renderAttendanceCard(event2, baseUrl)
      : '<td style="width: 50%; padding: 8px;"></td>'
    rows.push(`<tr>${card1}${card2}</tr>`)
  }

  return `
    <div style="margin-bottom: 32px;">
      <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center;">
        <span style="display: inline-block; width: 24px; height: 24px; background-color: #2563eb; border-radius: 50%; margin-right: 10px; text-align: center; line-height: 24px; color: white; font-size: 12px; flex-shrink: 0;">📅</span>
        Your Upcoming Events
      </h3>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Events you've marked as interested or going.</p>
      <table class="card-grid" style="width: 100%; border-collapse: collapse;">${rows.join('')}</table>
    </div>
  `
}

/**
 * Render condensed weekend listings (all events grouped by day)
 * Column order: Time, Title, Venue
 */
function renderWeekendListings(
  listings: WeekendDayListings[],
  baseUrl: string
): string {
  if (!listings || listings.length === 0) return ''

  const daysHtml = listings.map(day => {
    const eventsHtml = day.events.map(event => {
      // Add attendance indicator if user has marked this event
      let attendanceIndicator = ''
      if (event.attendanceStatus === 'GOING') {
        attendanceIndicator = '<span style="color: #059669; margin-right: 4px;" title="Going">✓</span>'
      } else if (event.attendanceStatus === 'INTERESTED') {
        attendanceIndicator = '<span style="color: #d97706; margin-right: 4px;" title="Interested">⭐</span>'
      }

      return `
      <tr>
        <td class="listing-time" style="color: #6b7280; font-size: 13px; padding: 4px 0; white-space: nowrap; vertical-align: top; width: 65px;">
          ${escapeHtml(event.time)}
        </td>
        <td class="listing-title" style="font-size: 13px; padding: 4px 8px; vertical-align: top;">
          ${attendanceIndicator}<a href="${baseUrl}/events/${event.slug}" style="color: #111827; text-decoration: none;">
            ${escapeHtml(event.title)}
          </a>
        </td>
        <td class="listing-venue" style="color: #6b7280; font-size: 13px; padding: 4px 0; vertical-align: top; text-align: left;">
          ${escapeHtml(event.venue)}
        </td>
      </tr>
    `}).join('')

    return `
      <div style="margin-bottom: 20px;">
        <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
          ${escapeHtml(day.dayLabel)}
        </div>
        <table class="listing-table" style="width: 100%; border-collapse: collapse;">
          ${eventsHtml}
        </table>
      </div>
    `
  }).join('')

  return `
    <div style="margin-bottom: 32px;">
      <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center;">
        <span style="display: inline-block; width: 24px; height: 24px; background-color: #059669; border-radius: 50%; margin-right: 10px; text-align: center; line-height: 24px; color: white; font-size: 12px; flex-shrink: 0;">&#9776;</span>
        This Week's Full Listings
      </h3>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Everything happening in your area this week.</p>
      ${daysHtml}
    </div>
  `
}

/**
 * Generate plain text version of recommendation email
 */
function generateRecommendationPlainText(
  data: RecommendationEmailData,
  baseUrl: string
): string {
  const { favoriteArtistEvents, weekendPicks, comingUpPicks, upcomingAttendanceEvents, fullWeekendListings } = data
  const sections: string[] = []

  // User's upcoming attendance events (first section)
  if (upcomingAttendanceEvents && upcomingAttendanceEvents.length > 0) {
    const events = upcomingAttendanceEvents
      .map((event) => {
        const date = new Date(event.startsAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const time = new Date(event.startsAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
        const venue = event.venue?.name || 'TBA'
        const statusIcon = event.status === 'GOING' ? '[Going]' : '[Interested]'
        return `  ${statusIcon} ${event.title}\n    ${date} @ ${time} - ${venue}\n    ${baseUrl}/events/${event.slug}`
      })
      .join('\n\n')
    sections.push(`YOUR UPCOMING EVENTS\n${events}`)
  }

  if (favoriteArtistEvents.length > 0) {
    const events = favoriteArtistEvents
      .map((item) => {
        const date = new Date(item.event.startsAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const venue = item.event.venue?.name || 'TBA'
        const detail = item.event.summary || ''
        return `  - ${item.event.title}\n    ${date} @ ${venue}${detail ? `\n    ${detail}` : ''}\n    ${baseUrl}/events/${item.event.slug}`
      })
      .join('\n\n')
    sections.push(`YOUR FAVORITE ARTISTS THIS WEEK\n${events}`)
  }

  if (weekendPicks.length > 0) {
    const events = weekendPicks
      .map((item) => {
        const date = new Date(item.event.startsAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const venue = item.event.venue?.name || 'TBA'
        const details: string[] = []
        if (item.event.summary) details.push(item.event.summary)
        if (item.explanation) details.push(item.explanation)
        const detailStr = details.length > 0 ? `\n    ${details.join('\n    ')}` : ''
        return `  - ${item.event.title}\n    ${date} @ ${venue}${detailStr}\n    ${baseUrl}/events/${item.event.slug}`
      })
      .join('\n\n')
    sections.push(`WEEKEND PICKS\n${events}`)
  }

  if (comingUpPicks.length > 0) {
    const events = comingUpPicks
      .map((item) => {
        const date = new Date(item.event.startsAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const venue = item.event.venue?.name || 'TBA'
        const details: string[] = []
        if (item.event.summary) details.push(item.event.summary)
        if (item.explanation) details.push(item.explanation)
        const detailStr = details.length > 0 ? `\n    ${details.join('\n    ')}` : ''
        return `  - ${item.event.title}\n    ${date} @ ${venue}${detailStr}\n    ${baseUrl}/events/${item.event.slug}`
      })
      .join('\n\n')
    sections.push(`COMING UP\n${events}`)
  }

  // Full weekend listings with attendance indicators (Time, Title, Venue order)
  if (fullWeekendListings && fullWeekendListings.length > 0) {
    const daysText = fullWeekendListings.map(day => {
      const eventsText = day.events
        .map(event => {
          const statusPrefix = event.attendanceStatus === 'GOING' ? '✓ ' : event.attendanceStatus === 'INTERESTED' ? '⭐ ' : ''
          return `  ${event.time} - ${statusPrefix}${event.title} @ ${event.venue}`
        })
        .join('\n')
      return `${day.dayLabel.toUpperCase()}\n${eventsText}`
    }).join('\n\n')
    sections.push(`THIS WEEK'S FULL LISTINGS\n\n${daysText}`)
  }

  const hasPersonalized = favoriteArtistEvents.length > 0 || weekendPicks.length > 0 || comingUpPicks.length > 0
  const intro = hasPersonalized
    ? 'Here are shows we think you\'ll love, plus the full week\'s listings for your area.'
    : 'Here\'s what\'s happening this week in your area.'

  return `
Your Weekly Roundup

${intro}

${sections.join('\n\n---\n\n')}

---
AroundHere aggregates local event listings from venues in your area.
Always check the venue website before heading out to confirm times and details.

Browse all events: ${baseUrl}/
Manage preferences: ${baseUrl}/settings
  `.trim()
}
