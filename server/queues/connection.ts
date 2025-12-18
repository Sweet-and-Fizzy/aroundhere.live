/**
 * Redis connection for BullMQ job queues
 */

import { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Create a shared Redis connection for BullMQ
// BullMQ requires ioredis, not the generic redis client
export const createRedisConnection = () => {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  })
}

// Singleton connection for queue producers (API endpoints)
let producerConnection: Redis | null = null

export const getProducerConnection = () => {
  if (!producerConnection) {
    producerConnection = createRedisConnection()
  }
  return producerConnection
}

// Clean up on process exit
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    producerConnection?.quit()
  })
  process.on('SIGINT', () => {
    producerConnection?.quit()
  })
}
