/**
 * Update AI Scraper Script
 *
 * Usage:
 *   npx tsx scripts/update-scraper.ts <source-slug> <code-file> [description] [--production]
 *
 * Examples:
 *   npx tsx scripts/update-scraper.ts last-ditch ./scrapers/lastditch-calendar.js "Calendar view scraper"
 *   npx tsx scripts/update-scraper.ts last-ditch ./scrapers/lastditch-calendar.js "Calendar view" --production
 *
 * The script will:
 *   1. Read the code from the specified file
 *   2. Create a new version of the scraper
 *   3. Activate it immediately
 *   4. Update the source config with the new code
 *
 * Use --production flag to update the production database via SSH
 */

import { prisma } from '../server/utils/prisma'
import crypto from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { config } from 'dotenv'

// Load environment variables
config()

const PROD_SSH_USER = process.env.PROD_SSH_USER
const PROD_SSH_HOST = process.env.PROD_SSH_HOST

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Escape string for SQL using dollar quoting to handle complex JS code
function escapeSqlDollar(str: string): { quoted: string; tag: string } {
  // Find a dollar quote tag that doesn't appear in the string
  let tag = 'code'
  let counter = 0
  while (str.includes(`$${tag}$`)) {
    tag = `code${counter}`
    counter++
  }
  return { quoted: `$${tag}$${str}$${tag}$`, tag }
}

