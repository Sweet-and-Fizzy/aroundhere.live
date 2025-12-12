-- Migrate existing TRIVIA events to GAMES and remove TRIVIA enum value

-- Step 1: Update all events with TRIVIA to GAMES
UPDATE events SET "eventType" = 'GAMES' WHERE "eventType" = 'TRIVIA';

-- Step 2: We can't actually remove enum values in PostgreSQL easily
-- The TRIVIA value will remain but be unused
-- This is safe - it just means 'TRIVIA' won't be used for new events
