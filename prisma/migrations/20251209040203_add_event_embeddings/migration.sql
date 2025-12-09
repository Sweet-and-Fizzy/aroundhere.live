-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Add embedding column to events table
-- Using 1536 dimensions for OpenAI text-embedding-3-small
ALTER TABLE events ADD COLUMN embedding vector(1536);

-- Create an index for fast similarity search
CREATE INDEX events_embedding_idx ON events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
