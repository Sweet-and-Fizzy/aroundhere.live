/**
 * Check failed AI scraper sessions
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Checking for failed AI scraper sessions...\n')

  // Get failed sessions
  const failedSessions = await prisma.agentSession.findMany({
    where: {
      status: 'FAILED',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
  })

  console.log(`Found ${failedSessions.length} failed sessions:\n`)

  for (const session of failedSessions) {
    console.log('=' .repeat(80))
    console.log(`Session ID: ${session.id}`)
    console.log(`URL: ${session.url}`)
    console.log(`Type: ${session.sessionType}`)
    console.log(`LLM: ${session.llmProvider}/${session.llmModel}`)
    console.log(`Iterations: ${session.currentIteration}/${session.maxIterations}`)
    console.log(`Created: ${session.createdAt.toISOString()}`)
    console.log(`Completed: ${session.completedAt?.toISOString() || 'N/A'}`)
    console.log(`Error: ${session.errorMessage || 'No error message'}`)

    // Show thinking steps if available
    if (session.thinking) {
      const thinking = session.thinking as any[]
      console.log(`\nThinking steps (${thinking.length}):`)
      thinking.slice(-3).forEach((step, i) => {
        console.log(`  ${thinking.length - 3 + i + 1}. [${step.type}] ${step.message}`)
      })
    }

    console.log()
  }

  // Get failure statistics
  const totalFailed = await prisma.agentSession.count({
    where: { status: 'FAILED' },
  })

  const totalSuccess = await prisma.agentSession.count({
    where: { status: 'SUCCESS' },
  })

  const totalApproved = await prisma.agentSession.count({
    where: { status: 'APPROVED' },
  })

  const totalInProgress = await prisma.agentSession.count({
    where: { status: 'IN_PROGRESS' },
  })

  console.log('=' .repeat(80))
  console.log('\nSession Statistics:')
  console.log(`  Total Failed: ${totalFailed}`)
  console.log(`  Total Success: ${totalSuccess}`)
  console.log(`  Total Approved: ${totalApproved}`)
  console.log(`  Total In Progress: ${totalInProgress}`)
  console.log(`  Success Rate: ${((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1)}%`)
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
