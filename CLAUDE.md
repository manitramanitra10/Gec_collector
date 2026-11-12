# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

GEC Collector est une application Next.js 16 (App Router, React 19) de collecte participative de paires de phrases « incorrecte / corrigée » destinées à entraîner un modèle de correction grammaticale (GEC = Grammatical Error Correction). Les données vivent dans PostgreSQL, accédé directement via `pg` depuis des server actions. L'interface est en français ; le projet a été généré avec v0.app (sur Supabase) puis migré vers PostgreSQL direct.

La documentation fonctionnelle complète est dans `README.md` : flux utilisateur, modèle de données, formats d'export.

## Commandes

Le lockfile de référence est `yarn.lock` (`pnpm-lock.yaml` est un stub vide).

```bash
yarn install          # dépendances
yarn db:setup         # crée la base nommée dans DATABASE_URL si absente + applique le schéma
yarn db:seed          # idem + 5 exemples de démo (si la table est vide)
yarn import:examples <fichier.json> --batch <nom> [--origin synthetic|web] [--user <email>]
                      # importe un lot de paires en statut to_correct (rejouable)
yarn dev              # serveur de dev sur http://localhost:3000
yarn build            # build de production
yarn typecheck        # tsc --noEmit
```

- Il n'y a **pas de tests** ni de runner de test configuré.
- `yarn lint` lance `eslint .` mais aucune config ESLint n'existe et `eslint` n'est pas dans les devDependencies : la commande échoue. Ne pas s'appuyer dessus.
- `next.config.mjs` met `typescript.ignoreBuildErrors: true` : le build **passe même avec des erreurs de type**. Toujours lancer `yarn typecheck` avant de conclure qu'une modification compile.
- `yarn start:dev` utilise la syntaxe POSIX `NODE_ENV=... next start` et ne fonctionne pas sous PowerShell/cmd.

### Variables d'environnement

Toutes côté serveur, sans préfixe `NEXT_PUBLIC_` (voir `.env.example`) :

