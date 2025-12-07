/**
 * Initiate Spotify OAuth flow
 * Redirects to Spotify authorization page
 */

import { randomBytes } from 'crypto'
import { spotifyService } from '../../services/spotify'

export default defineEventHandler(async (event) => {
  // Check if Spotify is configured
  if (!spotifyService.isConfigured()) {
    throw createError({
      statusCode: 500,
      message: 'Spotify API credentials not configured',
    })
  }

  // Generate state for CSRF protection
  const state = randomBytes(16).toString('hex')

  // Store state in cookie for verification on callback
  setCookie(event, 'spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  // Build redirect URI
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/spotify/callback`

  // Get authorization URL and redirect
  const authUrl = spotifyService.getAuthorizationUrl(redirectUri, state)

  return sendRedirect(event, authUrl)
})
