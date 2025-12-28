/**
 * AI Curation Service
 *
 * Uses Claude to select top picks from scored candidates and write personalized explanations.
 * Quality over quantity - rejects weak matches.
 */

import { llmService } from '../llm'
import type { ScoredEvent, UserProfile } from './index'

export interface CuratedEvent {
  event: ScoredEvent['event']
  explanation: string
  score: number
  confidence: number
}

export interface CurationResult {
  picks: CuratedEvent[]
  tokensUsed: number
}

/**
 * Curate events using AI to select best matches and write explanations
 */
export async function curateEvents(
  candidates: ScoredEvent[],
  userProfile: UserProfile,
  options: {
    maxPicks?: number
    sectionType: 'weekend' | 'coming_up'
  }
): Promise<CurationResult> {
  const { maxPicks = 5, sectionType } = options

  if (candidates.length === 0) {
    return { picks: [], tokensUsed: 0 }
  }

  // Pre-filter to top candidates by score
  const topCandidates = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPicks * 2) // Give AI more options to choose from

  if (topCandidates.length === 0) {
    return { picks: [], tokensUsed: 0 }
  }

  const systemPrompt = buildSystemPrompt(userProfile, sectionType)
  const userPrompt = buildUserPrompt(topCandidates, maxPicks)

  try {
    const response = await llmService.complete({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
      maxTokens: 2000,
    })

    const picks = parseAIResponse(response.content, topCandidates)

    return {
      picks: picks.slice(0, maxPicks),
      tokensUsed: response.usage?.totalTokens || 0,
    }
  } catch (error) {
    console.error('[AI Curator] Error calling LLM:', error)
    // Fallback: return top candidates without AI explanations
    return {
      picks: topCandidates.slice(0, maxPicks).map((c) => ({
        event: c.event,
        explanation: c.reasons.join('. ') || 'Matches your interests',
        score: c.score,
        confidence: c.confidence,
      })),
      tokensUsed: 0,
    }
  }
}

function buildSystemPrompt(
  userProfile: UserProfile,
  sectionType: 'weekend' | 'coming_up'
): string {
  const favoriteArtistCount = userProfile.favoriteArtistIds.length
  const favoriteVenueCount = userProfile.favoriteVenueIds.length
  const favoriteGenres = userProfile.favoriteGenres

  let sectionContext = ''
  if (sectionType === 'weekend') {
    sectionContext = `These are potential weekend picks (Friday through Sunday). Focus on events that would make for a great night out.`
  } else {
    sectionContext = `These are upcoming events for the next couple weeks. Help the user plan ahead for shows they shouldn't miss.`
  }

  return `You are a local music curator helping personalize event recommendations for a music fan.

${sectionContext}

USER PROFILE:
- Has ${favoriteArtistCount} favorite artists
- Has ${favoriteVenueCount} favorite venues
- Favorite genres: ${favoriteGenres.length > 0 ? favoriteGenres.join(', ') : 'not specified'}
${userProfile.interestDescription ? `- Interests: "${userProfile.interestDescription}"` : ''}

YOUR TASK:
1. Review the scored events and select the BEST matches for this user
2. Write a brief, personalized 1-sentence explanation for each pick
3. Be selective - it's better to recommend 2-3 great matches than 5 mediocre ones
4. Skip events that don't seem like a good fit despite their score

EXPLANATION STYLE:
- Be direct and matter-of-fact, not enthusiastic or salesy
- Mention specific reasons (genre match, venue they like, similar to favorite artists)
- Be specific, not generic (avoid "this looks interesting" or "you'll love this")
- No exclamation points or hype words like "amazing", "incredible", "perfect"
- Max 100 characters per explanation

OUTPUT FORMAT:
Respond with a JSON array of selected events:
[
  { "eventId": "...", "explanation": "..." },
  { "eventId": "...", "explanation": "..." }
]

Only include events you genuinely think the user would enjoy.`
}

function buildUserPrompt(candidates: ScoredEvent[], maxPicks: number): string {
  const eventsText = candidates
    .map((c, i) => {
      const artists = c.event.artists.map((a) => a.name).join(', ')
      const venue = c.event.venue?.name || 'Unknown venue'
      const genres = c.event.canonicalGenres.join(', ') || 'No genres listed'
      const date = new Date(c.event.startsAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const reasons = c.reasons.join('; ')

      return `${i + 1}. [ID: ${c.event.id}] "${c.event.title}"
   Artists: ${artists || 'TBA'}
   Venue: ${venue}
   Date: ${date}
   Genres: ${genres}
   Score: ${c.score.toFixed(2)} | Confidence: ${c.confidence.toFixed(2)}
   Why it might fit: ${reasons || 'General interest match'}
   ${c.event.summary ? `Summary: ${c.event.summary.slice(0, 200)}...` : ''}`
    })
    .join('\n\n')

  return `Here are the top scored events to consider. Select up to ${maxPicks} that you think are the best fit:

${eventsText}

Remember: Quality over quantity. If only 2 events are truly good matches, just recommend those 2.`
}

function parseAIResponse(
  content: string,
  candidates: ScoredEvent[]
): CuratedEvent[] {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1].trim()
    } else {
      // Try to find raw JSON array
      const arrayMatch = content.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }

    const parsed = JSON.parse(jsonStr) as Array<{
      eventId: string
      explanation: string
    }>

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array')
    }

    // Map back to full event data
    const candidateMap = new Map(candidates.map((c) => [c.event.id, c]))

    return parsed
      .filter((item) => item.eventId && candidateMap.has(item.eventId))
      .map((item) => {
        const candidate = candidateMap.get(item.eventId)!
        return {
          event: candidate.event,
          explanation: (item.explanation || '').slice(0, 150), // Enforce max length
          score: candidate.score,
          confidence: candidate.confidence,
        }
      })
  } catch (error) {
    console.error('[AI Curator] Failed to parse AI response:', error)
    console.error('[AI Curator] Raw content:', content.slice(0, 500))

    // Fallback: return top candidates with basic explanations
    return candidates.slice(0, 5).map((c) => ({
      event: c.event,
      explanation: c.reasons.join('. ') || 'Matches your interests',
      score: c.score,
      confidence: c.confidence,
    }))
  }
}

/**
 * Batch curate for multiple sections (more efficient)
 */
export async function curateMultipleSections(
  weekendCandidates: ScoredEvent[],
  comingUpCandidates: ScoredEvent[],
  userProfile: UserProfile,
  maxPicksPerSection = 5
): Promise<{
  weekend: CuratedEvent[]
  comingUp: CuratedEvent[]
  tokensUsed: number
}> {
  // Run both curations in parallel
  const [weekendResult, comingUpResult] = await Promise.all([
    curateEvents(weekendCandidates, userProfile, {
      maxPicks: maxPicksPerSection,
      sectionType: 'weekend',
    }),
    curateEvents(comingUpCandidates, userProfile, {
      maxPicks: maxPicksPerSection,
      sectionType: 'coming_up',
    }),
  ])

  return {
    weekend: weekendResult.picks,
    comingUp: comingUpResult.picks,
    tokensUsed: weekendResult.tokensUsed + comingUpResult.tokensUsed,
  }
}
