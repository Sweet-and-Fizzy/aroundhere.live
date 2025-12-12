-- Add new event types and rename TRIVIA to GAMES

-- Step 1: Add new enum values (GAMES first, then others)
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'GAMES';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DANCE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MARKET';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'WORKSHOP';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'PARTY';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'FITNESS';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DRAG';

-- Step 2: Migrate TRIVIA events to GAMES
-- Note: This must be done in a separate transaction after the enum value is added
-- The deployment script will run the data migration separately