- `DATABASE_URL` : chaîne de connexion PostgreSQL. En local `postgresql://postgres:…@localhost:5432/gec_collector`. Ne pas y mettre `sslmode=` : pg le ferait primer sur `DATABASE_SSL`.
- `POSTGRES_URL` : repli si `DATABASE_URL` est absente (variable posée par l'intégration Supabase ↔ Vercel).
- `DATABASE_SSL` : `disable` (défaut si hôte local), `require` (défaut sinon, certificat non vérifié, nécessaire pour Supabase), `verify-full` (+ `DATABASE_SSL_CA` en PEM).
- `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` (`openssl rand -hex 32`), `APP_BASE_URL` (sans slash final) : lues par `@auth0/nextjs-auth0`. Sans elles, **toutes les requêtes échouent** puisque `proxy.ts` instancie le client Auth0.

**Production = Supabase**, atteint par sa chaîne « Transaction pooler » (port 6543). La clé anon et l'API REST ne sont plus utilisées. **Le RLS est activé sur toutes les tables, sans aucune policy, précisément pour fermer cette API** (section 7 du script, qui retire aussi les droits des rôles `anon`/`authenticated`) ; l'application n'est pas concernée car le rôle `postgres`, propriétaire des tables, ignore le RLS. Ne jamais ajouter de policy ni rendre des droits à `anon`/`authenticated`. Toute nouvelle table doit figurer dans la liste de la section 7. Les tables créées à l'époque Supabase ont les mêmes colonnes que `scripts/001_create_tables.sql`.

Next.js charge `.env.local` nativement ; `next.config.mjs` importe aussi `dotenv/config` (charge `.env`). `scripts/db-setup.mjs` lit les deux dans le même ordre de priorité. Le `.gitignore` ignore tous les `.env*` sauf `.env.example`.

### Base de données

- Schéma : `scripts/001_create_tables.sql`. Table mère `base_entity` (`is_delete`, `created_at`, `deleted_at`, `created_by`, `deleted_by`) dont `users`, `batches`, `error_types`, `examples`, `votes`, `secrets` et `activity_log` héritent via `INHERITS`. Idempotent : la section 3 met à niveau les tables créées avant l'héritage (ajout des colonnes + `ALTER TABLE … INHERIT`), la section 4 déclare les FK `created_by`/`deleted_by` → `users(id)` sur chaque table, ce qui couvre la base Supabase de prod. Il insère aussi les deux codes d'accès initiaux dans `secrets` avec `ON CONFLICT DO NOTHING`.
- **Traçabilité** : toute écriture passe par `requireUser()` (`app/actions.ts`), qui fait l'upsert de la ligne `users` depuis le profil Auth0 et fournit l'`id` à mettre dans `created_by` (ou `deleted_by`). Un compte avec `is_delete = true` est refusé (« Ce compte est désactivé »). `first_name`/`last_name` sont saisis par l'utilisateur sur `/account` et jamais écrasés par l'upsert.
- Votes : le votant est `votes.created_by` ; index unique partiel `(example_id, created_by) WHERE created_by IS NOT NULL`. `voter_hash` est nullable et ne concerne que les votes d'avant les comptes.
- Données importées : `batches` (un lot par fichier, `origin` synthetic|web), `error_types` (référentiel des cases à cocher, codes inconnus ajoutés à l'import), et sur `examples` : `origin`, `batch_id`, `external_id`, `error_types[]`, `import_payload` (JSON d'origine intact), `corrected_by/at`, `locked_by/at`. Statuts : `to_correct` → `pending` → `validated|rejected`. Les colonnes et les CHECK de `status`/`origin` sont (re)posés par `ALTER TABLE` dans la section 3 du script : pour ajouter une valeur de statut, modifier le CHECK là **et** dans le `CREATE TABLE`.
- **Journal d'activité obligatoire** : toute écriture faite pour un utilisateur appelle `logActivity()` (`lib/activity.ts`) **dans la même transaction** (`BEGIN … logActivity(entry, client) … COMMIT`), avec `actorId`, `action`, `entityType`, `entityId`, et `before`/`after`/`details` en JSON. Les codes d'action sont le type `ActivityAction` : en ajouter un avant d'implémenter une nouvelle action. `activity_log` hérite de `base_entity` mais ne se modifie ni ne se supprime jamais, même logiquement.
- **Suppression logique uniquement** : jamais de `DELETE`. Supprimer = `UPDATE … SET is_delete = true, deleted_at = NOW()`. Toute requête de lecture, de comptage ou de mise à jour filtre sur `is_delete = false`. `softDeleteExample()` dans `lib/examples.ts` marque un exemple et ses votes en transaction ; elle n'est exposée par aucune action (pas d'authentification).
- Héritage PostgreSQL : clés primaires, `UNIQUE` et clés étrangères ne sont pas héritées, chaque table déclare les siennes. Une nouvelle table métier doit être créée avec `INHERITS (base_entity)` **et** ajoutée aux listes des sections 3 et 4 du script.
- Démo : `scripts/002_seed.sql`, n'insère que si `examples` est vide.
- `scripts/db-setup.mjs` se connecte à la base d'administration `postgres` du même serveur pour créer la base cible, puis applique les SQL. Pas d'outil de migration : une évolution de schéma se fait en modifiant le SQL (de façon idempotente) et `lib/types.ts` à la main.

## Architecture

### Flux de données

```
page "use client"  →  app/actions.ts ("use server")  →  lib/examples.ts  →  lib/db.ts (pool pg)  →  PostgreSQL
```

