import prisma from '../server/utils/prisma'

async function main() {
  // Find users with recommendations enabled
  const users = await prisma.user.findMany({
    where: { enableRecommendations: true },
    select: { 
      id: true, 
      email: true, 
      regionId: true,
      lastRecommendationSent: true,
      enableRecommendations: true
    }
  })
  
  console.log('Users with recommendations enabled:', users.length)
  
  for (const user of users) {
    console.log(`\n${user.email}:`)
    console.log(`  id: ${user.id}`)
    console.log(`  regionId: ${user.regionId}`)
    console.log(`  lastRecommendationSent: ${user.lastRecommendationSent}`)
    
    if (user.regionId) {
      const region = await prisma.region.findUnique({
        where: { id: user.regionId },
        select: { name: true }
      })
      console.log(`  region name: ${region?.name}`)
    }
  }
  
  await prisma.$disconnect()
}

main()
