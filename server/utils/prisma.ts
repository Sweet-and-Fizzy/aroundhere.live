import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Create connection pool
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/local_music'

const pool = new pg.Pool({
  connectionString,
  max: 10, // Maximum number of clients in the pool
})

const adapter = new PrismaPg(pool)

// Prevent multiple instances during hot reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: ['error', 'warn'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
