-- Schéma de GEC Collector pour PostgreSQL (13 ou plus, pour gen_random_uuid()).
-- Idempotent : peut être rejoué sans erreur. Appliqué par `yarn db:setup`.

CREATE TABLE IF NOT EXISTS examples (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incorrect_text TEXT NOT NULL,
  correct_text   TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  source         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  votes_up       INTEGER NOT NULL DEFAULT 0,
  votes_down     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  vote       INTEGER NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (example_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_examples_status     ON examples(status);
CREATE INDEX IF NOT EXISTS idx_examples_created_at ON examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_example_id    ON votes(example_id);
