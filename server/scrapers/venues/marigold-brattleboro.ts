import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'
import * as cheerio from 'cheerio'

/**
 * Scraper for Marigold Brattleboro - Same site as Marigold Theater but different category
 *
 * The site uses WonderPlugin Grid Gallery with a "brattleboro" category tag.
 * Events are displayed in a grid/gallery format.
 */

export const marigoldBrattleboroConfig: ScraperConfig = {
  id: 'marigold-brattleboro',
  name: 'Marigold Brattleboro',
  venueSlug: 'marigold-brattleboro',
  url: 'https://marigold.org/',
  enabled: true,
  schedule: '0 6 * * *',
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  defaultAgeRestriction: 'ALL_AGES',
}

export class MarigoldBrattleboroScraper extends PlaywrightScraper {
  constructor() {
    super(marigoldBrattleboroConfig)
  }

  protected async waitForContent(): Promise<void> {
    if (!this.page) return

    // Wait for WonderPlugin Grid Gallery to load (JS-rendered)
    try {
      await this.page.waitForSelector('.wonderplugin-gridgallery-item, .wonderplugin-gridgallery-list', {
        timeout: 10000,
      })
      // Wait a bit more for gallery to fully initialize
      await this.page.waitForTimeout(2000)
    } catch {
      // If specific selectors don't appear, wait for general content
      await this.page.waitForTimeout(3000)
    }
  }

