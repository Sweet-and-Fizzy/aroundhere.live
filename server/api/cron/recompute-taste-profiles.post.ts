/**
 * Cron endpoint for recomputing user taste profiles
 * POST /api/cron/recompute-taste-profiles
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Query params:
 *   limit: max users to process (default: 100)
 *   dryRun: 'true' to preview without updating
 *
 * Recommended crontab:
 *   Nightly at 2am: 0 2 * * * curl -sX POST "http://localhost:3000/api/cron/recompute-taste-profiles?token=$CRON_SECRET"
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { prisma } from '../../utils/prisma'
import { buildUserTasteProfileImmediate } from '../../services/artist-profile'

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 100, 500)
  const dryRun = query.dryRun === 'true'

  const start = Date.now()
  const results = {
    usersProcessed: 0,
    profilesUpdated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [] as string[],
  }

  try {
    // Find users who need taste profile updates:
    // 1. Have recommendations enabled
    // 2. Have at least one favorite artist
    // 3. Either have no taste profile, or favorites changed since last update
    const users = await prisma.$queryRaw<Array<{
      id: string
      email: string
      lastFavoriteChange: Date | null
      tasteProfileUpdatedAt: Date | null
      favoriteCount: bigint
    }>>`
      SELECT
        u.id,
        u.email,
        (
          SELECT MAX(fa."createdAt")
          FROM user_favorite_artists fa
          WHERE fa."userId" = u.id
        ) as "lastFavoriteChange",
        u."tasteProfileUpdatedAt",
        (
          SELECT COUNT(*)
          FROM user_favorite_artists fa
          WHERE fa."userId" = u.id
        ) as "favoriteCount"
      FROM users u
      WHERE u."enableRecommendations" = true
        AND EXISTS (
          SELECT 1 FROM user_favorite_artists fa WHERE fa."userId" = u.id
        )
        AND (
          u."tasteProfileUpdatedAt" IS NULL
          OR u."tasteProfileUpdatedAt" < (
            SELECT MAX(fa."createdAt")
            FROM user_favorite_artists fa
            WHERE fa."userId" = u.id
          )
          OR u."interestDescription" IS NOT NULL AND u."interestEmbedding" IS NULL
        )
      ORDER BY u."tasteProfileUpdatedAt" ASC NULLS FIRST
      LIMIT ${limit}
    `

    console.log(`[Taste Profile Recompute] Found ${users.length} users needing updates`)

    for (const user of users) {
      results.usersProcessed++

      if (dryRun) {
        console.log(`[Dry Run] Would update taste profile for ${user.email} (${Number(user.favoriteCount)} favorites)`)
        results.profilesUpdated++
        continue
      }

      try {
        const result = await buildUserTasteProfileImmediate(user.id)

        if (result.success) {
          results.profilesUpdated++
          console.log(`[Taste Profile] Updated ${user.email} (${result.artistCount} artist embeddings used)`)
        } else {
          results.skipped++
          console.log(`[Taste Profile] Skipped ${user.email}: ${result.error}`)
        }
      } catch (err) {
        results.errors++
        const errorMsg = `Error for ${user.email}: ${err instanceof Error ? err.message : 'Unknown error'}`
        results.errorDetails.push(errorMsg)
        console.error(`[Taste Profile] ${errorMsg}`)
      }

      // Small delay to avoid overwhelming the embedding API
      await sleep(100)
    }

    console.log(`[Taste Profile Recompute] Completed: ${results.profilesUpdated} updated, ${results.skipped} skipped, ${results.errors} errors`)

    return {
      success: true,
      dryRun,
      duration: Date.now() - start,
      results,
    }
  } catch (error) {
    console.error('[Taste Profile Recompute] Fatal error:', error)
    return {
      success: false,
      dryRun,
      duration: Date.now() - start,
      results,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
