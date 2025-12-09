/**
 * Embedding Service
 * Generates and manages vector embeddings for semantic similarity search
 */

import OpenAI from 'openai'

// OpenAI embedding model - small is cheap and good enough for similarity
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured')
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

/**
 * Generate an embedding vector for the given text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data[0].embedding
}

/**
 * Generate embeddings for multiple texts in a batch
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  // Sort by index to ensure order matches input
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}

/**
 * Build the text content to embed for an event
 * Combines title, description, genres, and artist names for rich semantic content
 */
export function buildEventEmbeddingText(event: {
  title: string
  description?: string | null
  canonicalGenres?: string[]
  eventType?: string | null
  artists?: Array<{ name: string }> | null
}): string {
  const parts: string[] = []

  // Title is most important
  parts.push(event.title)

  // Add event type if available
  if (event.eventType) {
    parts.push(`Event type: ${event.eventType}`)
  }

  // Add genres
  if (event.canonicalGenres && event.canonicalGenres.length > 0) {
    parts.push(`Genres: ${event.canonicalGenres.join(', ')}`)
  }

  // Add artist names
  if (event.artists && event.artists.length > 0) {
    parts.push(`Artists: ${event.artists.map(a => a.name).join(', ')}`)
  }

  // Add description (truncated to avoid token limits)
  if (event.description) {
    const truncatedDescription = event.description.slice(0, 1000)
    parts.push(truncatedDescription)
  }

  return parts.join('\n\n')
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS }
