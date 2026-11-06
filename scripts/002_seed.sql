-- Données de démonstration, insérées uniquement si la table examples est vide.
-- Appliqué par `yarn db:seed`.

INSERT INTO examples (incorrect_text, correct_text, tags, source)
SELECT seed.incorrect_text, seed.correct_text, seed.tags, seed.source
FROM (VALUES
  ('Je suis alle au marché.',                     'Je suis allé au marché.',                      ARRAY['orthographe'],              NULL::text),
  ('Les enfants joue dans le jardin.',            'Les enfants jouent dans le jardin.',           ARRAY['conjugaison', 'accord'],    NULL),
  ('Elle a mangé une pomme rouge et délicieux.',  'Elle a mangé une pomme rouge et délicieuse.',  ARRAY['accord'],                   NULL),
  ('Nous avons visiter le musée hier.',           'Nous avons visité le musée hier.',             ARRAY['conjugaison'],              NULL),
  ('Il faut que tu viens demain.',                'Il faut que tu viennes demain.',               ARRAY['subjonctif', 'grammaire'],  NULL)
) AS seed(incorrect_text, correct_text, tags, source)
WHERE NOT EXISTS (SELECT 1 FROM examples);
