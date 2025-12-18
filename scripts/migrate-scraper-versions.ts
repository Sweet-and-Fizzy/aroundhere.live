/**
 * Data migration script to populate initial ScraperVersion records
 * from existing scrapers with generatedCode in Source.config
 *
 * Run with: npx tsx scripts/migrate-scraper-versions.ts
 */

import { prisma } from '../server/utils/prisma'
import crypto from 'crypto'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

async function main() {
  console.log('🔄 Starting scraper version migration...\n')

  // Find all sources with generatedCode in config
  const sources = await prisma.source.findMany({
    where: {
      type: 'SCRAPER',
    },
    include: {
      scraperVersions: true,
    },
  })

  console.log(`Found ${sources.length} scraper sources`)

  let migrated = 0
  let skipped = 0

  for (const source of sources) {
    const config = source.config as any

    // Skip if no generated code
    if (!config?.generatedCode) {
      console.log(`⏭️  Skipping ${source.name} (no generatedCode)`)
      skipped++
      continue
    }

    // Skip if already has versions
    if (source.scraperVersions.length > 0) {
      console.log(`⏭️  Skipping ${source.name} (already has ${source.scraperVersions.length} version(s))`)
      skipped++
      continue
    }

    const code = config.generatedCode as string
    const codeHash = hashCode(code)
    const agentSessionId = config.agentSessionId as string | undefined

    console.log(`✨ Creating version 1 for ${source.name}`)
    console.log(`   Agent Session: ${agentSessionId || 'N/A'}`)
    console.log(`   Code length: ${code.length} characters`)

    try {
      await prisma.scraperVersion.create({
        data: {
          sourceId: source.id,
          versionNumber: 1,
          code,
          codeHash,
          description: 'Initial AI-generated scraper code',
          createdFrom: 'AI_GENERATED',
          agentSessionId,
          isActive: true,
        },
      })

      migrated++
      console.log(`   ✅ Created version 1\n`)
    } catch (error) {
      console.error(`   ❌ Error creating version for ${source.name}:`, error)
    }
  }

  console.log('\n📊 Migration Summary:')
  console.log(`   Total sources: ${sources.length}`)
  console.log(`   Migrated: ${migrated}`)
  console.log(`   Skipped: ${skipped}`)
  console.log('\n✅ Migration complete!')
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
