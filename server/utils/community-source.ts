import type { PrismaClient } from '@prisma/client'

/**
 * Get or create the community submissions source
 * Used as the canonical source for user-submitted events
 */
export async function getOrCreateCommunitySource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { slug: 'community-submissions' },
    update: {},
    create: {
      name: 'Community Submissions',
      slug: 'community-submissions',
      type: 'MANUAL',
      category: 'OTHER',
      trustScore: 0.3,
      priority: 100,
      isActive: true,
    },
  })
}
