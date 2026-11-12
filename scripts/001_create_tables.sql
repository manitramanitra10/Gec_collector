-- Schéma de GEC Collector pour PostgreSQL (13 ou plus, pour gen_random_uuid()).
-- Idempotent : peut être rejoué sans erreur, y compris sur une base créée avec une
-- version antérieure du script (voir les sections 3 et 4). Appliqué par `yarn db:setup`.

-- ---------------------------------------------------------------------------
-- 1. Table mère : toutes les tables métier en héritent (INHERITS).
--    Suppression logique uniquement : is_delete = true + deleted_at renseigné,
--    jamais de DELETE. Les requêtes applicatives filtrent sur is_delete = false.
--    created_by / deleted_by : users.id de l'auteur de la ligne et de sa suppression
--    (NULL pour les données antérieures aux comptes utilisateurs).
--    Une colonne ajoutée ici apparaît automatiquement dans toutes les tables filles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS base_entity (
  is_delete  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  deleted_by UUID
);

-- Colonnes ajoutées après la création initiale de la table mère : propagées aux filles.
ALTER TABLE base_entity ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE base_entity ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ---------------------------------------------------------------------------
-- 2. Tables métier.
--    Rappel PostgreSQL : clés primaires, contraintes UNIQUE et clés étrangères
--    ne sont pas héritées, chaque table déclare les siennes.
-- ---------------------------------------------------------------------------

-- Comptes : une ligne par identité Auth0, créée à la première action de l'utilisateur
-- et rafraîchie ensuite (e-mail, nom affiché, photo). first_name / last_name sont
-- saisis par l'utilisateur sur la page « Mon compte », jamais écrasés par Google.
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub    TEXT NOT NULL UNIQUE,   -- ex. google-oauth2|109876543210
  email        TEXT,
  display_name TEXT,                   -- nom fourni par Google
  picture_url  TEXT,
  first_name   TEXT,                   -- prénom, facultatif
  last_name    TEXT,                   -- nom, facultatif
  last_seen_at TIMESTAMPTZ
) INHERITS (base_entity);

-- Lots d'import : un par fichier de données synthétiques ou de collecte web.
CREATE TABLE IF NOT EXISTS batches (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name   TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('synthetic', 'web')),
  note   TEXT
) INHERITS (base_entity);

-- Référentiel des types d'erreur : alimente les cases à cocher des formulaires.
-- Les codes inconnus rencontrés à l'import y sont ajoutés automatiquement.
CREATE TABLE IF NOT EXISTS error_types (
  code       TEXT PRIMARY KEY,          -- ex. VOYELLES_SUPPRIMEES
  label      TEXT NOT NULL,             -- libellé affiché
  sort_order INTEGER NOT NULL DEFAULT 0
) INHERITS (base_entity);

-- Paires incorrect / correct. Cycle de vie du statut :
--   to_correct (importé, à relire)  →  pending (soumis ou corrigé, à valider)
--   →  validated | rejected (par les votes, ou rejet du correcteur).
CREATE TABLE IF NOT EXISTS examples (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incorrect_text TEXT NOT NULL,
  correct_text   TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  source         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('to_correct', 'pending', 'validated', 'rejected')),
  votes_up       INTEGER NOT NULL DEFAULT 0,
  votes_down     INTEGER NOT NULL DEFAULT 0,
  origin         TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'synthetic', 'web')),
  batch_id       UUID REFERENCES batches(id),   -- lot d'import, NULL pour une saisie directe
  external_id    TEXT,                          -- identifiant dans le fichier importé
  error_types    TEXT[] NOT NULL DEFAULT '{}',  -- codes cochés (error_types.code)
  import_payload JSONB,                         -- objet importé d'origine, jamais modifié
  corrected_by   UUID REFERENCES users(id),     -- correcteur (origine importée)
  corrected_at   TIMESTAMPTZ,
  locked_by      UUID REFERENCES users(id),     -- réservation pendant la correction
  locked_at      TIMESTAMPTZ
) INHERITS (base_entity);

-- Le votant est created_by (un vote par utilisateur et par exemple, voir l'index
-- unique en section 6). voter_hash ne concerne que les votes antérieurs aux comptes.
CREATE TABLE IF NOT EXISTS votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
  voter_hash TEXT,
  vote       INTEGER NOT NULL CHECK (vote IN (1, -1)),
  UNIQUE (example_id, voter_hash)
) INHERITS (base_entity);

