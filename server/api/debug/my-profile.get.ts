/**
 * Debug endpoint to get current user's profile info
 * GET /api/debug/my-profile
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Not authenticated',
    })
  }

  const { prisma } = await import('../../utils/prisma')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      id: true,
      email: true,
      regionId: true,
      enableRecommendations: true,
      lastRecommendationSent: true,
      region: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  })

  return user
})
