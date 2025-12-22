/**
 * Find potential duplicate artists in the database
 *
 * Usage:
 *   npx tsx scripts/find-duplicate-artists.ts [--threshold 0.8] [--limit 100] [--json]
 *
 * Options:
 *   --threshold  Minimum similarity score (0-1, default 0.8)
 *   --limit      Maximum pairs to return (default 100)
 *   --json       Output as JSON instead of table
 */

import { prisma } from '../server/utils/prisma'

// Inline similarity functions to avoid module resolution issues
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = []

  for (let i = 0; i <= m; i++) {
    dp[i] = []
    for (let j = 0; j <= n; j++) {
      dp[i]![j] = 0
    }
  }

  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
      }
    }
  }

  return dp[m]![n]!
}

function similarityScore(str1: string, str2: string): number {
  const s1 = normalizeForComparison(str1)
  const s2 = normalizeForComparison(str2)

  if (s1 === s2) return 1.0

  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  if (longer.length === 0) return 1.0

  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}


interface DuplicatePair {
  artist1: {
    id: string
    name: string
    eventCount: number
    spotifyId: string | null
  }
  artist2: {
    id: string
    name: string
    eventCount: number
    spotifyId: string | null
  }
  similarity: number
}

async function findDuplicates(threshold: number, limit: number): Promise<DuplicatePair[]> {
  console.log(`Fetching all artists...`)

  const artists = await prisma.artist.findMany({
    select: {
      id: true,
      name: true,
      spotifyId: true,
      spotifyMatchStatus: true,
      _count: {
        select: { eventArtists: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  console.log(`Found ${artists.length} artists. Comparing for duplicates...`)

  const duplicates: DuplicatePair[] = []

  for (let i = 0; i < artists.length && duplicates.length < limit; i++) {
    const artist1 = artists[i]!

    // Progress indicator
    if (i % 100 === 0) {
      process.stdout.write(`\rProgress: ${i}/${artists.length} (${duplicates.length} duplicates found)`)
    }

    for (let j = i + 1; j < artists.length && duplicates.length < limit; j++) {
      const artist2 = artists[j]!

      // Quick pre-filter: skip if names are very different lengths
      const lenDiff = Math.abs(artist1.name.length - artist2.name.length)
      const maxLen = Math.max(artist1.name.length, artist2.name.length)
      if (lenDiff > maxLen * 0.4) continue

      // Skip if both have different verified Spotify IDs
      if (
        artist1.spotifyId &&
        artist2.spotifyId &&
        artist1.spotifyId !== artist2.spotifyId &&
        artist1.spotifyMatchStatus === 'VERIFIED' &&
        artist2.spotifyMatchStatus === 'VERIFIED'
      ) {
        continue
      }

      const similarity = similarityScore(artist1.name, artist2.name)

      if (similarity >= threshold) {
        duplicates.push({
          artist1: {
            id: artist1.id,
            name: artist1.name,
            eventCount: artist1._count.eventArtists,
            spotifyId: artist1.spotifyId,
          },
          artist2: {
            id: artist2.id,
            name: artist2.name,
            eventCount: artist2._count.eventArtists,
            spotifyId: artist2.spotifyId,
          },
          similarity,
        })
      }
    }
  }

  console.log(`\rProgress: ${artists.length}/${artists.length} - Complete!`)

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity)

  return duplicates
}

function printTable(duplicates: DuplicatePair[]) {
  console.log('\n' + '='.repeat(100))
  console.log('POTENTIAL DUPLICATE ARTISTS')
  console.log('='.repeat(100))

  if (duplicates.length === 0) {
    console.log('No potential duplicates found.')
    return
  }

  console.log(
    'Similarity'.padEnd(12) +
    'Artist 1'.padEnd(35) +
    'Events'.padEnd(8) +
    'Artist 2'.padEnd(35) +
    'Events'
  )
  console.log('-'.repeat(100))

  for (const pair of duplicates) {
    const sim = `${Math.round(pair.similarity * 100)}%`
    const name1 = pair.artist1.name.length > 32 ? pair.artist1.name.substring(0, 32) + '...' : pair.artist1.name
    const name2 = pair.artist2.name.length > 32 ? pair.artist2.name.substring(0, 32) + '...' : pair.artist2.name
    const spotify1 = pair.artist1.spotifyId ? ' [S]' : ''
    const spotify2 = pair.artist2.spotifyId ? ' [S]' : ''

    console.log(
      sim.padEnd(12) +
      (name1 + spotify1).padEnd(35) +
      String(pair.artist1.eventCount).padEnd(8) +
      (name2 + spotify2).padEnd(35) +
      String(pair.artist2.eventCount)
    )
  }

  console.log('-'.repeat(100))
  console.log(`Total: ${duplicates.length} potential duplicate pairs`)
  console.log('[S] = Has Spotify match')
  console.log('\nTo merge duplicates, use: POST /api/admin/artists/:sourceId/merge { targetArtistId }')
}

async function main() {
  const args = process.argv.slice(2)
  const thresholdIdx = args.indexOf('--threshold')
  const limitIdx = args.indexOf('--limit')
  const jsonOutput = args.includes('--json')

  const threshold = thresholdIdx >= 0 ? parseFloat(args[thresholdIdx + 1] || '0.8') : 0.8
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '100', 10) : 100

  console.log(`\nFinding duplicate artists (threshold: ${threshold}, limit: ${limit})...\n`)

  try {
    const duplicates = await findDuplicates(threshold, limit)

    if (jsonOutput) {
      console.log(JSON.stringify({ duplicates, count: duplicates.length }, null, 2))
    } else {
      printTable(duplicates)
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
