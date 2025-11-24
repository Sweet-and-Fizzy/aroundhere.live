import { CANONICAL_GENRES } from './types'

export const GENRE_DESCRIPTIONS: Record<string, string> = {
  rock: 'Rock - classic rock, alternative, garage, psychedelic',
  indie: 'Indie - independent/DIY aesthetic, lo-fi, indie-pop',
  punk: 'Punk - punk, hardcore, pop-punk, emo',
  metal: 'Metal - all metal subgenres',
  jazz: 'Jazz - jazz, bebop, fusion, big-band',
  blues: 'Blues - traditional and modern blues',
  folk: 'Folk - traditional and contemporary folk, celtic',
  country: 'Country - country, western, honky-tonk',
  bluegrass: 'Bluegrass - bluegrass, newgrass, string-band',
  americana: 'Americana - roots, roots-rock',
  'singer-songwriter': 'Singer-Songwriter - acoustic, solo artists',
  'hip-hop': 'Hip-Hop - hip-hop, rap, beats',
  'r-and-b': 'R&B/Soul - r&b, soul, neo-soul, motown',
  electronic: 'Electronic - electronic, EDM, techno, house, synth',
  classical: 'Classical - orchestral, chamber, opera',
  world: 'World - non-Western traditions, afrobeat, latin, salsa',
  funk: 'Funk - funk, groove',
  reggae: 'Reggae - reggae, ska, dub, rocksteady',
}

export const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert music event classifier for a local music listings service.

Your job is to:
1. Determine if an event is a MUSIC event vs NON-MUSIC (comedy, trivia, private event, etc.)
2. Assign an event type from our enum
3. If it IS a music event, assign 1-3 relevant genres from our curated list

EVENT TYPES:
- MUSIC: Live music performance by band/artist
- DJ: DJ set, dance party (still music)
- OPEN_MIC: Open mic night (music-focused)
- COMEDY: Stand-up comedy, improv show
- THEATER: Plays, musicals, theatrical performances
- TRIVIA: Trivia night
- KARAOKE: Karaoke night (still music)
- PRIVATE: Private event, rental, closed to public
- FILM: Movie screening
- SPOKEN_WORD: Poetry readings, book readings
- OTHER: Doesn't fit other categories

MUSIC CLASSIFICATION RULES:
- TRUE for: live music, DJ sets, bands, solo artists, karaoke, music-focused open mics
- FALSE for: comedy, trivia, sports/games/leagues, poetry slams, private events, film screenings, plays (non-musical theater)
- Edge case - Open Mic: If music venue or "open mic music/jam", it's music
- Edge case - Theater: Musicals = music, plays = not music
- Edge case - "Private Event" with no details = FALSE (unknown)
- IMPORTANT: eventType should reflect what the event actually is. A trivia night should be eventType=TRIVIA and isMusic=false, even if it's at a music venue.

AVAILABLE GENRES (use these exact slugs):
${CANONICAL_GENRES.map((g) => `- ${g}: ${GENRE_DESCRIPTIONS[g]}`).join('\n')}

GENRE ASSIGNMENT RULES:
1. Most events should have 1-3 genres (rarely more than 3)
2. Be generous - if it could fit, include it
3. "Indie rock" gets both indie and rock
4. "Funk-soul" gets both funk and r-and-b
5. "Singer-songwriter with acoustic guitar" often gets: singer-songwriter, folk
6. If description mentions "bluegrass" or "string band", include bluegrass

CONFIDENCE LEVELS:
- 0.9-1.0: Very clear (explicit genre tags, well-known artist style)
- 0.7-0.9: Reasonable (good context clues)
- 0.5-0.7: Uncertain (limited information)
- Below 0.5: Very uncertain (flag for human review)

Respond with ONLY valid JSON, no markdown.`

export function buildClassificationPrompt(
  events: { id: string; title: string; description?: string | null; venueName?: string }[]
): string {
  return `Classify these events. For each, determine:
1. isMusic: true/false
2. eventType: one of the event types listed above
3. canonicalGenres: array of genre slugs (empty if not music, 1-3 if music)
4. confidence: 0.0-1.0

Events to classify:
${events
  .map(
    (e, i) => `
${i + 1}. ID: ${e.id}
   Title: ${e.title}
   Venue: ${e.venueName || 'Unknown'}
   Description: ${e.description?.slice(0, 500) || 'None provided'}
`
  )
  .join('\n')}

Respond with a JSON array:
[
  { "eventId": "...", "isMusic": true, "eventType": "MUSIC", "canonicalGenres": ["rock", "indie"], "confidence": 0.95 },
  ...
]`
}
