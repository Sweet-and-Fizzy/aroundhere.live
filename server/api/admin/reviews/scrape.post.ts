import { scrapeFreakscene } from '../../../scrapers/reviews/freakscene'

export default defineEventHandler(async (event) => {
  const prisma = event.context.prisma

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) {
    throw createError({
      statusCode: 500,
      message: 'ANTHROPIC_API_KEY not configured',
    })
  }

  const result = await scrapeFreakscene(prisma, anthropicApiKey)

  return {
    success: true,
    ...result,
  }
})
