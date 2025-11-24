-- Optional migration for tracking parser failures in detail
-- This enables better analytics and failure pattern detection

-- Create parser_failures table to track detailed failure history
CREATE TABLE IF NOT EXISTS parser_failures (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  failure_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  events_found INTEGER NOT NULL,
  events_expected INTEGER,
  errors TEXT[],
  html_snapshot TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT parser_failures_source_id_fkey FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS parser_failures_source_id_idx ON parser_failures(source_id);
CREATE INDEX IF NOT EXISTS parser_failures_created_at_idx ON parser_failures(created_at);
CREATE INDEX IF NOT EXISTS parser_failures_failure_type_idx ON parser_failures(failure_type);

-- Add consecutive_failures tracking to sources table
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP;

