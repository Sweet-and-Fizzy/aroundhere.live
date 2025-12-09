import anthropic from '../../utils/anthropic'
import type {
  ClassificationInput,
  ClassificationResult,
  CanonicalGenre,
  EventType,
} from './types'
import { CANONICAL_GENRES, EVENT_TYPES } from './types'
import { CLASSIFICATION_SYSTEM_PROMPT, buildClassificationPrompt } from './prompts'

const MODEL = process.env.CLASSIFIER_MODEL || 'claude-3-5-haiku-20241022'

export class EventClassifier {
  /**
   * Classify a batch of events using Claude
   */
  async classifyBatch(events: ClassificationInput[]): Promise<ClassificationResult[]> {
    if (events.length === 0) return []

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildClassificationPrompt(events),
          },
        ],
      })

      // Extract text content from response
      const textContent = response.content.find((c) => c.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response')
      }

      // Parse JSON response (handle potential markdown code blocks)
      let jsonText = textContent.text.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }

      const results = JSON.parse(jsonText) as ClassificationResult[]
      return results.map((r) => this.validateResult(r))
    } catch (error) {
      console.error('[Classifier] Error calling Claude API:', error)
      throw error
    }
  }

  /**
   * Validate and sanitize a classification result
   */
  private validateResult(raw: Partial<ClassificationResult>): ClassificationResult {
    const isMusic = typeof raw.isMusic === 'boolean' ? raw.isMusic : true

    const eventType = EVENT_TYPES.includes(raw.eventType as EventType)
      ? (raw.eventType as EventType)
      : 'MUSIC'

    const canonicalGenres = (raw.canonicalGenres || [])
      .filter((g): g is CanonicalGenre => CANONICAL_GENRES.includes(g as CanonicalGenre))
      .slice(0, 5)

    const confidence =
      typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5

    // Validate summary - should be a non-empty string or null
    const summary = typeof raw.summary === 'string' && raw.summary.trim().length > 0
      ? raw.summary.trim().slice(0, 500) // Cap at 500 chars just in case
      : undefined

    return {
      eventId: raw.eventId || '',
      isMusic,
      eventType,
      canonicalGenres,
      confidence,
      reasoning: raw.reasoning,
      summary,
    }
  }

  /**
   * Classify events with fallback for API errors
   */
  async classifyWithFallback(events: ClassificationInput[]): Promise<ClassificationResult[]> {
    try {
      return await this.classifyBatch(events)
    } catch {
      console.error('[Classifier] API error, using fallback classification')
      // Fallback: assume music, use any matching tags
      return events.map((e) => ({
        eventId: e.id,
        isMusic: true,
        eventType: 'MUSIC' as EventType,
        canonicalGenres: this.mapTagsToGenres(e.existingTags || []),
        confidence: 0.3,
        reasoning: 'Fallback classification due to API error',
      }))
    }
  }

  /**
   * Simple rule-based mapping of tags to genres (fallback)
   */
  private mapTagsToGenres(tags: string[]): CanonicalGenre[] {
    const tagMap: Record<string, CanonicalGenre> = {
      rock: 'rock',
      indie: 'indie',
      punk: 'punk',
      metal: 'metal',
      jazz: 'jazz',
      blues: 'blues',
      folk: 'folk',
      country: 'country',
      bluegrass: 'bluegrass',
      americana: 'americana',
      'singer-songwriter': 'singer-songwriter',
      acoustic: 'singer-songwriter',
      'hip-hop': 'hip-hop',
      rap: 'hip-hop',
      'r&b': 'r-and-b',
      rnb: 'r-and-b',
      soul: 'r-and-b',
      electronic: 'electronic',
      edm: 'electronic',
      techno: 'electronic',
      classical: 'classical',
      world: 'world',
      funk: 'funk',
      reggae: 'reggae',
      ska: 'reggae',
    }

    const genres = new Set<CanonicalGenre>()
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim()
      if (tagMap[normalized]) {
        genres.add(tagMap[normalized])
      }
    }
    return Array.from(genres)
  }
}

// Export singleton instance
export const classifier = new EventClassifier()
export default classifier
