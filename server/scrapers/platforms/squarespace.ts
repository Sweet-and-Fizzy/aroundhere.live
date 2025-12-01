import { PlaywrightScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

/**
 * Base scraper for Squarespace-powered venue websites.
 *
 * Squarespace sites typically have:
 * - Event listing page with links to individual event pages
 * - Each event page has LD+JSON with @type: "Event"
 * - Event data includes: name, startDate, endDate, image, description, location
 *
 * Subclasses just need to provide config and optionally customize selectors.
 */
export abstract class SquarespaceScraper extends PlaywrightScraper {
  // Selector for finding event links on listing page
  protected eventLinkSelector = 'a[href*="/events/"]'

  // Path pattern for individual event pages (used to filter links)
  protected eventPathPattern = /\/events\/[a-z0-9-]+$/

  constructor(config: ScraperConfig) {
    super(config)
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    // First, collect all event page URLs from the listing
    const eventUrls = await this.collectEventUrls(html)

    console.log(`[${this.config.name}] Found ${eventUrls.length} event pages to scrape`)

    // Visit each event page and extract data from LD+JSON
    const events: ScrapedEvent[] = []

    for (const url of eventUrls) {
      try {
        const event = await this.scrapeEventPage(url)
        if (event) {
          events.push(event)
        }
      } catch (error) {
        console.error(`[${this.config.name}] Error scraping ${url}:`, error)
      }
    }

    return events
  }

  /**
   * Collect all event page URLs from the listing page HTML
   */
  protected async collectEventUrls(html: string): Promise<string[]> {
    const $ = this.$(html)
    const allUrls: string[] = []

    // Handle multiple selectors (comma-separated)
    const selectors = this.eventLinkSelector.split(',').map(s => s.trim())

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const href = $(el).attr('href')
        if (href && this.eventPathPattern.test(href)) {
          // Handle relative URLs
          const fullUrl = href.startsWith('http') ? href : new URL(href, this.config.url).toString()
          allUrls.push(fullUrl)
        }
      })
    }

    // Dedupe URLs
    return [...new Set(allUrls)]
  }

  /**
   * Visit an individual event page and extract event data from LD+JSON and page content
   */
  protected async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
    if (!this.page) return null

    await this.page.goto(url, { waitUntil: 'networkidle' })

    // Extract LD+JSON event data
    const eventData = await this.page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]')
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || '')
          if (data['@type'] === 'Event') {
            return data
          }
        } catch {
          // Continue to next script
        }
      }
      return null
    })

    if (!eventData) {
      console.log(`[${this.config.name}] No LD+JSON Event found at ${url}`)
      return null
    }

    // Extract rich content from page blocks (Squarespace stores content in sqs-block-html)
    const pageContent = await this.extractPageContent()

    return this.parseSquarespaceEvent(eventData, url, pageContent)
  }

  /**
   * Extract rich content from Squarespace page blocks
   * Returns pricing/door info and HTML description with images/videos/links
   */
  protected async extractPageContent(): Promise<{
    pricingInfo?: string
    doorsInfo?: string
    description?: string
    descriptionHtml?: string
  }> {
    if (!this.page) return {}

    // Note: All code must be inline in evaluate() to avoid __name issues with TypeScript
    return this.page.evaluate(() => {
      // Collect all content blocks in order
      const allBlocks = document.querySelectorAll(
        '.sqs-block-html, .sqs-block-image, .sqs-block-video, .sqs-block-embed'
      )

      const contentParts: { type: string; content: string; text?: string }[] = []
      let pricingInfo: string | undefined
      let doorsInfo: string | undefined
      let isFirstHtmlBlock = true

      for (const block of allBlocks) {
        const text = block.textContent?.trim() || ''

        // Skip footer content
        if (
          text.includes('Contact Us:') ||
          text.includes('Copyright ©') ||
          text.includes('Developed by')
        ) {
          continue
        }

        const blockType = block.className.match(/sqs-block-(\w+)/)?.[1] || 'unknown'

        if (blockType === 'html') {
          if (text.length < 10) continue

          // Check if first HTML block is pricing/door info
          if (isFirstHtmlBlock) {
            isFirstHtmlBlock = false
            const hasPricing = /\$\d+/.test(text)
            const hasDoors = /doors?\s+(open\s+)?at/i.test(text)
            const hasAdmission = /admission|standing|seated/i.test(text)

            if (hasPricing || hasDoors || hasAdmission) {
              // Extract pricing
              const beforeDoors = text.split(/\s*-?\s*doors/i)[0] || ''
              if (beforeDoors.includes('$')) {
                pricingInfo = beforeDoors
                  .replace(/general admission/gi, '')
                  .replace(/\(standing\)/gi, '')
                  .replace(/\(seated\)/gi, '')
                  .replace(/,\s*$/, '')
                  .replace(/\s+/g, ' ')
                  .trim()
              }

              const doorsMatch = text.match(/doors?\s+(?:open\s+)?at\s+\d+[:\d]*\s*[ap]m/i)
              if (doorsMatch) {
                doorsInfo = doorsMatch[0]
              }
              continue // Skip this block from description
            }
          }

          // Get clean HTML content (inline cleanHtml function)
          const innerHtml = block.querySelector('.sqs-html-content')?.innerHTML || block.innerHTML
          const cleanedHtml = innerHtml
            .replace(/\s*style="[^"]*"/gi, '')
            .replace(/\s*class="[^"]*"/gi, '')
            .replace(/\s*data-[a-z-]+="[^"]*"/gi, '')
            .replace(/\s*id="[^"]*"/gi, '')
            .replace(/<div>\s*<\/div>/gi, '')
            .replace(/\s+/g, ' ')
            .trim()

          contentParts.push({
            type: 'html',
            content: cleanedHtml,
            text: text,
          })
        } else if (blockType === 'image') {
          // Extract image (inline extractImageFromBlock)
          const img = block.querySelector('img')
          let imgSrc: string | null = null
          if (img) {
            imgSrc = img.getAttribute('data-src') || img.getAttribute('src')
          } else {
            const bgDiv = block.querySelector('[data-image]')
            if (bgDiv) {
              imgSrc = bgDiv.getAttribute('data-image')
            }
          }

          // Skip logo/stamp images (common patterns in filenames)
          if (imgSrc && /(?:logo|stamp|badge|icon|watermark)/i.test(imgSrc)) {
            continue
          }

          const caption = block.querySelector('.image-caption')?.textContent?.trim()
          if (imgSrc) {
            const fixedSrc = imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc
            const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : ''
            contentParts.push({
              type: 'image',
              content: `<figure><img src="${fixedSrc}" alt="${caption || ''}" loading="lazy" />${captionHtml}</figure>`,
              text: caption,
            })
          }
        } else if (blockType === 'video') {
          // Extract video (inline extractVideoFromBlock)
          const wrapper = block.querySelector('.sqs-video-wrapper')
          if (wrapper) {
            const embedHtml = wrapper.getAttribute('data-html')
            if (embedHtml) {
              const decoded = embedHtml
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
              contentParts.push({
                type: 'video',
                content: `<div class="video-embed">${decoded}</div>`,
              })
            }
          }
        }
      }

      if (contentParts.length === 0) return {}

      // Build HTML description
      const descriptionHtml = contentParts.map((p) => p.content).join('\n')

      // Build plain text description (for backwards compatibility/search)
      const description = contentParts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('\n\n')

      return {
        pricingInfo,
        doorsInfo,
        description: description || undefined,
        descriptionHtml: descriptionHtml || undefined,
      }
    })
  }

  /**
   * Parse a Squarespace LD+JSON event object into our ScrapedEvent format
   */
  protected parseSquarespaceEvent(
    data: Record<string, unknown>,
    sourceUrl: string,
    pageContent?: { pricingInfo?: string; doorsInfo?: string; description?: string; descriptionHtml?: string }
  ): ScrapedEvent | null {
    try {
      // Extract and clean title (often has " — Venue Name" suffix)
      let title = (data.name as string) || ''
      title = this.cleanSquarespaceTitle(title)
      if (!title) return null

      // Parse dates
      const startDateStr = data.startDate as string
      if (!startDateStr) return null

      const startsAt = new Date(startDateStr)
      if (isNaN(startsAt.getTime())) return null

      const endDateStr = data.endDate as string
      const endsAt = endDateStr ? new Date(endDateStr) : undefined

      // Get image - Squarespace returns array of images
      let imageUrl: string | undefined
      const images = data.image as string[] | string | undefined
      if (Array.isArray(images) && images.length > 0) {
        imageUrl = images[0]
      } else if (typeof images === 'string') {
        imageUrl = images
      }
      // Clean up Squarespace image URLs
      if (imageUrl) {
        imageUrl = this.cleanSquarespaceImageUrl(imageUrl)
      }

      // Description - prefer page content over LD+JSON (which is usually empty)
      const description =
        pageContent?.description || (data.description as string) || undefined

      // Generate stable event ID from URL slug
      const urlParts = sourceUrl.split('/')
      const slug = urlParts[urlParts.length - 1]
      const dateStr = startsAt.toISOString().split('T')[0]
      const sourceEventId = `${this.config.id}-${dateStr}-${slug}`

      // Extract offers/price - prefer page content (has richer format like "$15 adv / $20 door")
      let coverCharge: string | undefined
      if (pageContent?.pricingInfo) {
        coverCharge = pageContent.pricingInfo
      } else {
        const offers = data.offers as Record<string, unknown> | undefined
        if (offers?.price) {
          coverCharge = `$${offers.price}`
        }
      }

      // Parse door time from page content if available
      let doorsAt: Date | undefined
      if (pageContent?.doorsInfo) {
        doorsAt = this.parseDoorsTime(pageContent.doorsInfo, startsAt)
      }

      return {
        title,
        description,
        descriptionHtml: pageContent?.descriptionHtml,
        imageUrl,
        startsAt,
        endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
        doorsAt,
        sourceUrl,
        sourceEventId,
        coverCharge,
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error parsing event:`, error)
      return null
    }
  }

  /**
   * Parse door time string like "Doors open at 7PM" into a Date
   */
  protected parseDoorsTime(doorsInfo: string, eventDate: Date): Date | undefined {
    try {
      const match = doorsInfo.match(/(\d+)(?::(\d+))?\s*([ap]m)/i)
      if (!match) return undefined

      let hours = parseInt(match[1], 10)
      const minutes = match[2] ? parseInt(match[2], 10) : 0
      const isPM = match[3].toLowerCase() === 'pm'

      if (isPM && hours !== 12) hours += 12
      if (!isPM && hours === 12) hours = 0

      const doorsAt = new Date(eventDate)
      doorsAt.setHours(hours, minutes, 0, 0)
      return doorsAt
    } catch {
      return undefined
    }
  }

  /**
   * Clean Squarespace title - remove " — Venue Name" suffix
   */
  protected cleanSquarespaceTitle(title: string): string {
    // Remove " — Venue Name" pattern that Squarespace adds
    return title.replace(/\s*—\s*[^—]+$/, '').trim()
  }

  /**
   * Clean Squarespace image URLs - ensure proper protocol
   */
  protected cleanSquarespaceImageUrl(url: string): string {
    // Fix protocol-relative URLs
    if (url.startsWith('//')) {
      return `https:${url}`
    }
    // Fix Squarespace static URLs
    if (url.startsWith('http://static')) {
      return url.replace('http://', 'https://')
    }
    return url
  }
}
