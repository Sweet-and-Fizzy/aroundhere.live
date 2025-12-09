/**
 * Freakscene newsletter scraper
 * Scrapes the Buttondown RSS feed for featured artist reviews
 */

import * as cheerio from 'cheerio'
import type { PrismaClient } from '@prisma/client'

const RSS_URL = 'https://buttondown.com/freakscene/rss'

interface FeaturedArtist {
  name: string
  excerpt: string | null
}

interface RSSItem {
  url: string
  title: string
  publishedAt: Date | null
  content: string
}

/**
 * Fetch and parse the RSS feed
 */
async function fetchRSS(): Promise<RSSItem[]> {
  const response = await fetch(RSS_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`)
  }
  const xml = await response.text()
  const $ = cheerio.load(xml, { xmlMode: true })

  const items: RSSItem[] = []

  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim()
    const url = $(el).find('link').text().trim()
    const pubDate = $(el).find('pubDate').text().trim()
    const content = $(el).find('description').text().trim()

    items.push({
      url,
      title,
      publishedAt: pubDate ? new Date(pubDate) : null,
      content,
    })
  })

  return items
}

/**
 * Get the main content (before listings section) and extract paragraphs
 */
function getMainContentParagraphs(htmlContent: string): { paragraphs: string[]; plainText: string } {
  // Find where the listings section starts (cutoff markers)
  const listingsMarkers = [
    '&lt;h1&gt;upcoming concerts',
    '&lt;h1&gt;upcoming shows',
    '&lt;h1&gt;this weekend',
    '<h1>upcoming concerts',
    '<h1>upcoming shows',
    '<h1>this weekend',
  ]

  let mainContent = htmlContent
  const lowerContent = htmlContent.toLowerCase()

  for (const marker of listingsMarkers) {
    const idx = lowerContent.indexOf(marker.toLowerCase())
    if (idx > 0) {
      mainContent = htmlContent.slice(0, idx)
      break
    }
  }

  const $ = cheerio.load(mainContent)

  // Extract paragraphs
  const paragraphs: string[] = []
  $('p').each((_, el) => {
    const text = $(el).text().trim()
    if (text.length > 50) {
      paragraphs.push(text)
    }
  })

  const plainText = $('body').text() || $.root().text()

  return { paragraphs, plainText }
}

/**
 * Find a paragraph that mentions the artist name
 */
function findExcerptForArtist(artistName: string, paragraphs: string[]): string | null {
  // Try exact match first
  for (const para of paragraphs) {
    if (para.includes(artistName)) {
      return para.slice(0, 500)
    }
  }

  // Try case-insensitive match
  const lowerName = artistName.toLowerCase()
  for (const para of paragraphs) {
    if (para.toLowerCase().includes(lowerName)) {
      return para.slice(0, 500)
    }
  }

  return null
}

/**
 * Use LLM to extract featured artist names, then find excerpts from actual text
 */
async function extractFeaturedArtists(
  title: string,
  htmlContent: string,
  anthropicApiKey: string
): Promise<FeaturedArtist[]> {
  const { paragraphs, plainText } = getMainContentParagraphs(htmlContent)
  const truncatedText = plainText.slice(0, 2000)

  const prompt = `You are extracting featured artist names from a music newsletter review.

Title: ${title}

Content (review section only, not concert listings):
${truncatedText}

Instructions:
- Extract ONLY the main artists being reviewed/featured in this article (usually 1-3)
- These are the artists the article is ABOUT, not artists mentioned in passing
- Do NOT include band members mentioned by name (e.g., "Jason Smith played drums")
- Do NOT include artists from a concert listings section
- Return artist/band names exactly as they appear in the text

Respond with ONLY a JSON array of artist names, like: ["Artist One", "Artist Two"]
If no clear featured artists, return: []`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('LLM API error:', response.status, await response.text())
      return []
    }

    const data = (await response.json()) as { content: Array<{ text: string }> }
    const text = data.content[0]?.text || '[]'

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return []
    }

    const artistNames = JSON.parse(jsonMatch[0]) as string[]

    return artistNames.map((name) => ({
      name,
      excerpt: findExcerptForArtist(name, paragraphs),
    }))
  } catch (error) {
    console.error('Error calling LLM:', error)
    return []
  }
}

/**
 * Match artist names to database records
 */
async function matchArtistToDatabase(
  prisma: PrismaClient,
  artistName: string
): Promise<string | null> {
  // Try exact match first
  let artist = await prisma.artist.findFirst({
    where: { name: { equals: artistName, mode: 'insensitive' } },
  })

  // Try contains match if no exact match
  if (!artist) {
    artist = await prisma.artist.findFirst({
      where: { name: { contains: artistName, mode: 'insensitive' } },
    })
  }

  // Try partial match - search term appears in artist name or vice versa
  if (!artist && artistName.length > 3) {
    // Search for artists whose names might partially match
    const searchTerms = artistName.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    if (searchTerms.length > 0) {
      const candidates = await prisma.artist.findMany({
        where: {
          OR: searchTerms.map(term => ({
            name: { contains: term, mode: 'insensitive' as const },
          })),
        },
        take: 20,
      })
      // Find best match where one name contains the other
      artist =
        candidates.find(
          (a) =>
            a.name.toLowerCase().includes(artistName.toLowerCase()) ||
            artistName.toLowerCase().includes(a.name.toLowerCase())
        ) || null
    }
  }

  return artist?.id || null
}

/**
 * Scrape Freakscene and save reviews to database
 */
export async function scrapeFreakscene(
  prisma: PrismaClient,
  anthropicApiKey: string
): Promise<{ newReviews: number; artistMatches: number }> {
  console.log('Fetching Freakscene RSS feed...')
  const rssItems = await fetchRSS()
  console.log(`Found ${rssItems.length} articles in RSS feed`)

  // Get or create the review source
  let source = await prisma.reviewSource.findUnique({
    where: { slug: 'freakscene' },
  })

  if (!source) {
    source = await prisma.reviewSource.create({
      data: {
        name: 'Freakscene',
        slug: 'freakscene',
        feedUrl: RSS_URL,
        type: 'buttondown',
      },
    })
  }

  let newReviews = 0
  let artistMatches = 0

  for (const item of rssItems) {
    // Check if we already have this review
    const existingReview = await prisma.review.findUnique({
      where: { url: item.url },
    })

    if (existingReview) {
      continue
    }

    // Extract featured artists
    const featuredArtists = await extractFeaturedArtists(item.title, item.content, anthropicApiKey)

    if (featuredArtists.length === 0) {
      continue
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        sourceId: source.id,
        url: item.url,
        title: item.title,
        excerpt: featuredArtists[0]?.excerpt || null,
        publishedAt: item.publishedAt,
      },
    })
    newReviews++

    // Match and link artists
    for (const featured of featuredArtists) {
      const artistId = await matchArtistToDatabase(prisma, featured.name)

      if (artistId) {
        await prisma.artistReview.create({
          data: {
            artistId,
            reviewId: review.id,
          },
        })
        artistMatches++
        console.log(`  Matched "${featured.name}" to artist in database`)
      }
    }
  }

  // Update last fetched time
  await prisma.reviewSource.update({
    where: { id: source.id },
    data: { lastFetchedAt: new Date() },
  })

  return { newReviews, artistMatches }
}
