import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const items = await prisma.event.findMany({
    where: { submittedById: userId },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      reviewStatus: true,
      createdAt: true,
      venue: {
        select: { name: true },
      },
      locationName: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return { items }
})