- Les pages métier sont des pages serveur minces (`page.tsx` lit la session, le cookie d'accès ou les référentiels) qui rendent un composant client (`review-client.tsx`, `export-client.tsx`, `workbench.tsx`, `submit-form.tsx`) ; les composants client n'importent **que** `app/actions.ts` pour parler à la base. Une seule route HTTP : `app/api/export/route.ts`, qui envoie le corpus en flux (`iterateExamples`, tranches de 2 000, pagination par clé sur `(created_at, id)` avec `created_at::text` pour garder la précision microseconde), car une server action ne peut pas streamer. `maxDuration = 60`.
- `lib/db.ts` et `lib/examples.ts` importent `server-only` : les importer depuis un composant client casse le build. Le pool est mis en cache sur `globalThis` pour survivre au HMR.
- `app/actions.ts` valide ses entrées avec zod et **renvoie des objets de résultat** (`{ ok, error }`, `{ outcome: "recorded" | "duplicate" | "not_found" | "error" }`) au lieu de lever des exceptions, car Next.js masque les messages d'erreur des server actions en production. Garder ce pattern pour toute nouvelle action.
- `pg` est listé dans `serverExternalPackages` de `next.config.mjs`.

### Authentification (Auth0, connexion Google)

- `proxy.ts` (le `middleware.ts` de Next 16) appelle `auth0.middleware()` qui monte `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/profile`, puis **redirige toute requête sans session** vers `/auth/login?returnTo=…`. Tout le site est derrière le login ; seuls `/auth/*` et les fichiers statiques du matcher passent.
- `lib/auth0.ts` : instance `Auth0Client` partagée, forcée sur la connexion `google-oauth2`, et `getSessionProfile()` qui renvoie un `Auth0Profile` (`sub`, e-mail, nom, photo), côté serveur uniquement.
- `app/layout.tsx` est `async` : il lit la session, crée la ligne `users` à la première visite et passe un `SessionUser` à l'en-tête, avec le prénom/nom saisis de préférence au nom Google (`userDisplayName()` dans `lib/users.ts`). Toutes les pages sont donc dynamiques.
- Chaque server action passe par `requireUser()` (seconde barrière derrière le proxy) : session → upsert `users` → `id`. Sans session : `Connexion requise.` ; compte désactivé : `Ce compte est désactivé.`.
- `/account` (`app/account/`) : page serveur + formulaire client `ProfileForm` → action `updateProfile`, puis `router.refresh()` pour mettre à jour l'en-tête.
- `/dashboard` (`app/dashboard/page.tsx`, 100 % serveur) : `getUserDashboard(userId, page)` dans `lib/dashboard.ts` agrège le journal (`activity_log` par action), le devenir des contributions (`examples` où `created_by` = moi et origine manuelle, ou `corrected_by` = moi, hors mes propres rejets à la correction), le reste à faire global, et le journal paginé joint à l'exemple ou au lot. Le rendu est dans `components/user-dashboard-view.tsx` (partagé avec `/supervision/[userId]`) ; toute nouvelle `ActivityAction` doit avoir son libellé dans `describe()` de ce composant.
- **Télécharger l'activité** (`components/activity-export-button.tsx`) → action `fetchUserActivityExport({ userId? })` → `getUserActivityExport(user)` (`lib/dashboard.ts`) : résumé + contributions + journal (5 000 lignes max), téléchargé en JSON côté client. Sans `userId` : l'appelant ; avec un autre `userId` : exige `hasAccess("supervision")`. Journalisé en `activity.export`.
- Le lien de déconnexion dans `components/header.tsx` est un `<a href="/auth/logout">` : **jamais un `<Link>`**, dont le préchargement déconnecterait l'utilisateur.
- Les codes d'accès de `/review` et `/export` restent un verrou distinct, appliqué après la connexion. Le vote est identifié par `users.id` (`votes.created_by`), plus par un identifiant navigateur.
- `PUBLIC_PATHS` dans `proxy.ts` liste les pages sans session : seulement `/` (accueil, qui adapte ses boutons avec `getSessionProfile()`). Pour rendre une page publique, l'ajouter là ; ses server actions resteraient protégées par `requireUser()`. Le lien de connexion de l'en-tête et de l'accueil est un `<a href="/auth/login?returnTo=/">`, jamais un `<Link>`. `/correct` → `/lissage` : redirection permanente dans `next.config.mjs`.
- Tout compte Google est accepté ; une restriction (domaine, liste) se ferait par une Action Auth0 post-login ou une table `users`.

### Flux de correction (exemples importés)

1. `scripts/import-examples.mjs` valide tout le fichier, puis insère les paires en `to_correct` par INSERT multi-lignes de 1 000 (`BATCH_SIZE`, 10 paramètres par ligne) dans une seule transaction, et journalise `batch.import` au nom de `--user`. Ne pas revenir à une insertion ligne par ligne : à distance, c'est des heures pour un gros fichier.
2. `/lissage` (`app/lissage/`, page serveur + `CorrectionWorkbench` client) appelle `claimNextExample` → `claimNextToCorrect()` : `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)` qui réserve le plus ancien exemple non verrouillé (`locked_at` de plus de `LOCK_MINUTES` = 10 min) pour l'utilisateur. Passer (`example.skip`) prolonge la réservation, donc l'exemple ne revient qu'après expiration.
3. `correctExample` → `submitCorrection()` : refuse si un autre correcteur détient un verrou valide (`outcome: "locked"`), sinon met à jour textes/types/tags/source, `status = 'pending'`, `corrected_by/at`, libère le verrou et journalise `example.correct` avec avant/après. `rejectExample` → `rejectCorrection()` passe en `rejected` (`example.reject`).
4. `lib/diff.ts` (`wordDiff`, pur, utilisable côté client) surligne les mots qui diffèrent entre les deux phrases. `components/error-type-checkboxes.tsx` est partagé avec Soumettre ; les codes envoyés sont filtrés contre le référentiel dans l'action (`sanitizeErrorTypes`).

### Flux de validation

1. `/submit` appelle `submitExample` → `INSERT` avec `status = 'pending'`, puis redirige vers `/thanks`.
2. `/review` charge les 20 derniers `pending` via `fetchPendingExamples`. Le votant est l'utilisateur de la session (`users.id`).
3. `voteOnExample` → `castVote(exampleId, userId, vote)` dans `lib/examples.ts` : **une transaction** qui insère dans `votes` (`created_by = userId`) puis fait `UPDATE examples SET votes_up = votes_up + …, status = CASE …`. L'index unique `(example_id, created_by)` lève `23505` → `outcome: "duplicate"` ; une FK invalide lève `23503` → `outcome: "not_found"`.
4. Seuils : `VALIDATE_THRESHOLD` et `REJECT_THRESHOLD` (tous deux à 1) en tête de `lib/examples.ts`. Le rejet l'emporte sur la validation. Un exemple quitte la file dès qu'il n'est plus `pending`.
5. `/export` appelle `fetchExportData(filter)` qui renvoie la liste filtrée et les statistiques (une seule requête SQL à sous-requêtes). Les fichiers JSON/CSV sont générés **dans le navigateur**.

### Codes d'accès

Les codes vivent dans la table `secrets` (`type` = `validate` | `export` | `supervision`, `code` en clair ; types `SecretType` / `Secret` dans `lib/types.ts`). Pour ajouter un type : le CHECK dans le `CREATE TABLE` **et** dans la section 3 du script, plus la ligne de seed.

- **Mécanisme serveur** (`lib/secrets.ts`) : `verifyCode(type, saisie)` compare au code en base (comparaison à temps constant) ; `grantAccess(type, code)` pose un cookie httpOnly `gec_access_<type>` = HMAC-SHA256(code, `AUTH0_SECRET`), 12 h ; `hasAccess(type)` recompare le cookie au code **actuel** en base, donc changer le code révoque les accès. `grantAccess`/`revokeAccess` écrivent des cookies : à appeler depuis une server action, jamais depuis un server component.
- Les trois types passent par ce mécanisme via `unlockWithCode(type)` dans `app/actions.ts` (`unlockValidation`, `unlockExport`, `unlockSupervision`), qui journalise `<type>.unlock` avec `{ ok }`, jamais le code. Côté serveur : `fetchPendingExamples` et `voteOnExample` exigent `hasAccess("validate")` ; `/api/export` exige `hasAccess("export")` ; `/supervision` exige `hasAccess("supervision")`. Les pages serveur (`app/review/page.tsx`, `app/export/page.tsx`, `app/supervision/page.tsx`) lisent le cookie pour choisir l'écran initial, et le composant client fait `router.refresh()` ou bascule son état après un déverrouillage réussi.
- `/supervision/[userId]` réutilise `UserDashboardView` avec `perspective="other"` et `getUserDashboard(userId)`. Données : `lib/supervision.ts`.
- **Aucune constante de code dans le code client** : ne jamais en réintroduire.

### Types

`lib/types.ts` déclare `BaseEntity` (colonnes de la table mère), étendu par `User`, `Batch`, `ErrorType`, `Example`, `Vote`, `Secret` et `ActivityLog`, plus `ExampleOrigin`, `Stats`, `ExampleStatus`, `ExampleFilter`, `SecretType`, `Auth0Profile` (serveur) et `SessionUser` (client) : miroirs manuels du schéma SQL. `lib/examples.ts` convertit les lignes pg via `toExample()` (les `timestamptz` arrivent en `Date`, les `count()`/`sum()` en chaînes bigint). `EXAMPLE_FROM` joint `batches` et deux fois `users` (`ua` = auteur, `uc` = correcteur) pour fournir `batch_name`, `created_by_name` et `corrected_by_name` (prénom + nom, sinon nom Google, sinon e-mail) ; toute requête qui renvoie des `Example` doit passer par `EXAMPLE_SELECT`/`EXAMPLE_FROM`.

### UI et styles

- shadcn/ui (style `new-york`, Radix, `lucide-react`) dans `components/ui/`. Composants ajoutés via `npx shadcn@latest add <nom>` ; alias définis dans `components.json` (`@/components`, `@/lib`, `@/hooks`).
- Tailwind CSS v4 via `@tailwindcss/postcss`, **sans** `tailwind.config` : les tokens sont des variables CSS `oklch` déclarées dans `app/globals.css` et exposées via `@theme inline`. Token custom `--success` (`bg-success`, `text-success`).
- `app/globals.css` est la feuille réellement importée (par `app/layout.tsx`). `styles/globals.css` est une copie obsolète du thème neutre v0, non importée.
- Le mode sombre est défini par la variante `.dark` mais `components/theme-provider.tsx` n'est pas monté dans le layout : aucun basculement n'est câblé.
- `components/confetti.tsx` dépend de la classe `.confetti-piece` et du keyframe `confetti-fall` déclarés dans `app/globals.css`.
- **Icônes** : source `public/gasy_icon.svg` (826 Ko, jamais référencée dans le HTML). Dérivés déclarés dans `metadata.icons` de `app/layout.tsx` : `public/favicon.ico` (ICO à PNG incorporés 16/32/48), `icon-32x32.png`, `icon-192x192.png`, `apple-icon.png` (180). Régénération : `sharp` (dépendance de Next, dans `node_modules`) pour les PNG avec `density: 384` et `fit: "contain"`, puis ICO assemblé en Node (en-tête 6 octets + une entrée de 16 octets par taille + les PNG). Pas de Pillow ni d'ImageMagick sur le poste.

### Doublons à connaître

`hooks/use-toast.ts` et `components/ui/use-toast.ts` sont identiques, de même que `hooks/use-mobile.ts` et `components/ui/use-mobile.tsx`. L'alias canonique selon `components.json` est `@/hooks` ; modifier les deux copies ou supprimer celle de `components/ui/`.

## Conventions

- Textes d'interface en français. Les pages existantes mélangent accents et absence d'accents (« corrigee », « Contribuez a l'IA ») ; préférer les accents corrects pour tout nouveau texte.
- Imports absolus via `@/…` (racine du projet).
- Requêtes SQL toujours paramétrées (`$1`, `$2`…), jamais interpolées.
- Toute fonction d'écriture de `lib/*.ts` prend l'`id` de l'utilisateur qui agit, l'écrit dans `created_by`/`deleted_by` et journalise via `logActivity()` dans sa transaction. Pas d'écriture anonyme.
- Mise en page des pages métier : `min-h-screen bg-background py-12` + conteneur `mx-auto max-w-{2xl,3xl} px-6` + `Card` shadcn. Le `Header` global est monté dans `app/layout.tsx`.
- **Performance (corpus > 170 000 lignes)** : toute nouvelle requête sur `examples` doit s'appuyer sur un index partiel existant ou en ajouter un dans la section 6 du script ; vérifier avec `EXPLAIN` sur Supabase (plan `Index Scan`/`Index Only Scan`, jamais `Seq Scan` sur `examples`). Jamais de `SELECT` sans `LIMIT` sur `examples` hors `iterateExamples`. Après un import massif, `ANALYZE examples` (le script le fait). Les agrégats par lot s'écrivent `batches LEFT JOIN (SELECT batch_id, count(*) FILTER … GROUP BY batch_id)`, pas `batches LEFT JOIN examples`. `getStats()` tient en une passe sur `idx_examples_status_counts`. Les fonctions Vercel sont en `fra1` (`vercel.json`) à côté de la base : ne pas changer de région sans déplacer la base.
- **Toute liste est paginée côté serveur** (`LIMIT/OFFSET` + `count(*)`, 10 par page) avec `components/pager.tsx` : mode `hrefFor` dans une page serveur (liens `?page=N`, aucun gestionnaire d'événement), mode `onPageChange` dans un composant client. Le serveur ramène la page demandée dans les bornes et renvoie `{ items, total, page, pageSize, pageCount }`.
- **Tout doit rester utilisable sur mobile (360 px)** : empiler avec `flex-col` puis `sm:flex-row`, grilles `grid-cols-1 sm:grid-cols-N`, largeurs `w-full sm:w-[…]`, jamais de largeur fixe seule. Sous 640 px, la navigation passe par le panneau latéral `MobileMenu` de `components/header.tsx` (`Sheet`) ; au-dessus, liens en ligne et menu de compte `UserMenu`. Toute nouvelle entrée de navigation s'ajoute à `NAV_LINKS`, qui alimente les deux.
