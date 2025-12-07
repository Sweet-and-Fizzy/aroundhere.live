/**
 * Spotify OAuth callback
 * Exchanges authorization code for tokens and stores them
 */

import { spotifyService } from '../../services/spotify'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const error = query.error as string | undefined

  // Check for error from Spotify
  if (error) {
    console.error('Spotify OAuth error:', error)
    return sendRedirect(event, '/admin/spotify?error=' + encodeURIComponent(error))
  }

  // Validate required params
  if (!code || !state) {
    throw createError({
      statusCode: 400,
      message: 'Missing code or state parameter',
    })
  }

  // Verify state matches cookie
  const storedState = getCookie(event, 'spotify_oauth_state')
  if (!storedState || storedState !== state) {
    throw createError({
      statusCode: 400,
      message: 'State mismatch - possible CSRF attack',
    })
  }

  // Clear the state cookie
  deleteCookie(event, 'spotify_oauth_state')

  try {
    // Build redirect URI (must match the one used in authorize)
    const config = useRuntimeConfig()
    const baseUrl = config.public.siteUrl || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/spotify/callback`

    // Exchange code for tokens
    await spotifyService.exchangeCodeForTokens(code, redirectUri)

    // Redirect to admin page with success
    return sendRedirect(event, '/admin/spotify?success=true')
  } catch (err) {
    console.error('Failed to exchange Spotify code:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return sendRedirect(
      event,
      '/admin/spotify?error=' + encodeURIComponent(message)
    )
  }
})
