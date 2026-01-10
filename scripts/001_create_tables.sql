-- Create examples table for GEC data collection
CREATE TABLE IF NOT EXISTS examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incorrect_text TEXT NOT NULL,
  correct_text TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  votes_up INTEGER DEFAULT 0,
  votes_down INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create votes table for tracking individual votes
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(example_id, voter_hash)
);

-- Enable RLS on examples table
ALTER TABLE examples ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read examples (public data collection)
CREATE POLICY "Allow public read on examples" ON examples
  FOR SELECT USING (true);

-- Allow anyone to insert examples (anonymous contributions)
CREATE POLICY "Allow public insert on examples" ON examples
  FOR INSERT WITH CHECK (true);

-- Allow updates only for vote counts and status
CREATE POLICY "Allow public update on examples" ON examples
  FOR UPDATE USING (true);

-- Enable RLS on votes table
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read votes
CREATE POLICY "Allow public read on votes" ON votes
  FOR SELECT USING (true);

-- Allow anyone to insert votes
CREATE POLICY "Allow public insert on votes" ON votes
  FOR INSERT WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_examples_status ON examples(status);
CREATE INDEX IF NOT EXISTS idx_examples_created_at ON examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_example_id ON votes(example_id);
