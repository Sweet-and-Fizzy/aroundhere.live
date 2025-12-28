/**
 * Cron endpoint for building taste profiles for users with interest descriptions
 * POST /api/cron/build-taste-profiles
 *
 * This handles users who have interestDescription but no favorite artists.
 * The main recompute-taste-profiles job only handles users with favorite artists.
 *
 * Query params:
 *   limit: max users to process (default: 100)
 *   dryRun: 'true' to preview without updating
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { prisma } from '../../utils/prisma'
import { buildUserTasteProfile } from '../../services/artist-profile'

export default defineEventHandler(async (event) => {
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
    // Find users who have interestDescription but no tasteProfileEmbedding
    // These are users who set interests but never got a taste profile built
    const users = await prisma.$queryRaw<Array<{
      id: string
      email: string
    }>>`
      SELECT id, email FROM users
      WHERE "interestDescription" IS NOT NULL
        AND "tasteProfileEmbedding" IS NULL
        AND "enableRecommendations" = true
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `

    console.log(`[Build Taste Profiles] Found ${users.length} users needing profiles`)

    for (const user of users) {
      results.usersProcessed++

      if (dryRun) {
        console.log(`[Dry Run] Would build taste profile for ${user.email}`)
        results.profilesUpdated++
        continue
      }

      try {
        const result = await buildUserTasteProfile(user.id)

        if (result.success) {
          results.profilesUpdated++
          console.log(`[Build Taste Profile] Built for ${user.email}`)
        } else {
          results.skipped++
          console.log(`[Build Taste Profile] Skipped ${user.email}: ${result.error}`)
        }
      } catch (err) {
        results.errors++
        const errorMsg = `Error for ${user.email}: ${err instanceof Error ? err.message : 'Unknown error'}`
        results.errorDetails.push(errorMsg)
        console.error(`[Build Taste Profile] ${errorMsg}`)
      }
    }

    console.log(`[Build Taste Profiles] Completed: ${results.profilesUpdated} built, ${results.skipped} skipped, ${results.errors} errors`)

    return {
      success: true,
      dryRun,
      duration: Date.now() - start,
      results,
    }
  } catch (error) {
    console.error('[Build Taste Profiles] Fatal error:', error)
    return {
      success: false,
      dryRun,
      duration: Date.now() - start,
      results,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})