// Simple escape for regular strings
function escapeSql(str: string): string {
  return str.replace(/'/g, "''")
}

async function updateProduction(sourceSlug: string, code: string, description: string) {
  if (!PROD_SSH_USER || !PROD_SSH_HOST) {
    console.error('Error: PROD_SSH_USER and PROD_SSH_HOST must be set in .env for --production flag')
    process.exit(1)
  }

  console.log('Updating production database via SSH...')
  console.log('')

  const codeHash = hashCode(code)
  const { quoted: quotedCode } = escapeSqlDollar(code)
  const escapedDesc = escapeSql(description)

  // Build SQL commands using DO block with dollar quoting for code
  const sql = `
DO $block$
DECLARE
  v_source_id TEXT;
  v_source_name TEXT;
  v_next_version INT;
  v_config JSONB;
BEGIN
  -- Find source
  SELECT id, name, config INTO v_source_id, v_source_name, v_config
  FROM sources WHERE slug = '${sourceSlug}' AND type = 'SCRAPER';

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Source not found: ${sourceSlug}';
  END IF;

  RAISE NOTICE 'Updating scraper: %', v_source_name;

  -- Get next version number
  SELECT COALESCE(MAX("versionNumber"), 0) + 1 INTO v_next_version
  FROM scraper_versions WHERE "sourceId" = v_source_id;

  RAISE NOTICE 'Creating version %', v_next_version;

  -- Deactivate existing versions
  UPDATE scraper_versions SET "isActive" = false
  WHERE "sourceId" = v_source_id AND "isActive" = true;

  -- Create new version
  INSERT INTO scraper_versions (
    id, "sourceId", "versionNumber", code, "codeHash",
    description, "createdFrom", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    'manual_' || v_source_id || '_v' || v_next_version,
    v_source_id,
    v_next_version,
    ${quotedCode},
    '${codeHash}',
    '${escapedDesc}',
    'MANUAL_EDIT',
    true,
    NOW(),
    NOW()
  );

  -- Update source config
  UPDATE sources SET config = jsonb_set(
    COALESCE(v_config, '{}'::jsonb),
    '{generatedCode}',
    to_jsonb(${quotedCode}::text)
  )
  WHERE id = v_source_id;

  RAISE NOTICE 'Version % created and activated', v_next_version;
END $block$;
`

  // Write SQL to temp file and pipe via SSH
  const tempFile = `/tmp/scraper-update-${Date.now()}.sql`
  const { writeFileSync, unlinkSync } = await import('fs')
  writeFileSync(tempFile, sql)

  try {
    // Copy file to server and execute
    execSync(`scp ${tempFile} ${PROD_SSH_USER}@${PROD_SSH_HOST}:/tmp/scraper-update.sql`, { encoding: 'utf-8' })
    const result = execSync(
      `ssh ${PROD_SSH_USER}@${PROD_SSH_HOST} "docker exec -i aroundhere-db psql -U postgres -d local_music < /tmp/scraper-update.sql && rm /tmp/scraper-update.sql"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )
    console.log(result)
    console.log('✓ Production database updated')
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string }
    console.error('Failed to update production:', err.stderr || err.message)
    process.exit(1)
  } finally {
    try { unlinkSync(tempFile) } catch { /* ignore */ }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const filteredArgs = args.filter(a => a !== '--production')

  if (filteredArgs.length < 2) {
    console.error('Usage: npx tsx scripts/update-scraper.ts <source-slug> <code-file> [description] [--production]')
    console.error('')
    console.error('Arguments:')
    console.error('  source-slug   The slug of the source (e.g., "last-ditch")')
    console.error('  code-file     Path to the JavaScript file containing the scraper code')
    console.error('  description   Optional description for this version')
    console.error('  --production  Update production database via SSH')
    console.error('')
    console.error('Example:')
    console.error('  npx tsx scripts/update-scraper.ts last-ditch ./scrapers/lastditch.js "Fix calendar parsing"')
    console.error('  npx tsx scripts/update-scraper.ts last-ditch ./scrapers/lastditch.js "Fix" --production')
    process.exit(1)
  }

  const [sourceSlug, codeFile, description] = filteredArgs

  // Resolve code file path
  const codePath = resolve(process.cwd(), codeFile)
  if (!existsSync(codePath)) {
    console.error(`Error: Code file not found: ${codePath}`)
    process.exit(1)
  }

  // Read code
  const code = readFileSync(codePath, 'utf-8').trim()
  if (!code) {
    console.error('Error: Code file is empty')
    process.exit(1)
  }

  // Validate code has scrapeEvents function
  if (!code.includes('async function scrapeEvents') && !code.includes('function scrapeEvents')) {
    console.error('Error: Code must contain a scrapeEvents function')
    process.exit(1)
  }

  const versionDescription = description || `Manual update from ${codeFile}`

  // For production, use SSH method
  if (isProduction) {
    await updateProduction(sourceSlug, code, versionDescription)
    return
  }

  // Find source (local database)
  const source = await prisma.source.findUnique({
    where: { slug: sourceSlug },
    select: {
      id: true,
      name: true,
      type: true,
      website: true,
      config: true,
    },
  })

  if (!source) {
    console.error(`Error: Source not found with slug: ${sourceSlug}`)

    // List available sources
    const sources = await prisma.source.findMany({
      where: { type: 'SCRAPER' },
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    })

    console.error('')
    console.error('Available scraper sources:')
    sources.forEach(s => console.error(`  ${s.slug} - ${s.name}`))
    process.exit(1)
  }

  if (source.type !== 'SCRAPER') {
    console.error(`Error: Source "${source.name}" is not a scraper (type: ${source.type})`)
    process.exit(1)
  }

  console.log(`Updating scraper: ${source.name}`)
  console.log(`URL: ${source.website}`)
  console.log('')

  // Calculate hash
  const codeHash = hashCode(code)

  // Check for duplicate
  const existingWithHash = await prisma.scraperVersion.findFirst({
    where: { sourceId: source.id, codeHash },
    select: { versionNumber: true },
  })

  if (existingWithHash) {
    console.error(`Error: This code is identical to version ${existingWithHash.versionNumber}`)
    process.exit(1)
  }

  // Get next version number
  const lastVersion = await prisma.scraperVersion.findFirst({
    where: { sourceId: source.id },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })

  const nextVersion = (lastVersion?.versionNumber ?? 0) + 1

  console.log(`Creating version ${nextVersion}...`)

  // Create new version and activate
  await prisma.$transaction(async (tx) => {
    // Deactivate existing versions
    await tx.scraperVersion.updateMany({
      where: { sourceId: source.id, isActive: true },
      data: { isActive: false },
    })

    // Create new version
    await tx.scraperVersion.create({
      data: {
        sourceId: source.id,
        versionNumber: nextVersion,
        code,
        codeHash,
        description: versionDescription,
        createdFrom: 'MANUAL_EDIT',
        isActive: true,
      },
    })

    // Update source config
    const config = (source.config as Record<string, unknown>) || {}
    await tx.source.update({
      where: { id: source.id },
      data: {
        config: {
          ...config,
          generatedCode: code,
        },
      },
    })
  })

  console.log('')
  console.log(`✓ Version ${nextVersion} created and activated`)
  console.log(`✓ Source config updated`)
  console.log('')
  console.log('To test the scraper, run it from the admin UI or use:')
  console.log(`  curl -X POST http://localhost:3000/api/scrapers/${source.id}/test`)
}

main()
  .catch((err) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
