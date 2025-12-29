import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string

  // Check if user has a taste profile embedding (not accessible via Prisma due to vector type)
  const profileCheck = await prisma.$queryRaw<Array<{ has_profile: boolean }>>`
    SELECT "tasteProfileEmbedding" IS NOT NULL as has_profile
    FROM users WHERE id = ${userId}
  `
  const hasTasteProfile = profileCheck[0]?.has_profile ?? false

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      // Profile
      email: true,
      displayName: true,
      regionId: true,
      region: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      // Notification preferences
      emailNotifications: true,
      notificationFrequency: true,
      notifyFavoriteArtists: true,
      // Recommendation preferences
      enableRecommendations: true,
      interestDescription: true,
    },
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    })
  }

  // Also fetch available regions for the dropdown
  const regions = await prisma.region.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: { name: 'asc' },
  })

  return {
    ...user,
    hasTasteProfile,
    availableRegions: regions,
  }
})
