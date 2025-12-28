/**
 * Dev utility to reset lastRecommendationSent for testing
 * POST /api/cron/reset-recommendation-sent?email=user@example.com
 */

import { verifyCronAuth } from '../../utils/cron-auth'
import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  verifyCronAuth(event)

  const query = getQuery(event)
  const email = query.email as string

  if (!email) {
    throw createError({
      statusCode: 400,
      message: 'email query param required',
    })
  }

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      lastRecommendationSent: true,
      tasteProfileUpdatedAt: true,
    },
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: `User ${email} not found`,
    })
  }

  console.log('Before reset:', {
    id: user.id,
    email: user.email,
    lastRecommendationSent: user.lastRecommendationSent,
    hasTasteProfile: !!user.tasteProfileUpdatedAt,
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { lastRecommendationSent: null },
  })

  return {
    success: true,
    userId: user.id,
    email: user.email,
    previousSent: user.lastRecommendationSent,
    hasTasteProfile: !!user.tasteProfileUpdatedAt,
  }
})
