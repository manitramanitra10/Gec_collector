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
- [Parcours utilisateur](#parcours-utilisateur)
- [Modèle de données](#modèle-de-données)
- [Formats d'export](#formats-dexport)
- [Codes d'accès](#codes-daccès)
- [Thème et design](#thème-et-design)
- [Limites connues](#limites-connues)
- [Déploiement et production sur Supabase](#déploiement-et-production-sur-supabase)

## Fonctionnalités

- **Soumission** d'une paire de phrases (incorrecte / corrigée) avec tags et source optionnels, sans compte utilisateur.
- **Validation communautaire** : vote positif ou négatif sur les exemples en attente, un vote par navigateur et par exemple.
- **Export** du corpus en JSON ou CSV, filtrable par statut, avec tableau de statistiques (totaux, validés, en attente, rejetés, votes).
- Interface en français, responsive, avec thème teal/corail et animation de confettis après soumission.

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, server actions) + React 19 |
| Langage | TypeScript 5 |
| Base de données | PostgreSQL 13 ou plus, accès via `pg` (node-postgres) |
| Validation | zod (entrées des server actions) |
| Styles | Tailwind CSS v4, variables CSS `oklch` |
| Composants | shadcn/ui (style `new-york`), Radix UI, `lucide-react` |
| Analytics | `@vercel/analytics` |

Le projet a été initialement généré avec [v0.app](https://v0.app) sur Supabase, puis migré vers un accès PostgreSQL direct.

## Prérequis

- Node.js 20 ou supérieur
- Yarn (le lockfile de référence est `yarn.lock` ; `pnpm-lock.yaml` est un fichier vide)
- Un serveur PostgreSQL 13 ou plus, accessible localement (service Windows, Homebrew, apt, etc.)

## Installation

```bash
git clone <url-du-depot>
cd Gec_collector
yarn install
cp .env.example .env.local
```

Adaptez ensuite la chaîne de connexion dans `.env.local` :

```
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@localhost:5432/gec_collector
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

Ces variables n'ont pas de préfixe `NEXT_PUBLIC_` : elles ne sont jamais exposées au navigateur.

## Scripts

| Commande | Description |
|---|---|
| `yarn dev` | Serveur de développement avec rechargement à chaud |
| `yarn build` | Build de production |
| `yarn start` | Sert le build de production |
| `yarn db:setup` | Crée la base locale et applique le schéma |
| `yarn db:seed` | Comme `db:setup`, plus les données de démonstration |
| `yarn typecheck` | Vérification TypeScript (`tsc --noEmit`) ; le build ignore les erreurs de type |
| `yarn lint` | Déclaré mais non fonctionnel : aucune configuration ESLint n'est présente |

Il n'y a pas de suite de tests.

## Structure du projet

```
app/
  layout.tsx          Layout racine : métadonnées, police Geist, Header, Analytics
  actions.ts          Server actions : seule porte d'entrée des pages vers la base
  page.tsx            Page d'accueil
  submit/page.tsx     Formulaire de soumission
  review/page.tsx     File de validation (protégée par code)
  export/page.tsx     Statistiques et export JSON/CSV (téléchargement protégé par code)
  thanks/page.tsx     Page de remerciement avec confettis
  globals.css         Thème (variables CSS, Tailwind v4, keyframes confettis)
components/
  header.tsx          Barre de navigation sticky
  confetti.tsx        Animation de confettis
  theme-provider.tsx  Wrapper next-themes (non monté actuellement)
  ui/                 Composants shadcn/ui
hooks/
  use-mobile.ts       Détection mobile (breakpoint 768 px)
  use-toast.ts        Store de toasts
lib/
  db.ts               Pool de connexions pg (serveur uniquement)
  examples.ts         Requêtes SQL : création, listes, statistiques, vote transactionnel
  types.ts            Types Example, Vote, Stats, ExampleFilter
  utils.ts            Helper cn() (clsx + tailwind-merge)
scripts/
  001_create_tables.sql  Schéma de la base
  002_seed.sql           Données de démonstration
  db-setup.mjs           Création de la base et application des scripts SQL
public/               Icônes et images
```

## Architecture

```
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

## Parcours utilisateur

```
Accueil (/)
   ├─► Soumettre (/submit) ──► submitExample ──► INSERT examples (pending) ──► Merci (/thanks)
   ├─► Valider (/review)   ──► code requis ──► voteOnExample ──► transaction votes + examples
   └─► Exporter (/export)  ──► fetchExportData ──► code requis ──► téléchargement JSON/CSV
```

### Soumission

Les champs « Phrase incorrecte » et « Phrase corrigée » sont obligatoires (vérifiés côté client puis par zod côté serveur). Les tags sont saisis séparés par des virgules et stockés en tableau. La source est libre. L'exemple est créé avec le statut `pending`.

### Validation

- La page charge les 20 exemples `pending` les plus récents.
- Chaque navigateur reçoit un identifiant anonyme (`crypto.randomUUID()`) stocké dans `localStorage` sous la clé `voter_hash`. La contrainte d'unicité `(example_id, voter_hash)` empêche un double vote ; la violation (code Postgres `23505`) est renvoyée comme `outcome: "duplicate"`.
- Le vote et la mise à jour des compteurs se font dans **une seule transaction SQL** avec incrément côté base (`votes_up = votes_up + 1`), donc deux votes simultanés ne se perdent pas.
- **Seuils** : `VALIDATE_THRESHOLD` et `REJECT_THRESHOLD` dans [lib/examples.ts](lib/examples.ts), tous deux à 1 actuellement. Un vote négatif l'emporte sur un vote positif si les deux seuils sont atteints. L'exemple quitte la file dès qu'il change de statut.

### Export

- Les statistiques (total, par statut, nombre de votes) sont calculées en une seule requête SQL.
- Le filtre de statut (tous, validés, en attente, rejetés) s'applique à la liste exportée.
- Les fichiers sont générés dans le navigateur et nommés `gec-corpus-<filtre>-<AAAA-MM-JJ>.json` ou `.csv`.

## Modèle de données

### Table `examples`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `incorrect_text` | `text` | Phrase contenant des erreurs (obligatoire) |
| `correct_text` | `text` | Phrase corrigée (obligatoire) |
| `tags` | `text[]` | Tags libres, vide par défaut |
| `source` | `text` | Source ou référence, nullable |
| `status` | `text` | `pending`, `validated` ou `rejected` (défaut `pending`) |
| `votes_up` | `integer` | Nombre de votes positifs |
| `votes_down` | `integer` | Nombre de votes négatifs |
| `created_at` | `timestamptz` | Date de création |

### Table `votes`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Clé primaire, générée |
| `example_id` | `uuid` | Référence `examples.id`, suppression en cascade |
| `voter_hash` | `text` | Identifiant anonyme du votant |
| `vote` | `integer` | `1` (valider) ou `-1` (rejeter) |
| `created_at` | `timestamptz` | Date du vote |

Contrainte d'unicité sur `(example_id, voter_hash)`.

Les types TypeScript correspondants sont déclarés dans [lib/types.ts](lib/types.ts) et doivent être maintenus à la main en cas d'évolution du schéma.

## Formats d'export

### JSON

```json
[
  {
    "incorrect": "Je suis alle au marché.",
    "correct": "Je suis allé au marché.",
    "tags": ["orthographe"],
    "source": null,
    "status": "validated",
    "votes_up": 2,
    "votes_down": 0
  }
]
```

### CSV

```csv
incorrect,correct,tags,source,status,votes_up,votes_down
"Je suis alle au marché.","Je suis allé au marché.","orthographe","","validated",2,0
```

Les guillemets dans les textes sont échappés en les doublant. Les tags sont joints par `", "` dans une seule colonne.

## Codes d'accès

La page de validation et le téléchargement des exports demandent un code. Ces codes sont des constantes définies **côté client** :

- `VALIDATION_CODE` dans [app/review/page.tsx](app/review/page.tsx)
- `EXPORT_CODE` dans [app/export/page.tsx](app/export/page.tsx)

Ils sont donc visibles par quiconque inspecte le bundle JavaScript, et les server actions ne les vérifient pas. Il s'agit d'un simple garde-fou contre les accès accidentels, pas d'une authentification. Pour les modifier, changez la valeur des constantes.

## Thème et design

- Tailwind CSS v4 sans fichier `tailwind.config` : les couleurs sont des variables CSS `oklch` déclarées dans [app/globals.css](app/globals.css) et exposées à Tailwind via `@theme inline`.
- Palette : primaire teal, accent corail, token supplémentaire `--success` (vert) utilisable en `bg-success`, `text-success`, etc.
- Un thème sombre est défini sous la classe `.dark`, mais aucun basculement n'est câblé (le `ThemeProvider` n'est pas monté dans le layout).
- Police Geist et Geist Mono chargées via `next/font/google`.
- Ajout de composants shadcn/ui : `npx shadcn@latest add <nom>` (configuration dans `components.json`).

## Limites connues

- **Aucune authentification.** Tout visiteur peut soumettre et voter ; les codes d'accès sont côté client uniquement et les server actions sont appelables par n'importe quel client HTTP.
- **Anonymat du votant.** L'identifiant est stocké en `localStorage` ; vider le stockage ou changer de navigateur permet de revoter.
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

Les tables créées à l'époque Supabase ont les mêmes colonnes : rien à migrer, les données restent en place. `scripts/001_create_tables.sql` n'utilise que `CREATE … IF NOT EXISTS`, vous pouvez donc le rejouer sans risque dans l'éditeur SQL de Supabase ou depuis votre poste :

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres"
yarn db:setup
```

Les policies RLS existantes peuvent rester : le rôle `postgres`, propriétaire des tables, n'y est pas soumis. Elles ne protègent plus rien puisque l'API REST n'est plus appelée depuis le navigateur ; la sécurité repose désormais sur le fait que `DATABASE_URL` ne quitte jamais le serveur.

### Étapes

1. Récupérer la chaîne « Transaction pooler » du projet Supabase et vérifier le schéma (étape ci-dessus).
2. Déclarer `DATABASE_URL` dans les variables d'environnement de l'hébergeur.
3. Déployer la branche `main`. La branche de travail est `develop`.
