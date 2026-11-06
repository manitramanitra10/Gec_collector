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

**Production = Supabase**, atteint par sa chaîne « Transaction pooler » (port 6543). La clé anon, l'API REST et le RLS de Supabase ne sont plus utilisés : le rôle `postgres` est propriétaire des tables et n'est pas soumis aux policies. Les tables créées à l'époque Supabase ont les mêmes colonnes que `scripts/001_create_tables.sql`.

Next.js charge `.env.local` nativement ; `next.config.mjs` importe aussi `dotenv/config` (charge `.env`). `scripts/db-setup.mjs` lit les deux dans le même ordre de priorité. Le `.gitignore` ignore tous les `.env*` sauf `.env.example`.

### Base de données

- Schéma : `scripts/001_create_tables.sql` (tables `examples`, `votes`, index). Idempotent.
- Démo : `scripts/002_seed.sql`, n'insère que si `examples` est vide.
- `scripts/db-setup.mjs` se connecte à la base d'administration `postgres` du même serveur pour créer la base cible, puis applique les SQL. Pas d'outil de migration : une évolution de schéma se fait en modifiant le SQL (de façon idempotente) et `lib/types.ts` à la main.

## Architecture

### Flux de données

```
page "use client"  →  app/actions.ts ("use server")  →  lib/examples.ts  →  lib/db.ts (pool pg)  →  PostgreSQL
```

- Les pages (`app/submit`, `app/review`, `app/export`) sont des composants client et n'importent **que** `app/actions.ts` pour parler à la base. Aucune route API, aucun middleware.
- `lib/db.ts` et `lib/examples.ts` importent `server-only` : les importer depuis un composant client casse le build. Le pool est mis en cache sur `globalThis` pour survivre au HMR.
- `app/actions.ts` valide ses entrées avec zod et **renvoie des objets de résultat** (`{ ok, error }`, `{ outcome: "recorded" | "duplicate" | "not_found" | "error" }`) au lieu de lever des exceptions, car Next.js masque les messages d'erreur des server actions en production. Garder ce pattern pour toute nouvelle action.
- `pg` est listé dans `serverExternalPackages` de `next.config.mjs`.

### Flux de validation

1. `/submit` appelle `submitExample` → `INSERT` avec `status = 'pending'`, puis redirige vers `/thanks`.
2. `/review` charge les 20 derniers `pending` via `fetchPendingExamples`. L'identité du votant est un `crypto.randomUUID()` stocké en `localStorage` sous la clé `voter_hash`.
3. `voteOnExample` → `castVote` dans `lib/examples.ts` : **une transaction** qui insère dans `votes` puis fait `UPDATE examples SET votes_up = votes_up + …, status = CASE …`. La contrainte `UNIQUE(example_id, voter_hash)` lève `23505` → `outcome: "duplicate"` ; une FK invalide lève `23503` → `outcome: "not_found"`.
4. Seuils : `VALIDATE_THRESHOLD` et `REJECT_THRESHOLD` (tous deux à 1) en tête de `lib/examples.ts`. Le rejet l'emporte sur la validation. Un exemple quitte la file dès qu'il n'est plus `pending`.
5. `/export` appelle `fetchExportData(filter)` qui renvoie la liste filtrée et les statistiques (une seule requête SQL à sous-requêtes). Les fichiers JSON/CSV sont générés **dans le navigateur**.

### Codes d'accès

`/review` et le téléchargement sur `/export` sont protégés par un code saisi dans un champ. Ces codes sont des **constantes en clair dans le code client** (`VALIDATION_CODE` dans `app/review/page.tsx`, `EXPORT_CODE` dans `app/export/page.tsx`) et les server actions ne les vérifient pas. C'est un garde-fou, pas une authentification. Ne pas les présenter comme sécurisés.

### Types

`lib/types.ts` déclare `Example`, `Vote`, `Stats`, `ExampleStatus`, `ExampleFilter` : miroirs manuels du schéma SQL. `lib/examples.ts` convertit les lignes pg via `toExample()` (les `timestamptz` arrivent en `Date`, les `count()`/`sum()` en chaînes bigint).

### UI et styles

- shadcn/ui (style `new-york`, Radix, `lucide-react`) dans `components/ui/`. Composants ajoutés via `npx shadcn@latest add <nom>` ; alias définis dans `components.json` (`@/components`, `@/lib`, `@/hooks`).
- Tailwind CSS v4 via `@tailwindcss/postcss`, **sans** `tailwind.config` : les tokens sont des variables CSS `oklch` déclarées dans `app/globals.css` et exposées via `@theme inline`. Token custom `--success` (`bg-success`, `text-success`).
- `app/globals.css` est la feuille réellement importée (par `app/layout.tsx`). `styles/globals.css` est une copie obsolète du thème neutre v0, non importée.
- Le mode sombre est défini par la variante `.dark` mais `components/theme-provider.tsx` n'est pas monté dans le layout : aucun basculement n'est câblé.
- `components/confetti.tsx` dépend de la classe `.confetti-piece` et du keyframe `confetti-fall` déclarés dans `app/globals.css`.

### Doublons à connaître

`hooks/use-toast.ts` et `components/ui/use-toast.ts` sont identiques, de même que `hooks/use-mobile.ts` et `components/ui/use-mobile.tsx`. L'alias canonique selon `components.json` est `@/hooks` ; modifier les deux copies ou supprimer celle de `components/ui/`.

## Conventions

- Textes d'interface en français. Les pages existantes mélangent accents et absence d'accents (« corrigee », « Contribuez a l'IA ») ; préférer les accents corrects pour tout nouveau texte.
- Imports absolus via `@/…` (racine du projet).
- Requêtes SQL toujours paramétrées (`$1`, `$2`…), jamais interpolées.
- Mise en page des pages métier : `min-h-screen bg-background py-12` + conteneur `mx-auto max-w-{2xl,3xl} px-6` + `Card` shadcn. Le `Header` global est monté dans `app/layout.tsx`.