-- Codes d'accès : un code par type ('validate' pour la page de validation,
-- 'export' pour le téléchargement du corpus, 'supervision' pour la route de suivi).
CREATE TABLE IF NOT EXISTS secrets (
  type       TEXT PRIMARY KEY CHECK (type IN ('validate', 'export', 'supervision')),
  code       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) INHERITS (base_entity);

-- Journal d'activité : une ligne par action d'un utilisateur, écrite dans la même
-- transaction que l'action. created_by = l'utilisateur qui agit (obligatoire).
-- Jamais modifié ni supprimé, même logiquement.
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,   -- ex. example.submit, example.vote, user.update_profile
  entity_type TEXT NOT NULL,   -- example | vote | user | batch
  entity_id   UUID,            -- ligne concernée, NULL si non applicable
  before      JSONB,           -- état avant l'action (NULL à la création)
  after       JSONB,           -- état après l'action
  details     JSONB            -- complément (sens du vote, nombre de lignes touchées…)
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
  FOREACH t IN ARRAY ARRAY['users', 'batches', 'error_types', 'examples', 'votes', 'secrets', 'activity_log'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_delete  BOOLEAN     NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by UUID', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by UUID', t);
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

-- Les votes d'avant les comptes gardaient un identifiant navigateur obligatoire.
ALTER TABLE votes ALTER COLUMN voter_hash DROP NOT NULL;

-- Dans le journal, l'acteur est obligatoire (contrainte propre à la table fille).
ALTER TABLE activity_log ALTER COLUMN created_by SET NOT NULL;

-- Colonnes ajoutées à examples pour les données importées (sans effet si déjà présentes).
ALTER TABLE examples ADD COLUMN IF NOT EXISTS origin         TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE examples ADD COLUMN IF NOT EXISTS batch_id       UUID REFERENCES batches(id);
ALTER TABLE examples ADD COLUMN IF NOT EXISTS external_id    TEXT;
ALTER TABLE examples ADD COLUMN IF NOT EXISTS error_types    TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE examples ADD COLUMN IF NOT EXISTS import_payload JSONB;
ALTER TABLE examples ADD COLUMN IF NOT EXISTS corrected_by   UUID REFERENCES users(id);
ALTER TABLE examples ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMPTZ;
ALTER TABLE examples ADD COLUMN IF NOT EXISTS locked_by      UUID REFERENCES users(id);
ALTER TABLE examples ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ;

-- Listes de valeurs, recréées à chaque passage pour suivre les évolutions du script.
ALTER TABLE examples DROP CONSTRAINT IF EXISTS examples_status_check;
ALTER TABLE examples ADD CONSTRAINT examples_status_check
  CHECK (status IN ('to_correct', 'pending', 'validated', 'rejected'));
ALTER TABLE examples DROP CONSTRAINT IF EXISTS examples_origin_check;
ALTER TABLE examples ADD CONSTRAINT examples_origin_check
  CHECK (origin IN ('manual', 'synthetic', 'web'));
ALTER TABLE secrets DROP CONSTRAINT IF EXISTS secrets_type_check;
ALTER TABLE secrets ADD CONSTRAINT secrets_type_check
  CHECK (type IN ('validate', 'export', 'supervision'));

-- ---------------------------------------------------------------------------
-- 4. Clés étrangères de traçabilité vers users (non héritées, donc une par table).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  c TEXT;
  n TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'batches', 'error_types', 'examples', 'votes', 'secrets', 'activity_log'] LOOP
    FOREACH c IN ARRAY ARRAY['created_by', 'deleted_by'] LOOP
      n := format('fk_%s_%s', t, c);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = n) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id)', t, n, c);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Codes d'accès initiaux. ON CONFLICT DO NOTHING : un code modifié en base
--    n'est pas écrasé quand le script est rejoué. Pour changer un code :
--      UPDATE secrets SET code = 'nouveau', updated_at = NOW() WHERE type = 'validate';
-- ---------------------------------------------------------------------------
INSERT INTO secrets (type, code) VALUES
  ('validate',    'Gec_validate'),
  ('export',      'Gec_export'),
  ('supervision', 'Gec_supervision')
ON CONFLICT (type) DO NOTHING;

