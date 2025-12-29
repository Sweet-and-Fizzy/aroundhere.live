/**
 * POST /api/user/taste-profile
 *
 * Regenerate the user's taste profile based on their current interests.
 * This builds a new embedding from favorite artists, genres, and interest description.
 */

import { buildUserTasteProfile } from '../../services/artist-profile'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string

  try {
    const result = await buildUserTasteProfile(userId)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to build taste profile',
      }
    }

    return {
      success: true,
      message: 'Taste profile updated successfully',
    }
  } catch (err) {
    console.error('Error building taste profile:', err)
    throw createError({
      statusCode: 500,
      message: 'Failed to build taste profile',
    })
  }
})
