/**
 * Get Spotify integration status
 */

import { spotifyService } from '../../services/spotify'
import { prisma } from '../../utils/prisma'

export default defineEventHandler(async () => {
  const isConfigured = spotifyService.isConfigured()
  const isOAuthConfigured = await spotifyService.isOAuthConfigured()

  let authInfo = null
  if (isOAuthConfigured) {
    const auth = await prisma.spotifyAuth.findUnique({
      where: { id: 'spotify_auth' },
      select: {
        userId: true,
        scope: true,
        expiresAt: true,
        updatedAt: true,
      },
    })
    authInfo = auth
  }

  return {
    configured: isConfigured,
    oauthConfigured: isOAuthConfigured,
    auth: authInfo,
  }
})
