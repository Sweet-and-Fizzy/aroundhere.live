import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const sourceId = getRouterParam(event, 'sourceId')
  if (!sourceId) {
    throw createError({ statusCode: 400, message: 'Source ID required' })
  }

  const body = await readBody(event)
  const { scraperMode } = body

  // Validate scraperMode
  if (scraperMode && !['auto', 'hardcoded', 'ai-generated'].includes(scraperMode)) {
    throw createError({ statusCode: 400, message: 'Invalid scraperMode' })
  }

  // Get current source
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  })

  if (!source) {
    throw createError({ statusCode: 404, message: 'Source not found' })
  }

  // Update config
  const currentConfig = (source.config as Record<string, unknown>) || {}
  const newConfig = {
    ...currentConfig,
    scraperMode: scraperMode || 'auto',
  }

  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: { config: newConfig },
  })

  return {
    success: true,
    scraperMode: (updated.config as Record<string, unknown>)?.scraperMode || 'auto',
  }
})
