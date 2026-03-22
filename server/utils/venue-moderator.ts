import type { PrismaClient } from '@prisma/client'

/**
 * Check if a user is an active, verified moderator for a venue
 */
export async function isVenueModerator(
  prisma: PrismaClient,
  userId: string,
  venueId: string
): Promise<boolean> {
  const moderator = await prisma.venueModerator.findUnique({
    where: {
      venueId_userId: { venueId, userId },
    },
    select: { isActive: true, verifiedAt: true },
  })

  return !!moderator?.isActive && !!moderator?.verifiedAt
}
