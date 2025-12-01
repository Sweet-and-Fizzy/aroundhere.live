import prisma from '../utils/prisma'

export default defineEventHandler(async () => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
      },
    }
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'disconnected',
        },
      },
    })
  }
})