  protected async parseEvents(_html: string): Promise<ScrapedEvent[]> {
    if (!this.page) {
      return []
    }

    const events: ScrapedEvent[] = []

    // Wait for gallery to load
    await this.page.waitForSelector('.wonderplugin-gridgallery-item', { timeout: 10000 })

    // Click on "Brattleboro Events" category to filter
    try {
      const brattleboroTag = await this.page.$('.wonderplugin-gridgallery-tag[data-slug="brattleboro"]')
      if (brattleboroTag) {
        await brattleboroTag.click()
        await this.page.waitForTimeout(1500) // Wait for gallery to filter
        console.log(`[${this.config.name}] Clicked Brattleboro Events tab`)
      } else {
        console.log(`[${this.config.name}] Could not find Brattleboro Events tab`)
        return []
      }
    } catch (error) {
      console.log(`[${this.config.name}] Error selecting Brattleboro category:`, error)
      return []
    }

    // Extract events from gallery items
    const galleryEvents = await this.page.evaluate(() => {
      const events: Array<{
        href: string
        dateTitle: string
        description: string
        imageUrl?: string
      }> = []
      const items = document.querySelectorAll('.wonderplugin-gridgallery-item')

      items.forEach((item) => {
        // Only process visible items (not hidden by category filter)
        const style = window.getComputedStyle(item)
        if (style.display === 'none') return

        // Only get items from "brattleboro" category
        const category = item.getAttribute('data-category')
        if (category && category !== 'brattleboro') return

        const link = item.querySelector('a')
        if (!link) return

        const href = link.getAttribute('href')
        const dataTitle = link.getAttribute('data-title') // e.g., "SAT NOV 22"
        const dataDescription = link.getAttribute('data-description') || ''
        const img = item.querySelector('img')
        const imageUrl = img?.getAttribute('src') || undefined

        // Also get caption title
        const captionTitle = item.querySelector('.wonderplugin-gridgallery-item-caption-title')?.textContent?.trim()
        const finalDateTitle = dataTitle || captionTitle || ''

        if (
          href &&
          !href.includes('/wp-content/') &&
          !href.match(/\.(jpg|png|gif|webp)$/i) &&
          !href.endsWith('/events') &&
          !href.endsWith('/events/') &&
          href !== 'https://marigold.org/events' &&
          finalDateTitle &&
          finalDateTitle.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)\s+\d{1,2}/i)
        ) {
          events.push({
            href,
            dateTitle: finalDateTitle,
            description: dataDescription,
            imageUrl,
          })
        }
      })

      return events
    })

    console.log(`[${this.config.name}] Found ${galleryEvents.length} gallery events`)

    // Parse events from gallery data
    for (const galleryEvent of galleryEvents) {
      const event = await this.parseGalleryEvent(galleryEvent)
      if (event) {
        events.push(event)
      }
    }

    return events
  }

  private async parseGalleryEvent(galleryEvent: { href: string; dateTitle: string; description: string; imageUrl?: string }): Promise<ScrapedEvent | null> {
    try {
      // Clean HTML tags from dateTitle
      const cleanDateTitle = galleryEvent.dateTitle.replace(/<[^>]+>/g, '').trim()

      // Parse date from title like "SAT NOV 22" or "FRI NOV 21" or "THU SEPT 25"
      const dateMatch = cleanDateTitle.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)\s+(\d{1,2})/i)
      if (!dateMatch) {
        console.log(`[${this.config.name}] Could not parse date from: ${cleanDateTitle}`)
        return null
      }

      const monthNames: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
      }
      const monthStr = dateMatch[1].toLowerCase().slice(0, 3)
      const month = monthNames[monthStr]
      if (month === undefined) {
        console.log(`[${this.config.name}] Invalid month: ${monthStr}`)
        return null
      }

      const day = parseInt(dateMatch[2], 10)
      if (isNaN(day) || day < 1 || day > 31) {
        console.log(`[${this.config.name}] Invalid day: ${dateMatch[2]}`)
        return null
      }

      // Try to extract year from multiple sources
      let year: number | null = null

      // 1. Check description for year (2024, 2025, 2026, etc.)
      const descriptionText = galleryEvent.description.replace(/<[^>]+>/g, ' ')
      const yearMatch = descriptionText.match(/\b(20[2-9]\d)\b/)
      if (yearMatch) {
        const foundYear = parseInt(yearMatch[1], 10)
        if (foundYear >= 2020 && foundYear <= 2030) {
          year = foundYear
        }
      }

      // 2. Check image URL for year (e.g., /2025/09/ in upload path)
      if (!year && galleryEvent.imageUrl) {
        const imageYearMatch = galleryEvent.imageUrl.match(/\/(\d{4})\//)
        if (imageYearMatch) {
          const foundYear = parseInt(imageYearMatch[1], 10)
          if (foundYear >= 2020 && foundYear <= 2030) {
            year = foundYear
          }
        }
      }

      // If no year found, use current year and apply logic
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth()
      const currentDay = now.getDate()

      if (!year) {
        year = currentYear

        if (month < currentMonth || (month === currentMonth && day < currentDay)) {
          const testDateThisYear = this.createDateInTimezone(currentYear, month, day, 20, 0)
          const daysAgo = (now.getTime() - testDateThisYear.getTime()) / (1000 * 60 * 60 * 24)

          if (daysAgo > 90 && currentMonth >= 10) {
            year = currentYear + 1
          }
        }
      }

      // Create test date to validate
      const testDate = this.createDateInTimezone(year, month, day, 20, 0)
      const monthsAway = (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)

      if (monthsAway > 14) {
        year = currentYear
      }

      // Default to 8 PM for evening events
      const startsAt = this.createDateInTimezone(year, month, day, 20, 0)

      // Skip past events
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const eventDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate())
      if (eventDate < today) {
        console.log(`[${this.config.name}] Skipping past event: ${cleanDateTitle}`)
        return null
      }

      // Extract title from description, cleaning HTML
      let title = galleryEvent.description
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()

      // Store description for later use
      let description = galleryEvent.description
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()

      // Check if title looks like a URL slug (all lowercase, no spaces, single word)
      const looksLikeSlug = title && /^[a-z0-9]+$/.test(title.toLowerCase().replace(/\s/g, ''))

      if (!title || title.length < 5 || looksLikeSlug) {
        // Title is missing or looks like a URL slug - mark it for fetching from page
        const urlMatch = galleryEvent.href.match(/\/([^/]+)\/?$/)
        if (urlMatch) {
          // For now, use a formatted slug as fallback
          // The real title will be fetched from the page below
          title = urlMatch[1]
            // Insert space before uppercase letters (camelCase)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            // Replace hyphens and underscores with spaces
            .replace(/[-_]+/g, ' ')
            // Capitalize first letter of each word
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim()
        } else {
          title = cleanDateTitle
        }
      } else {
        // Clean up description - take first line or first 100 chars for title
        // But keep | separators for multi-artist shows in title
        const firstLine = title.split('\n')[0].trim()
        // If it has multiple artists separated by |, keep them
        if (firstLine.includes('|')) {
          const parts = firstLine.split('|').map(p => p.trim())
          // Take up to 2-3 artists for the title
          title = parts.slice(0, 3).join(' | ').slice(0, 100)
        } else {
          title = firstLine.slice(0, 100)
        }
      }

      if (!description || description.length < 10) {
        description = undefined
      }

      // Generate stable event ID with brattleboro prefix
      const dateStr = startsAt.toISOString().split('T')[0]
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
      const sourceEventId = `marigold-brattleboro-${dateStr}-${titleSlug}`

      // Normalize URL
      const sourceUrl = galleryEvent.href.startsWith('http')
        ? galleryEvent.href
        : `https://marigold.org${galleryEvent.href}`

      // Always fetch from event page to get proper title and description
      // The gallery data often has poor/missing information
      let finalDescription = description
      try {
        const response = await fetch(galleryEvent.href, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const html = await response.text()
          const $ = cheerio.load(html)

          // Primary source: page <title> tag - most reliable
          // Format: "Event Name – Marigold" or "Event Name - Marigold"
          const pageTitle = $('title').text().trim()
          const titleMatch = pageTitle.match(/^(.+?)\s*[–-]\s*Marigold$/i)
          if (titleMatch && titleMatch[1].length > 3) {
            title = titleMatch[1].trim()
          }

          // Fallback: Extract presenter from h3 (e.g., "HARBINGER PRESENTS:")
          let presenter = ''
          const h3Elements = $('h3')
          h3Elements.each((_, el) => {
            const text = $(el).text().trim()
            if (text.match(/presents/i) || text.match(/:/)) {
              presenter = text.replace(/:$/, '').trim()
            }
          })

          // If no title from page title, try h2 (main lineup/event title)
          if (!title || title.length < 3) {
            const h2Title = $('h2').first().text().trim()
            if (h2Title && h2Title.length > 3) {
              title = h2Title
              // Add presenter prefix if found
              if (presenter && !title.toLowerCase().includes(presenter.toLowerCase())) {
                title = `${presenter}: ${title}`
              }
            }
          }

          // Parse structured data from emoji-prefixed paragraphs
          const structuredData: {
            date?: string
            location?: string
            barHours?: string
            doorTime?: string
            showTime?: string
            price?: string
            ageRestriction?: string
          } = {}

          // Find paragraphs with emoji-structured data
          $('p').each((_, el) => {
            const html = $(el).html() || ''
            const text = $(el).text().trim()

            // Split by <br> tags to get individual lines
            const lines = html.split(/<br\s*\/?>/i).map(line =>
              cheerio.load(`<span>${line}</span>`)('span').text().trim()
            )

            for (const line of lines) {
              if (line.startsWith('📅') || line.match(/^🗓️/)) {
                structuredData.date = line.replace(/^[📅🗓️]\s*/, '').trim()
              } else if (line.startsWith('📍')) {
                structuredData.location = line.replace(/^📍\s*/, '').trim()
              } else if (line.startsWith('🍸') || line.startsWith('☕')) {
                structuredData.barHours = line.replace(/^[🍸☕]\s*/, '').trim()
              } else if (line.startsWith('🎶') || line.match(/doors?:/i)) {
                // Parse "Doors: 7pm | Music: 8pm" or similar
                const doorMatch = line.match(/doors?:?\s*(\d+(?::\d+)?\s*(?:am|pm)?)/i)
                const showMatch = line.match(/(?:music|show):?\s*(\d+(?::\d+)?\s*(?:am|pm)?)/i)
                if (doorMatch) structuredData.doorTime = doorMatch[1]
                if (showMatch) structuredData.showTime = showMatch[1]
              } else if (line.startsWith('🎟') || line.match(/^\$\d+/)) {
                structuredData.price = line.replace(/^🎟\s*/, '').trim()
              } else if (line.match(/^21\+|^18\+|all\s*ages/i)) {
                structuredData.ageRestriction = line.trim()
              }
            }
          })

          // Collect artist descriptions (h3 headers followed by paragraphs)
          const artistDescriptions: string[] = []
          let currentArtist = ''

          // Find all h3 elements that look like artist names (not "presents")
          $('h3').each((_, el) => {
            const text = $(el).text().trim()
            if (!text.match(/presents/i) && text.length > 2 && text.length < 100) {
              currentArtist = text

              // Get following paragraph(s) as description
              const nextP = $(el).next('p')
              if (nextP.length) {
                const desc = nextP.text().trim()
                if (desc.length > 20 && !desc.startsWith('📅') && !desc.startsWith('📍')) {
                  artistDescriptions.push(`**${currentArtist}**: ${desc}`)
                }
              }
            }
          })

          // Also look for standalone paragraphs that are descriptions
          const descriptionParts: string[] = []
          $('p').each((_, el) => {
            const text = $(el).text().trim()
            // Skip emoji-prefixed lines and short text
            if (text.length > 80 &&
                !text.startsWith('📅') &&
                !text.startsWith('📍') &&
                !text.startsWith('🍸') &&
                !text.startsWith('☕') &&
                !text.startsWith('🎶') &&
                !text.startsWith('🎟') &&
                !text.match(/^21\+|^18\+/)) {
              // Check if this paragraph is already captured as artist description
              const isArtistDesc = artistDescriptions.some(ad => ad.includes(text.slice(0, 50)))
              if (!isArtistDesc) {
                descriptionParts.push(text)
              }
            }
          })

          // Build final description
          const descParts: string[] = []

          // Add structured info
          if (structuredData.price) {
            descParts.push(`Tickets: ${structuredData.price}`)
          }
          if (structuredData.doorTime || structuredData.showTime) {
            const times = []
            if (structuredData.doorTime) times.push(`Doors: ${structuredData.doorTime}`)
            if (structuredData.showTime) times.push(`Show: ${structuredData.showTime}`)
            descParts.push(times.join(' | '))
          }

          // Add artist descriptions
          if (artistDescriptions.length > 0) {
            descParts.push('')
            descParts.push(...artistDescriptions)
          } else if (descriptionParts.length > 0) {
            // Fall back to general paragraphs
            descParts.push('')
            descParts.push(...descriptionParts.slice(0, 3))
          }

          if (descParts.length > 0) {
            finalDescription = descParts.join('\n\n').substring(0, 1500)
          }

          console.log(`[${this.config.name}] Extracted from page: "${title}"`)
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.log(`[${this.config.name}] Could not fetch from ${galleryEvent.href}:`, error)
      }

      // Ensure title is not undefined or empty
      if (!title || title.length < 2) {
        const urlMatch = galleryEvent.href.match(/\/([^/]+)\/?$/)
        if (urlMatch) {
          title = urlMatch[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        } else {
          title = cleanDateTitle || 'Event'
        }
      }

      return {
        title,
        description: finalDescription || undefined,
        imageUrl: galleryEvent.imageUrl,
        startsAt,
        sourceUrl,
        sourceEventId,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing gallery event:`, error)
      return null
    }
  }
}
