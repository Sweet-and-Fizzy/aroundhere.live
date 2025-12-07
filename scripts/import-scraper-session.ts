/**
 * Import a scraper session from JSON export
 * Usage: npx tsx scripts/import-scraper-session.ts <json-file>
 */

import prisma from '../server/utils/prisma'

async function importSession(filePath: string) {
  const fs = await import('fs')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  console.log(`Importing session for: ${data.url}`)
  console.log(`Type: ${data.sessionType}`)
  console.log(`Score: ${(data.completenessScore * 100).toFixed(0)}%`)

  // Check if session already exists for this URL
  const existing = await prisma.agentSession.findFirst({
    where: {
      url: data.url,
      sessionType: data.sessionType,
      status: { in: ['SUCCESS', 'APPROVED'] },
    },
    orderBy: { completenessScore: 'desc' },
  })

  if (existing && existing.completenessScore >= data.completenessScore) {
    console.log(`\nSkipping: existing session has equal or better score (${(existing.completenessScore * 100).toFixed(0)}%)`)
    return
  }

  // Try to find a venue that matches this URL
  const urlHost = new URL(data.url).hostname.replace('www.', '')
  const venue = await prisma.venue.findFirst({
    where: {
      website: { contains: urlHost },
    },
  })

  if (venue) {
    console.log(`Found venue: ${venue.name} (${venue.id})`)
  } else {
    console.log(`No venue found matching ${urlHost}`)
  }

  // Create the session
  const session = await prisma.agentSession.create({
    data: {
      url: data.url,
      sessionType: data.sessionType,
      status: 'SUCCESS',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-20250514',
      maxIterations: 1,
      currentIteration: 1,
      generatedCode: data.generatedCode,
      completenessScore: data.completenessScore,
      venueData: data.venueData,
      eventData: data.eventData,
      venueId: venue?.id,
      thinking: [{ type: 'success', message: 'Imported from local development', timestamp: new Date().toISOString() }],
      completedAt: new Date(),
    },
  })

  console.log(`\nCreated session: ${session.id}`)
  console.log('Import complete!')
}

const filePath = process.argv[2]
if (!filePath) {
  console.log('Usage: npx tsx scripts/import-scraper-session.ts <json-file>')
  process.exit(1)
}

importSession(filePath)
  .catch(console.error)
