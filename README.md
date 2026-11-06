# GEC Collector

Plateforme web de collecte participative de paires de phrases « incorrecte / corrigée » destinées à constituer un corpus d'entraînement pour la correction grammaticale automatique (GEC, *Grammatical Error Correction*).

Les contributeurs soumettent des exemples de façon anonyme, des relecteurs les valident ou les rejettent, et le corpus validé est exportable en JSON ou CSV. Les données sont stockées dans une base PostgreSQL : locale en développement, Supabase en production.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Base de données](#base-de-données)
- [Scripts](#scripts)
- [Structure du projet](#structure-du-projet)
- [Architecture](#architecture)
- [Authentification](#authentification)
- [Parcours utilisateur](#parcours-utilisateur)
- [Import et correction](#import-et-correction)
- [Modèle de données](#modèle-de-données)
- [Formats d'export](#formats-dexport)
- [Codes d'accès](#codes-daccès)
- [Thème et design](#thème-et-design)
- [Limites connues](#limites-connues)
- [Déploiement et production sur Supabase](#déploiement-et-production-sur-supabase)

## Fonctionnalités

- **Connexion Google** (via Auth0) obligatoire pour entrer sur le site ; chaque action est rattachée à l'utilisateur et journalisée.
- **Soumission** d'une paire de phrases (incorrecte / corrigée) avec types d'erreur en cases à cocher, tags et source optionnels.
- **Import de lots** de paires synthétiques ou collectées sur le web (fichier JSON) et **correction** un par un avant validation, avec mise en évidence des mots qui diffèrent.
- **Validation communautaire** : vote positif ou négatif sur les exemples en attente, un vote par utilisateur et par exemple.
- **Export** du corpus en JSON ou CSV, filtrable par statut, avec tableau de statistiques.
- Interface en français, responsive, avec thème teal/corail et animation de confettis après soumission.

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, server actions) + React 19 |
| Langage | TypeScript 5 |
| Base de données | PostgreSQL 13 ou plus, accès via `pg` (node-postgres) |
| Validation | zod (entrées des server actions) |
| Authentification | Auth0 (connexion Google) via `@auth0/nextjs-auth0` v4 |
| Styles | Tailwind CSS v4, variables CSS `oklch` |
| Composants | shadcn/ui (style `new-york`), Radix UI, `lucide-react` |
| Analytics | `@vercel/analytics` |

Le projet a été initialement généré avec [v0.app](https://v0.app) sur Supabase, puis migré vers un accès PostgreSQL direct.

## Prérequis

- Node.js 20 ou supérieur
- Yarn (le lockfile de référence est `yarn.lock` ; `pnpm-lock.yaml` est un fichier vide)
- Un serveur PostgreSQL 13 ou plus, accessible localement (service Windows, Homebrew, apt, etc.)
- Un compte Auth0 (le plan Free suffit) avec une application de type « Regular Web Application », voir [Authentification](#authentification)

## Installation

```bash
git clone <url-du-depot>
cd Gec_collector
yarn install
cp .env.example .env.local
```

Renseignez ensuite `.env.local` : la connexion PostgreSQL et les cinq variables Auth0 (détail dans [Authentification](#authentification)) :

```
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@localhost:5432/gec_collector

AUTH0_DOMAIN=votre-tenant.eu.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=<openssl rand -hex 32>
APP_BASE_URL=http://localhost:3000
```

Créez la base, le schéma et quelques exemples de démonstration, puis lancez le serveur :

```bash
yarn db:seed
yarn dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

## Base de données

Le schéma est dans [scripts/001_create_tables.sql](scripts/001_create_tables.sql) et les données de démonstration dans [scripts/002_seed.sql](scripts/002_seed.sql). Les deux fichiers sont idempotents : les rejouer ne provoque ni erreur ni doublon.

Le script [scripts/db-setup.mjs](scripts/db-setup.mjs) automatise la préparation :

1. il lit `DATABASE_URL` dans `.env.local` (puis `.env`) ;
2. il se connecte à la base d'administration `postgres` du même serveur et crée la base cible si elle n'existe pas ;
3. il applique le schéma ;
4. avec `--seed`, il insère cinq exemples de démonstration si la table `examples` est vide.

| Commande | Effet |
|---|---|
| `yarn db:setup` | Crée la base si besoin et applique le schéma |
| `yarn db:seed` | Idem, plus les données de démonstration |

Pour une préparation manuelle avec `psql` :

```bash
psql -h localhost -U postgres -c "CREATE DATABASE gec_collector"
psql -h localhost -U postgres -d gec_collector -f scripts/001_create_tables.sql
psql -h localhost -U postgres -d gec_collector -f scripts/002_seed.sql
```

Le compte utilisé dans `DATABASE_URL` doit pouvoir créer la base (ou la base doit déjà exister) et créer des tables dedans.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL. Ne pas y mettre `sslmode`. |
| `POSTGRES_URL` | Solution de repli si `DATABASE_URL` est absente ; c'est la variable posée par l'intégration Supabase ↔ Vercel. |
| `DATABASE_SSL` | `disable` (défaut si l'hôte est local), `require` (défaut sinon : chiffré, certificat non vérifié) ou `verify-full` (certificat vérifié). |
| `DATABASE_SSL_CA` | Autorité de certification au format PEM, utilisée avec `verify-full`. |
| `AUTH0_DOMAIN` | Domaine du tenant Auth0, ex. `mon-tenant.eu.auth0.com`. |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Identifiants de l'application Auth0. |
| `AUTH0_SECRET` | Clé de chiffrement du cookie de session (`openssl rand -hex 32`). |
| `APP_BASE_URL` | URL publique de l'application, sans slash final. |

Ces variables n'ont pas de préfixe `NEXT_PUBLIC_` : elles ne sont jamais exposées au navigateur.

## Scripts

| Commande | Description |
|---|---|
| `yarn dev` | Serveur de développement avec rechargement à chaud |
| `yarn build` | Build de production |
| `yarn start` | Sert le build de production |
| `yarn db:setup` | Crée la base locale et applique le schéma |
| `yarn db:seed` | Comme `db:setup`, plus les données de démonstration |
| `yarn import:examples <fichier.json> --batch <nom>` | Importe un lot de paires synthétiques, voir [Import et correction](#import-et-correction) |
| `yarn typecheck` | Vérification TypeScript (`tsc --noEmit`) ; le build ignore les erreurs de type |
| `yarn lint` | Déclaré mais non fonctionnel : aucune configuration ESLint n'est présente |

Il n'y a pas de suite de tests.

## Structure du projet

```
app/
  layout.tsx          Layout racine : métadonnées, police Geist, Header, Analytics
  actions.ts          Server actions : seule porte d'entrée des pages vers la base
  page.tsx            Page d'accueil
  account/            Page « Mon compte » : prénom et nom facultatifs
  dashboard/          Page « Mon tableau de bord » : mes actions, leur devenir, reste à faire
  supervision/        Route de suivi (code vérifié côté serveur) : vue d'ensemble et détail par utilisateur
  correct/            Page Corriger : relecture un par un des exemples importés
  submit/             Formulaire de soumission (page serveur + formulaire client)
  review/page.tsx     File de validation (protégée par code)
  export/page.tsx     Statistiques et export JSON/CSV (téléchargement protégé par code)
  thanks/page.tsx     Page de remerciement avec confettis
  globals.css         Thème (variables CSS, Tailwind v4, keyframes confettis)
components/
  error-type-checkboxes.tsx  Cases à cocher des types d'erreur (Soumettre, Corriger)
  activity-export-button.tsx Boutons Télécharger l'activité (JSON) et Rafraîchir
  pager.tsx           Pagination partagée (liens côté serveur, boutons côté client)
  user-dashboard-view.tsx    Sections du tableau de bord d'un utilisateur (/dashboard, /supervision/<id>)
  header.tsx          Barre de navigation sticky
  confetti.tsx        Animation de confettis
  theme-provider.tsx  Wrapper next-themes (non monté actuellement)
  ui/                 Composants shadcn/ui
hooks/
  use-mobile.ts       Détection mobile (breakpoint 768 px)
  use-toast.ts        Store de toasts
lib/
  activity.ts         Journal d'activité : logActivity(), appelé dans chaque transaction d'écriture
  auth0.ts            Client Auth0 et lecture de la session
  dashboard.ts        Requêtes du tableau de bord personnel
  db.ts               Pool de connexions pg (serveur uniquement)
  diff.ts             Comparaison mot à mot de deux phrases (aperçu des différences)
  examples.ts         Requêtes SQL : création, listes, statistiques, vote, correction, lots
  secrets.ts          Codes d'accès vérifiés côté serveur, cookie signé
  supervision.ts      Requêtes de la route de suivi
  users.ts            Comptes : création à la connexion, prénom/nom, nom affiché
  types.ts            Types BaseEntity, User, Example, Vote, Secret, Stats…
  utils.ts            Helper cn() (clsx + tailwind-merge)
scripts/
  001_create_tables.sql  Schéma de la base
  002_seed.sql           Données de démonstration
  db-setup.mjs           Création de la base et application des scripts SQL
  import-examples.mjs    Import d'un lot de paires depuis un fichier JSON
  lib.mjs                Fonctions partagées des scripts (env, SSL)
  samples/               Fichier JSON d'exemple pour l'import
public/               Icônes et images
proxy.ts              Garde d'entrée : redirige vers /auth/login sans session
```

## Architecture

```
proxy.ts              session Auth0 obligatoire sur tout le site (sauf /auth/* et fichiers statiques)
   ▼
Navigateur (pages "use client")
   │  appel de server action
   ▼
app/actions.ts        validation zod, renvoie des objets de résultat { ok, error } / { outcome }
   ▼
lib/examples.ts       requêtes SQL paramétrées, transaction pour le vote
   ▼
lib/db.ts             pool pg, chaîne de connexion DATABASE_URL
   ▼
PostgreSQL
```

- Les pages n'accèdent jamais à la base directement. Elles appellent les fonctions exportées par [app/actions.ts](app/actions.ts).
- `lib/db.ts` et `lib/examples.ts` importent `server-only` : les importer depuis un composant client fait échouer le build.
- Les server actions renvoient des objets plutôt que de lever des exceptions, car Next.js masque les messages d'erreur côté client en production.
- `pg` est déclaré dans `serverExternalPackages` de `next.config.mjs` pour être chargé par Node sans être bundlé.

## Authentification

L'entrée du site est réservée aux utilisateurs connectés avec un compte Google, via Auth0. Les codes d'accès de la validation et de l'export restent un verrou distinct, appliqué après la connexion.

### Fonctionnement

- [proxy.ts](proxy.ts) s'exécute sur chaque requête (hors fichiers statiques). Il laisse passer les routes `/auth/*`, montées par le SDK (`/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/profile`), et redirige toute autre requête sans session vers `/auth/login?returnTo=<page demandée>`.
- [lib/auth0.ts](lib/auth0.ts) instancie le client Auth0 avec `connection: "google-oauth2"` : le visiteur arrive directement sur Google, sans écran de choix Auth0. Supprimez cette option pour proposer toutes les connexions activées sur le tenant.
- La session est un cookie chiffré avec `AUTH0_SECRET`. Le layout la lit pour afficher le nom, l'avatar et le menu de compte dans l'en-tête ; les server actions la revérifient avant toute requête SQL.
- Le lien de déconnexion est une balise `<a>` brute : un `<Link>` Next.js préchargerait `/auth/logout` et déconnecterait l'utilisateur.
- Tout compte Google est accepté. Pour restreindre (par exemple au domaine `sonapar.mg`), ajoutez une Action post-login dans Auth0 qui refuse les autres adresses.

### Comptes utilisateurs et traçabilité

- Chaque identité Auth0 a une ligne dans la table `users`, créée à la première visite ou action, puis rafraîchie à chaque action (e-mail, nom affiché et photo Google, `last_seen_at`). Le helper `requireUser()` de [app/actions.ts](app/actions.ts) s'en charge et renvoie l'`id` à utiliser.
- Toute ligne écrite par un utilisateur porte son `id` dans `created_by` (et `deleted_by` lors d'une suppression logique), colonnes héritées de `base_entity`.
- Chaque action est en plus consignée dans la table `activity_log`, dans la même transaction que l'action : qui, quoi, sur quelle ligne, état avant et après. Actions journalisées aujourd'hui : `user.create`, `user.update_profile`, `example.submit`, `example.vote`, `example.delete`. Pour relire l'historique d'une personne :

  ```sql
  SELECT created_at, action, entity_type, entity_id, before, after, details
  FROM activity_log WHERE created_by = '<users.id>' ORDER BY created_at DESC;
  ```
- Un compte peut être désactivé avec `UPDATE users SET is_delete = true, deleted_at = NOW() WHERE email = '…'` : ses actions sont alors refusées avec « Ce compte est désactivé ».
- La page **Mon compte** (`/account`, menu de l'avatar) permet de saisir un prénom et un nom, facultatifs. S'ils sont renseignés, ils remplacent le nom Google dans la barre de navigation. Google ne les écrase jamais.
- La page **Mon tableau de bord** (`/dashboard`, menu de l'avatar) résume, pour l'utilisateur connecté : ce qu'il a fait (soumissions, corrections, votes, rejets, imports, d'après le journal), ce que sont devenues ses contributions (validées, en attente, rejetées, avec le taux de validation), ce qui reste à faire pour tout le monde (à corriger, à valider sans son vote), et tout son journal d'activité par pages de 10 (`/dashboard?page=N`) avec l'exemple concerné et son statut actuel. Le bouton **Télécharger l'activité** va chercher tout ce que l'utilisateur a fait et le livre en un fichier JSON : résumé, contributions avec leur statut actuel, journal complet (5 000 lignes au plus). Le bouton Rafraîchir recharge les chiffres sans quitter la page. Les exemples qu'il a lui-même rejetés à la correction ne comptent pas comme contributions.

### Configuration du tenant Auth0

1. Créer une application de type **Regular Web Application**.
2. Dans ses *Settings*, renseigner :
   - *Allowed Callback URLs* : `http://localhost:3000/auth/callback` (et l'URL de production, `https://<domaine>/auth/callback`)
   - *Allowed Logout URLs* : `http://localhost:3000` (et `https://<domaine>`)
3. Copier *Domain*, *Client ID* et *Client Secret* dans `.env.local`.
4. Dans *Authentication → Social*, vérifier que **Google** est activé et coché pour l'application. Auth0 fournit des clés Google de développement ; pour la production, créer un client OAuth dans Google Cloud Console et saisir son ID et son secret dans la connexion Google d'Auth0.

Le plan Free d'Auth0 couvre 25 000 utilisateurs actifs par mois et les connexions sociales sans limite.

## Parcours utilisateur

```
yarn import:examples ──► INSERT examples (to_correct, origin synthetic/web)
                              │
Accueil (/)                   ▼
   ├─► Corriger (/correct)  ──► claimNextExample / correctExample ──► status pending
   ├─► Soumettre (/submit)  ──► submitExample ──► INSERT examples (pending) ──► Merci (/thanks)
   ├─► Valider (/review)    ──► code requis ──► voteOnExample ──► transaction votes + examples
   └─► Exporter (/export)   ──► fetchExportData ──► code requis ──► téléchargement JSON/CSV
```

### Soumission

Les champs « Phrase incorrecte » et « Phrase corrigée » sont obligatoires (vérifiés côté client puis par zod côté serveur). Les tags sont saisis séparés par des virgules et stockés en tableau. La source est libre. L'exemple est créé avec le statut `pending` et `created_by` = utilisateur connecté.

### Validation

- La page liste les exemples `pending` du plus récent au plus ancien, par pages de 10 (pagination côté serveur, composant [components/pager.tsx](components/pager.tsx)). Quand une page se vide à force de votes, la suite de la file remonte automatiquement.
- Le votant est l'utilisateur connecté (`votes.created_by`). L'index unique `(example_id, created_by)` empêche un double vote, quel que soit le navigateur ; la violation (code Postgres `23505`) est renvoyée comme `outcome: "duplicate"`.
- Le vote et la mise à jour des compteurs se font dans **une seule transaction SQL** avec incrément côté base (`votes_up = votes_up + 1`), donc deux votes simultanés ne se perdent pas.
- **Seuils** : `VALIDATE_THRESHOLD` et `REJECT_THRESHOLD` dans [lib/examples.ts](lib/examples.ts), tous deux à 1 actuellement. Un vote négatif l'emporte sur un vote positif si les deux seuils sont atteints. L'exemple quitte la file dès qu'il change de statut.

### Export

- Les statistiques (total, par statut, nombre de votes) sont calculées en une seule requête SQL.
- Le filtre de statut (tous, validés, en attente, rejetés) s'applique à la liste exportée.
- Les fichiers sont générés dans le navigateur et nommés `gec-corpus-<filtre>-<AAAA-MM-JJ>.json` ou `.csv`.

## Import et correction

Les paires produites par un script (données synthétiques) ou collectées sur le web entrent par un import, puis sont relues une par une avant de rejoindre la file de validation.

### Format du fichier

Un tableau JSON d'objets, voir [scripts/samples/synthetic-sample.json](scripts/samples/synthetic-sample.json) :

```json
[
  {
    "id": 1,
    "incorrect": "Nis fahamaizana tny amn rovan Antsahadita, ny alin'ny alarobia teo.",
    "correct": "Nisy fahamaizana teny amin'ny Rovan'Antsahadinta, ny alin'ny alarobia teo.",
    "error_types": ["VOYELLES_SUPPRIMEES", "PONCTUATION_MANQUANTE", "TYPO_DIST1"]
  }
]
```

`id`, `error_types`, `tags` et `source` sont facultatifs. Sans `id`, la position dans le fichier en tient lieu.

### Import

```bash
yarn import:examples fichier.json --batch "rova-2026-11" --origin synthetic --note "description" --user vous@exemple.mg
```

- Le lot (`batches`) est créé s'il n'existe pas. `--origin` vaut `synthetic` (défaut) ou `web`.
- Les lignes sont validées d'abord, puis insérées par lots de 1 000 dans une seule transaction : un fichier de 170 000 paires passe en une dizaine de secondes en local et en quelques minutes sur Supabase, et rien n'est écrit en cas d'erreur.
- Chaque paire est insérée avec le statut `to_correct`, l'objet JSON d'origine conservé intact dans `import_payload`, et les codes d'erreur dédoublonnés dans `error_types`.
- Rejouable : une paire déjà importée (même lot, même `id`) est ignorée.
- Les codes d'erreur absents du référentiel `error_types` y sont ajoutés avec un libellé provisoire, à ajuster en base.
- `--user` désigne le compte au nom duquel l'import est journalisé (`batch.import`). Il est facultatif s'il n'y a qu'un compte en base. Connectez-vous une fois à l'application avant le premier import.

### Page Corriger

- Accessible à tout utilisateur connecté, sans code. Filtre par lot, compteur des exemples restants.
- Un seul exemple à la fois, réservé dix minutes au correcteur (`locked_by`, `locked_at`) pour que plusieurs personnes puissent corriger sans se croiser. Un exemple passé reste réservé jusqu'à l'expiration et ne revient donc pas immédiatement.
- Les deux phrases sont éditables ; sous chacune, les mots qui diffèrent de l'autre phrase sont surlignés. Les types d'erreur sont pré-cochés depuis le fichier.
- **Envoyer en validation** (ou Ctrl+Entrée) enregistre la correction, note `corrected_by` et `corrected_at`, et passe l'exemple en `pending`. **Passer** le laisse à corriger. **Rejeter** le passe en `rejected` sans validation.
- Chaque geste est journalisé : `example.correct` (avec les textes avant et après), `example.skip`, `example.reject`.

## Modèle de données

### Table mère `base_entity`

Toutes les tables métier héritent de `base_entity` (héritage PostgreSQL, `INHERITS`) et possèdent donc ces colonnes en plus des leurs :

| Colonne | Type | Description |
|---|---|---|
| `is_delete` | `boolean` | `true` si la ligne est supprimée logiquement (défaut `false`) |
| `created_at` | `timestamptz` | Date de création |
| `deleted_at` | `timestamptz` | Date de suppression logique, `null` sinon |
| `created_by` | `uuid` | `users.id` de l'auteur de la ligne, `null` pour les données antérieures aux comptes |
| `deleted_by` | `uuid` | `users.id` de l'auteur de la suppression logique |

Les clés étrangères de `created_by` et `deleted_by` vers `users(id)` ne s'héritent pas : le script les déclare sur chaque table.

**Suppression logique uniquement.** Aucune ligne n'est jamais effacée avec `DELETE` : supprimer revient à poser `is_delete = true` et `deleted_at = NOW()`, et toutes les requêtes de l'application filtrent sur `is_delete = false`. La fonction `softDeleteExample()` de [lib/examples.ts](lib/examples.ts) marque un exemple et ses votes dans une même transaction ; aucune page ne l'appelle encore, elle devra être exposée derrière une vérification d'accès.

Rappels sur l'héritage PostgreSQL : les clés primaires, contraintes d'unicité et clés étrangères ne sont pas héritées, chaque table déclare les siennes ; une colonne ajoutée à `base_entity` apparaît automatiquement dans toutes les tables filles.

### Table `users`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `auth0_sub` | `text` | Identifiant Auth0, unique (ex. `google-oauth2|1098…`) |
| `email` | `text` | E-mail fourni par Google |
| `display_name` | `text` | Nom fourni par Google |
| `picture_url` | `text` | Photo fournie par Google |
| `first_name` | `text` | Prénom, facultatif, saisi sur la page Mon compte |
| `last_name` | `text` | Nom, facultatif, saisi sur la page Mon compte |
| `last_seen_at` | `timestamptz` | Dernière action |

Plus les colonnes héritées de `base_entity`.

### Table `batches`

Un lot par fichier importé.

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `name` | `text` | Nom du lot, unique |
| `origin` | `text` | `synthetic` ou `web` |
| `note` | `text` | Description libre |

Plus les colonnes héritées de `base_entity` (`created_by` = qui a importé).

### Table `error_types`

Référentiel des types d'erreur, affiché en cases à cocher sur Soumettre et Corriger. Pré-rempli par le schéma ; les codes inconnus rencontrés à l'import y sont ajoutés.

| Colonne | Type | Description |
|---|---|---|
| `code` | `text` | Clé primaire, ex. `VOYELLES_SUPPRIMEES` |
| `label` | `text` | Libellé affiché |
| `sort_order` | `integer` | Ordre d'affichage |

Plus les colonnes héritées de `base_entity`. Modifier un libellé : `UPDATE error_types SET label = '…' WHERE code = '…';`

### Table `examples`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `incorrect_text` | `text` | Phrase contenant des erreurs (obligatoire) |
| `correct_text` | `text` | Phrase corrigée (obligatoire) |
| `tags` | `text[]` | Tags libres, vide par défaut |
| `source` | `text` | Source ou référence, nullable |
| `status` | `text` | `to_correct`, `pending`, `validated` ou `rejected` (défaut `pending`) |
| `votes_up` | `integer` | Nombre de votes positifs |
| `votes_down` | `integer` | Nombre de votes négatifs |
| `origin` | `text` | `manual` (saisie directe), `synthetic` ou `web` |
| `batch_id` | `uuid` | Lot d'import, `null` pour une saisie directe |
| `external_id` | `text` | Identifiant dans le fichier importé |
| `error_types` | `text[]` | Codes de `error_types` cochés |
| `import_payload` | `jsonb` | Objet importé d'origine, jamais modifié |
| `corrected_by` / `corrected_at` | `uuid` / `timestamptz` | Correcteur et date de la correction (ou du rejet) |
| `locked_by` / `locked_at` | `uuid` / `timestamptz` | Réservation pendant la correction, expire après dix minutes |

Plus les colonnes héritées de `base_entity`. Cycle de vie : `to_correct` (importé) → `pending` (soumis ou corrigé) → `validated` ou `rejected`. Index unique sur `(batch_id, external_id)` pour rendre l'import rejouable.

### Table `votes`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `example_id` | `uuid` | Référence `examples.id`, suppression en cascade |
| `voter_hash` | `text` | Identifiant navigateur des votes antérieurs aux comptes, `null` depuis |
| `vote` | `integer` | `1` (valider) ou `-1` (rejeter) |

Plus les colonnes héritées de `base_entity` ; le votant est `created_by`. Index unique `(example_id, created_by)` : un vote par utilisateur et par exemple, y compris après suppression logique du vote. L'ancienne contrainte `(example_id, voter_hash)` est conservée pour les votes d'avant les comptes.

### Table `secrets`

| Colonne | Type | Description |
|---|---|---|
| `type` | `text` | Clé primaire : `validate` (page de validation) ou `export` (téléchargement) |
| `code` | `text` | Code d'accès en clair |
| `updated_at` | `timestamptz` | Date de dernière modification, à mettre à jour manuellement |

Plus les colonnes héritées de `base_entity`.

Le schéma insère les deux codes initiaux avec `ON CONFLICT DO NOTHING` : un code modifié en base n'est pas écrasé quand le script est rejoué. Pour changer un code :

```sql
UPDATE secrets SET code = 'nouveau_code', updated_at = NOW() WHERE type = 'validate';
```

### Table `activity_log`

Journal de toutes les actions des utilisateurs. Une ligne par action, écrite dans la même transaction que l'action, jamais modifiée ni supprimée. `created_by`, hérité de `base_entity`, est ici obligatoire et désigne l'utilisateur qui agit.

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `action` | `text` | Code de l'action, ex. `example.vote`, `user.update_profile` |
| `entity_type` | `text` | `example`, `vote`, `user` ou `batch` |
| `entity_id` | `uuid` | Ligne concernée, `null` si non applicable |
| `before` | `jsonb` | État avant l'action, `null` à la création |
| `after` | `jsonb` | État après l'action |
| `details` | `jsonb` | Complément : sens du vote, nombre de lignes touchées… |

Plus les colonnes héritées de `base_entity`. Index sur `(created_by, created_at)` et `(entity_type, entity_id)`.

Les types TypeScript correspondants sont déclarés dans [lib/types.ts](lib/types.ts) (`BaseEntity`, étendu par `User`, `Example`, `Vote`, `Secret` et `ActivityLog`) et doivent être maintenus à la main en cas d'évolution du schéma.

### Mise à niveau d'une base existante

Les sections 3 et 4 de `scripts/001_create_tables.sql` mettent à niveau les tables créées avant la table mère : ajout de `is_delete`, `created_at`, `deleted_at`, `created_by` et `deleted_by` si elles manquent, `created_at` rendu non nul, rattachement de chaque table à `base_entity`, `voter_hash` rendu nullable, puis déclaration des clés étrangères vers `users`. Elles sont sans effet sur une table déjà à jour, le script reste donc rejouable partout.

## Formats d'export

### JSON

```json
[
  {
    "incorrect": "Je suis alle au marché.",
    "correct": "Je suis allé au marché.",
    "error_types": ["VOYELLES_SUPPRIMEES"],
    "tags": ["orthographe"],
    "source": null,
    "status": "validated",
    "origin": "synthetic",
    "batch": "rova-2026-11",
    "external_id": "1",
    "votes_up": 2,
    "votes_down": 0
  }
]
```

### CSV

```csv
incorrect,correct,error_types,tags,source,status,origin,batch,external_id,votes_up,votes_down
"Je suis alle au marché.","Je suis allé au marché.","VOYELLES_SUPPRIMEES","orthographe","","validated","synthetic","rova-2026-11","1",2,0
```

Les guillemets dans les textes sont échappés en les doublant. Les types d'erreur et les tags sont joints par `", "` dans une seule colonne. `batch` et `external_id` sont vides pour une saisie directe.

## Codes d'accès

Trois codes vivent dans la table `secrets`, un par type, créés et pré-remplis par le schéma. Pour en changer un :

```sql
UPDATE secrets SET code = 'nouveau_code', updated_at = NOW() WHERE type = 'supervision';
```

| Type | Protège | Vérification |
|---|---|---|
| `supervision` | La route de suivi `/supervision` | **Côté serveur**, voir ci-dessous |
| `validate` | La page Valider | Côté client, constante `VALIDATION_CODE` dans [app/review/page.tsx](app/review/page.tsx) |
| `export` | Le téléchargement sur Exporter | Côté client, constante `EXPORT_CODE` dans [app/export/page.tsx](app/export/page.tsx) |

Pour `validate` et `export`, les pages comparent encore la saisie à des constantes dans le code client, identiques aux valeurs en base : elles sont visibles par quiconque inspecte le bundle, et les server actions ne les vérifient pas. C'est un garde-fou contre les accès accidentels, pas une authentification. Un changement de ces deux codes doit être fait **à la fois** en base et dans les constantes, tant qu'elles ne passent pas par le mécanisme serveur.

### Route de suivi `/supervision`

Route sans lien dans la navigation, réservée à la supervision. Elle demande le code `supervision`, vérifié **côté serveur** ([lib/secrets.ts](lib/secrets.ts)) :

- la saisie est comparée au code en base ; réussite ou échec sont journalisés (`supervision.unlock`, sans le code) ;
- après une saisie correcte, un cookie httpOnly de douze heures porte un jeton HMAC du code signé avec `AUTH0_SECRET`, jamais le code lui-même ;
- à chaque affichage, le jeton est recomparé au code **actuellement** en base : changer le code en base révoque tous les accès en cours. Le bouton Verrouiller supprime le cookie.

Contenu : totaux du corpus, progression de chaque lot (validés, en attente, rejetés, à corriger), et un tableau par utilisateur (soumis, corrigés, passés, rejetés, votes, contributions validées / en attente / rejetées, dernière activité). Le lien Détail ouvre `/supervision/<users.id>` : le même tableau de bord que celui de l'utilisateur, avec son journal paginé et le bouton Télécharger l'activité, qui livre le JSON complet de cet utilisateur. Chaque téléchargement est journalisé (`activity.export`, avec l'utilisateur visé).

## Thème et design

- Tailwind CSS v4 sans fichier `tailwind.config` : les couleurs sont des variables CSS `oklch` déclarées dans [app/globals.css](app/globals.css) et exposées à Tailwind via `@theme inline`.
- Palette : primaire teal, accent corail, token supplémentaire `--success` (vert) utilisable en `bg-success`, `text-success`, etc.
- Un thème sombre est défini sous la classe `.dark`, mais aucun basculement n'est câblé (le `ThemeProvider` n'est pas monté dans le layout).
- Police Geist et Geist Mono chargées via `next/font/google`.
- Ajout de composants shadcn/ui : `npx shadcn@latest add <nom>` (configuration dans `components.json`).

## Limites connues

- **Codes d'accès côté client.** Une fois connecté avec Google, tout utilisateur peut appeler les server actions ; les codes de validation et d'export ne sont vérifiés que dans le navigateur.
- **Tout compte Google accepté.** Aucune restriction de domaine ou liste d'utilisateurs n'est appliquée par défaut.
- **Pas de rôles.** Tous les comptes ont les mêmes droits ; la suppression logique n'est exposée nulle part faute de rôle administrateur.
- **Seuil de validation très bas.** Un seul vote suffit à valider ou rejeter.
- **Erreurs TypeScript ignorées au build** (`typescript.ignoreBuildErrors: true` dans `next.config.mjs`). Utilisez `yarn typecheck`.
- **Lint non configuré.** Le script `lint` échoue faute de configuration ESLint.
- **Fichiers dupliqués ou obsolètes** : `hooks/use-toast.ts` et `components/ui/use-toast.ts` sont identiques, de même que `hooks/use-mobile.ts` et `components/ui/use-mobile.tsx` ; `styles/globals.css` est une copie non importée de l'ancien thème.
- **Script `start:dev`** utilise une syntaxe POSIX (`NODE_ENV=development`) qui ne fonctionne pas sous PowerShell ou cmd.

## Déploiement et production sur Supabase

Supabase est un PostgreSQL managé : l'application s'y connecte avec `pg` exactement comme en local, seule la chaîne de connexion change. La clé `anon` et l'API REST de Supabase ne sont plus utilisées.

### Chaîne de connexion

Dans le tableau de bord Supabase, *Project Settings → Database → Connection string* :

| Mode | Port | Usage |
|---|---|---|
| Transaction pooler | 6543 | Recommandé pour Vercel et tout hébergement serverless |
| Session pooler | 5432 | Serveur Node persistant (VPS, Railway, etc.) |
| Direct connection | 5432 | IPv6 par défaut (IPv4 en option payante), à éviter depuis Vercel |

Déclarez-la dans `DATABASE_URL` chez l'hébergeur, sans paramètre `sslmode`. Avec l'intégration Supabase ↔ Vercel, la variable `POSTGRES_URL` est posée automatiquement et acceptée en l'absence de `DATABASE_URL`.

### Chiffrement

Pour un hôte distant, la connexion est chiffrée par défaut (`DATABASE_SSL=require`, certificat non vérifié, ce qu'impose le certificat Supabase signé par sa propre autorité). Pour vérifier le certificat, passez `DATABASE_SSL=verify-full` et collez dans `DATABASE_SSL_CA` l'autorité téléchargeable depuis le tableau de bord.

### Schéma et données existantes

Les tables créées à l'époque Supabase sont mises à niveau par le script lui-même (colonnes de la table mère, rattachement à `base_entity`, création de `users` et des clés de traçabilité), les données restent en place. Le script est idempotent : rejouez-le dans l'éditeur SQL de Supabase ou depuis votre poste :

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres"
yarn db:setup
```

Les policies RLS existantes peuvent rester : le rôle `postgres`, propriétaire des tables, n'y est pas soumis. Elles ne protègent plus rien puisque l'API REST n'est plus appelée depuis le navigateur ; la sécurité repose désormais sur le fait que `DATABASE_URL` ne quitte jamais le serveur.

### Étapes

1. Récupérer la chaîne « Transaction pooler » du projet Supabase et vérifier le schéma (étape ci-dessus).
2. Déclarer `DATABASE_URL` et les cinq variables Auth0 dans les variables d'environnement de l'hébergeur, avec `APP_BASE_URL` égal à l'URL publique.
3. Ajouter cette URL publique aux *Allowed Callback URLs* (`/auth/callback`) et *Allowed Logout URLs* de l'application Auth0, et remplacer les clés Google de développement par les vôtres.
4. Déployer la branche `main`. La branche de travail est `develop`.