-- Types d'erreur connus. Modifier un libellé : UPDATE error_types SET label = '…' WHERE code = '…';
INSERT INTO error_types (code, label, sort_order) VALUES
  ('VOYELLES_SUPPRIMEES',   'Voyelles supprimées',            10),
  ('PONCTUATION_MANQUANTE', 'Ponctuation manquante',          20),
  ('PONCTUATION_EN_TROP',   'Ponctuation en trop',            22),
  ('PONCTUATION',           'Ponctuation erronée',            24),
  ('TYPO_DIST1',            'Faute de frappe (1 caractère)',  30),
  ('TYPO_DIST2',            'Faute de frappe (2 caractères)', 32),
  ('MOT_REEL',              'Mot réel substitué',             40),
  ('ORDRE_DES_MOTS',        'Ordre des mots',                 50),
  ('CASSE',                 'Majuscules / minuscules',        60),
  ('APOSTROPHE_AMINY',      'Apostrophe (amin''ny)',          70),
  ('CONNECTEUR_MANQUANT',   'Connecteur manquant',            80),
  ('DECOUPAGE_MOTS',        'Découpage des mots',             90),
  ('MOT_MANQUANT',          'Mot manquant',                   100),
  ('MOT_EN_TROP',           'Mot en trop',                    110)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_examples_status     ON examples(status);
CREATE INDEX IF NOT EXISTS idx_examples_created_at ON examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_examples_created_by ON examples(created_by);
CREATE INDEX IF NOT EXISTS idx_examples_batch_id   ON examples(batch_id);

-- Import rejouable : un exemple par lot et identifiant de fichier.
CREATE UNIQUE INDEX IF NOT EXISTS uq_examples_batch_external
  ON examples(batch_id, external_id) WHERE batch_id IS NOT NULL AND external_id IS NOT NULL;

-- Index taillés pour les requêtes des pages (tous partiels sur les lignes actives).
-- Compteurs et sommes par statut (Exporter, tableaux de bord) : scan d'index seul.
CREATE INDEX IF NOT EXISTS idx_examples_status_counts
  ON examples(status) INCLUDE (votes_up, votes_down) WHERE is_delete = false;
-- Listes par statut du plus récent au plus ancien, pagination par clé (Valider, export).
CREATE INDEX IF NOT EXISTS idx_examples_status_created
  ON examples(status, created_at DESC, id DESC) WHERE is_delete = false;
-- File de correction : prochain exemple dans l'ordre d'import, tous lots ou par lot.
CREATE INDEX IF NOT EXISTS idx_examples_queue
  ON examples(created_at, external_id) WHERE status = 'to_correct' AND is_delete = false;
CREATE INDEX IF NOT EXISTS idx_examples_queue_batch
  ON examples(batch_id, created_at, external_id) WHERE status = 'to_correct' AND is_delete = false;
-- Compteurs par lot (Corriger, supervision).
CREATE INDEX IF NOT EXISTS idx_examples_batch_status
  ON examples(batch_id, status) WHERE is_delete = false;
-- Contributions corrigées par un utilisateur (tableaux de bord, supervision).
CREATE INDEX IF NOT EXISTS idx_examples_corrected_by
  ON examples(corrected_by) WHERE corrected_by IS NOT NULL;

-- Statistiques du planificateur : indispensables après un import massif, sinon
-- PostgreSQL ignore les index et parcourt toute la table.
ANALYZE examples;
ANALYZE votes;

-- ---------------------------------------------------------------------------
-- 7. Verrouillage de l'API REST Supabase.
--    Supabase expose toutes les tables du schéma public par PostgREST avec la clé
--    anon. L'application n'utilise pas cette API : elle se connecte en PostgreSQL
--    comme propriétaire des tables, ce qui ignore le RLS. On active donc le RLS
--    partout, sans aucune policy (= aucun accès par l'API), on supprime les policies
--    publiques de l'époque v0 et on retire les droits des rôles REST s'ils existent.
--    Sans effet sur une base PostgreSQL locale (les rôles anon/authenticated n'y
--    existent pas).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['base_entity', 'users', 'batches', 'error_types', 'examples', 'votes', 'secrets', 'activity_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow public read on examples"   ON examples;
DROP POLICY IF EXISTS "Allow public insert on examples" ON examples;
DROP POLICY IF EXISTS "Allow public update on examples" ON examples;
DROP POLICY IF EXISTS "Allow public read on votes"      ON votes;
DROP POLICY IF EXISTS "Allow public insert on votes"    ON votes;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_votes_example_id    ON votes(example_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_activity_log_user   ON activity_log(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- Un vote par utilisateur et par exemple (les anciens votes sans compte sont exclus).
CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_example_user
  ON votes(example_id, created_by) WHERE created_by IS NOT NULL;
