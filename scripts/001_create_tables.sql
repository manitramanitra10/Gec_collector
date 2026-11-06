-- Schéma de GEC Collector pour PostgreSQL (13 ou plus, pour gen_random_uuid()).
-- Idempotent : peut être rejoué sans erreur, y compris sur une base créée avec une
-- version antérieure du script (voir la section 3). Appliqué par `yarn db:setup`.

-- ---------------------------------------------------------------------------
-- 1. Table mère : toutes les tables métier en héritent (INHERITS).
--    Suppression logique uniquement : is_delete = true + deleted_at renseigné,
--    jamais de DELETE. Les requêtes applicatives filtrent sur is_delete = false.
--    Une colonne ajoutée ici apparaît automatiquement dans toutes les tables filles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS base_entity (
  is_delete  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 2. Tables métier.
--    Rappel PostgreSQL : clés primaires, contraintes UNIQUE et clés étrangères
--    ne sont pas héritées, chaque table déclare les siennes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS examples (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incorrect_text TEXT NOT NULL,
  correct_text   TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  source         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  votes_up       INTEGER NOT NULL DEFAULT 0,
  votes_down     INTEGER NOT NULL DEFAULT 0
) INHERITS (base_entity);

CREATE TABLE IF NOT EXISTS votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  vote       INTEGER NOT NULL CHECK (vote IN (1, -1)),
  UNIQUE (example_id, voter_hash)
) INHERITS (base_entity);

-- Codes d'accès : un code par type ('validate' pour la page de validation,
-- 'export' pour le téléchargement du corpus).
CREATE TABLE IF NOT EXISTS secrets (
  type       TEXT PRIMARY KEY CHECK (type IN ('validate', 'export')),
  code       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) INHERITS (base_entity);

-- ---------------------------------------------------------------------------
-- 3. Mise à niveau des tables créées avant la table mère (ex. Supabase en prod) :
--    ajout des colonnes manquantes puis rattachement à base_entity.
--    Sans effet sur une table déjà héritée.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['examples', 'votes', 'secrets'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_delete  BOOLEAN     NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    -- L'ancien schéma déclarait created_at sans NOT NULL ; l'héritage l'exige.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT NOW()', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = t::regclass AND inhparent = 'base_entity'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I INHERIT base_entity', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Codes d'accès initiaux. ON CONFLICT DO NOTHING : un code modifié en base
--    n'est pas écrasé quand le script est rejoué. Pour changer un code :
--      UPDATE secrets SET code = 'nouveau', updated_at = NOW() WHERE type = 'validate';
-- ---------------------------------------------------------------------------
INSERT INTO secrets (type, code) VALUES
  ('validate', 'Gec_validate'),
  ('export',   'Gec_export')
ON CONFLICT (type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_examples_status     ON examples(status);
CREATE INDEX IF NOT EXISTS idx_examples_created_at ON examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_example_id    ON votes(example_id);
