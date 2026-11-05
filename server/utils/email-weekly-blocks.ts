/**
 * Copy and small helpers for the weekly email. Kept out of email.ts so they can
 * be tested without constructing the Resend client.
 */
import type { Prisma } from '@prisma/client'
import type { ListingRegion } from '../services/recommendations/listing-region'

const COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000
const SEND_PAUSE_MS = 600

const NOTE_STYLE = 'color: #4b5563; font-size: 14px; margin: 0 0 16px 0;'
const LINK_STYLE = 'color: #374151; text-decoration: underline;'

/**
 * Who the scheduled run emails. A first email needs a confirmed address, since
 * accounts are created before anyone proves they own the address.
 */
export function weeklyRecipientWhere(now: Date): Prisma.UserWhereInput {
  return {
    enableRecommendations: true,
    isActive: true,
    AND: [
      {
        OR: [
          { lastRecommendationSent: null },
          { lastRecommendationSent: { lt: new Date(now.getTime() - COOLDOWN_MS) } },
        ],
      },
      { OR: [{ emailVerified: true }, { lastRecommendationSent: { not: null } }] },
    ],
  }
}

/** Resend rejects bursts, and a rejected send would wait until next week. */
export function pauseBetweenSends(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, SEND_PAUSE_MS))
}

export function firstEmailIntro(regionName: string | null): string {
  const whatWeSend = regionName
    ? `Every Wednesday we send live music listings for ${regionName}, plus picks based on what you like.`
    : 'Every Wednesday we send live music picks based on what you like.'
  return `Welcome to your AroundHere weekly roundup. ${whatWeSend} You're getting this because you have an AroundHere account. You can unsubscribe any time with the link at the bottom of this email.`
}

export function renderFirstEmailIntro(regionName: string | null): string {
  return `
    <p style="color: #4b5563; font-size: 14px; background-color: #f3f4f6; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px 0;">
      ${firstEmailIntro(regionName)}
    </p>
  `
}

export function renderRegionNote(regionName: string, baseUrl: string): string {
  return `
    <p style="${NOTE_STYLE}">
      Showing events around ${regionName}.
      <a href="${baseUrl}/settings" style="${LINK_STYLE}">Change your region</a>
    </p>
  `
}

export function regionNoteText(regionName: string, baseUrl: string): string {
  return `Showing events around ${regionName}. Change your region: ${baseUrl}/settings`
}

function interestsNoteCopy(hasTasteProfile: boolean): { lead: string; link: string } {
  return hasTasteProfile
    ? { lead: 'Picks not quite right?', link: 'Update your interests' }
    : { lead: 'Want picks chosen for you?', link: "Tell us what you're into" }
}

function renderInterestsNote(hasTasteProfile: boolean, baseUrl: string): string {
  const { lead, link } = interestsNoteCopy(hasTasteProfile)
  return `
    <p style="${NOTE_STYLE}">
      ${lead}
      <a href="${baseUrl}/interests" style="${LINK_STYLE}">${link}.</a>
    </p>
  `
}

export function interestsNoteText(hasTasteProfile: boolean, baseUrl: string): string {
  const { lead, link } = interestsNoteCopy(hasTasteProfile)
  return `${lead} ${link}: ${baseUrl}/interests`
}

/** HTML blocks for one email. A block that shouldn't show is an empty string. */
export function weeklyEmailBlocks(
  data: { isFirstEmail?: boolean; listingRegionName?: string; inferredRegionName?: string; hasTasteProfile: boolean },
  hasListings: boolean,
  baseUrl: string,
): { intro: string; regionNote: string; interestsNote: string } {
  return {
    intro: data.isFirstEmail ? renderFirstEmailIntro(hasListings ? data.listingRegionName ?? null : null) : '',
    regionNote: hasListings && data.inferredRegionName ? renderRegionNote(data.inferredRegionName, baseUrl) : '',
    interestsNote: renderInterestsNote(data.hasTasteProfile, baseUrl),
  }
}

/** The state behind a send or skip, so a log line alone can explain it. */
export function describeRun(input: {
  hasTaste: boolean
  ranked: number
  region: ListingRegion | null
  listings: number
}): string {
  const region = input.region ? `${input.region.name}/${input.region.source}` : 'none'
  return `taste=${input.hasTaste ? 'yes' : 'no'} ranked=${input.ranked} region=${region} listings=${input.listings}`
}
