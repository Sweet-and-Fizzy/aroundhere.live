import prisma from '../../utils/prisma'
import { generateEmbedding } from '../../services/embeddings'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required',
    })
  }

  const userId = session.user.id as string
  const body = await readBody(event)

  // Validate notification frequency
  const validFrequencies = ['daily', 'weekly', 'none']
  if (body.notificationFrequency && !validFrequencies.includes(body.notificationFrequency)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid notification frequency. Must be: daily, weekly, or none',
    })
  }

  // Validate interest description length
  if (body.interestDescription && body.interestDescription.length > 500) {
    throw createError({
      statusCode: 400,
      message: 'Interest description must be 500 characters or less',
    })
  }

  const updateData: {
    displayName?: string | null
    regionId?: string | null
    emailNotifications?: boolean
    notificationFrequency?: string
    notifyFavoriteArtists?: boolean
    enableRecommendations?: boolean
    interestDescription?: string | null
  } = {}

  // Nullable string fields: convert empty strings to null
  if (body.displayName !== undefined) {
    updateData.displayName = body.displayName?.trim() || null
  }

  if (body.regionId !== undefined) {
    updateData.regionId = body.regionId || null
  }

  if (body.interestDescription !== undefined) {
    updateData.interestDescription = body.interestDescription?.trim() || null
  }

  // Enum fields: only update if value is valid (validated above)
  if (body.notificationFrequency !== undefined) {
    updateData.notificationFrequency = body.notificationFrequency || 'none'
  }

  // Boolean fields: only update if explicitly boolean
  if (typeof body.emailNotifications === 'boolean') {
    updateData.emailNotifications = body.emailNotifications
  }

  if (typeof body.notifyFavoriteArtists === 'boolean') {
    updateData.notifyFavoriteArtists = body.notifyFavoriteArtists
  }

  if (typeof body.enableRecommendations === 'boolean') {
    updateData.enableRecommendations = body.enableRecommendations
  }

  // Check if interest description changed
  const interestDescriptionChanged = body.interestDescription !== undefined

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
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
      emailNotifications: true,
      notificationFrequency: true,
      notifyFavoriteArtists: true,
      enableRecommendations: true,
      interestDescription: true,
    },
  })

  // Generate interest embedding if description was updated and is non-empty
  if (interestDescriptionChanged && user.interestDescription) {
    try {
      const embedding = await generateEmbedding(user.interestDescription)
      const embeddingStr = `[${embedding.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE users
         SET "interestEmbedding" = $1::vector
         WHERE id = $2`,
        embeddingStr,
        userId
      )
    } catch (err) {
      // Log error but don't fail the request
      console.error('Failed to generate interest embedding:', err)
    }
  }

  return user
})
