/**
 * POST /api/unsubscribe?token=
 * Turns off the weekly email. Needs no session, because mail clients call this
 * directly for one-click unsubscribe (RFC 8058).
 */
import { prisma } from '../utils/prisma'
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token'

export default defineEventHandler(async (event) => {
  const token = getQuery(event).token
  const userId = typeof token === 'string'
    ? verifyUnsubscribeToken(token, process.env.NUXT_SESSION_PASSWORD ?? '')
    : null

  if (!userId) {
    throw createError({ statusCode: 400, message: 'Invalid unsubscribe link' })
  }

  await prisma.user.updateMany({
    where: { id: userId },
    data: { enableRecommendations: false },
  })

  return { success: true }
})
