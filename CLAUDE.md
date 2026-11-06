# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

GEC Collector est une application Next.js 16 (App Router, React 19) de collecte participative de paires de phrases « incorrecte / corrigée » destinées à entraîner un modèle de correction grammaticale (GEC = Grammatical Error Correction). Les données vivent dans Supabase (Postgres + RLS). L'interface est en français ; le projet a été généré avec v0.app puis retravaillé à la main.

La documentation fonctionnelle complète est dans `README.md` : flux utilisateur, modèle de données, formats d'export.

## Commandes

Le lockfile de référence est `yarn.lock` (`pnpm-lock.yaml` est un stub vide).

```bash
yarn install          # dépendances
yarn dev              # serveur de dev sur http://localhost:3000
yarn build            # build de production
yarn start            # sert le build
```

- Il n'y a **pas de tests** ni de runner de test configuré.
- `yarn lint` lance `eslint .` mais aucune config ESLint n'existe et `eslint` n'est pas dans les devDependencies : la commande échoue. Ne pas s'appuyer dessus.
- `yarn start:dev` utilise la syntaxe POSIX `NODE_ENV=... next start` et ne fonctionne pas sous PowerShell/cmd.
- `next.config.mjs` met `typescript.ignoreBuildErrors: true` : le build **passe même avec des erreurs de type**. Pour vérifier les types, lancer `npx tsc --noEmit`.

### Variables d'environnement

Requises (voir `.env.example`) :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`next.config.mjs` importe `dotenv/config`, donc un fichier `.env` est chargé en plus des `.env.local` gérés nativement par Next. Le `.gitignore` ignore tous les `.env*` sauf `.env.example`.

### Base de données

Le schéma est dans `scripts/001_create_tables.sql` et doit être exécuté manuellement dans l'éditeur SQL de Supabase (aucun outil de migration). Il crée les tables `examples` et `votes`, active le RLS avec des policies entièrement publiques (lecture/insertion/mise à jour sur `examples`, lecture/insertion sur `votes`) et les index.

## Architecture

### Tout se passe côté client

Les quatre pages métier (`app/submit`, `app/review`, `app/export`, `app/thanks`) sont des composants `"use client"` qui parlent **directement** à Supabase via `createClient()` de `lib/supabase/client.ts` (clé anonyme). Il n'y a ni route API, ni server action, ni middleware. `lib/supabase/server.ts` existe (client SSR avec cookies) mais **n'est utilisé nulle part**.

Conséquences à garder en tête :

- Toute règle métier est appliquée dans le navigateur et contournable via l'API Supabase. La sécurité réelle repose uniquement sur les policies RLS.
- Les compteurs `votes_up` / `votes_down` et le `status` sont recalculés côté client (lecture puis `update`) dans `app/review/page.tsx` : il n'y a pas de trigger SQL, donc des votes concurrents peuvent se perdre.

### Flux de validation

1. `/submit` insère une ligne dans `examples` avec `status = 'pending'`, puis redirige vers `/thanks`.
2. `/review` charge les 20 derniers exemples `pending`. Un vote insère une ligne dans `votes` ; la contrainte `UNIQUE(example_id, voter_hash)` renvoie le code Postgres `23505` en cas de doublon, intercepté pour afficher « déjà voté ».
3. L'identité du votant est un `crypto.randomUUID()` stocké en `localStorage` sous la clé `voter_hash` (anonyme, un vote par navigateur).
4. Seuils actuels : **un seul** vote positif passe l'exemple en `validated`, un seul vote négatif en `rejected` (`newVotesUp >= 1` / `newVotesDown >= 1`). Un exemple quitte la file dès qu'il change de statut.
5. `/export` calcule des statistiques par plusieurs requêtes `count` et génère les fichiers JSON/CSV **dans le navigateur** (Blob + lien de téléchargement). Le filtre de statut s'applique à la liste exportée.

### Codes d'accès

`/review` et le téléchargement sur `/export` sont protégés par un code saisi dans un champ. Ces codes sont des **constantes en clair dans le code client** (`VALIDATION_CODE` dans `app/review/page.tsx`, `EXPORT_CODE` dans `app/export/page.tsx`), visibles dans le bundle : c'est un simple garde-fou, pas une authentification. Ne pas les présenter comme sécurisés.

### Types

`lib/types.ts` déclare `Example` et `Vote`, miroirs manuels du schéma SQL. Il n'y a pas de types générés par Supabase : toute modification du schéma doit être répercutée à la main ici et dans les requêtes.

### UI et styles

- shadcn/ui (style `new-york`, Radix, `lucide-react`) dans `components/ui/`. Composants ajoutés via `npx shadcn@latest add <nom>` ; alias définis dans `components.json` (`@/components`, `@/lib`, `@/hooks`).
- Tailwind CSS v4 via `@tailwindcss/postcss`, **sans** `tailwind.config` : les tokens sont des variables CSS `oklch` déclarées dans `app/globals.css` et exposées via `@theme inline`. Le projet ajoute un token custom `--success` (utilisé en `bg-success`, `text-success`).
- `app/globals.css` est la feuille réellement importée (par `app/layout.tsx`). `styles/globals.css` est une copie obsolète du thème neutre v0, non importée.
- Le mode sombre est défini par la variante `.dark` mais `components/theme-provider.tsx` n'est pas monté dans le layout : aucun basculement n'est câblé.
- `components/confetti.tsx` dépend de la classe `.confetti-piece` et du keyframe `confetti-fall` déclarés dans `app/globals.css`.

### Doublons à connaître

`hooks/use-toast.ts` et `components/ui/use-toast.ts` sont identiques, de même que `hooks/use-mobile.ts` et `components/ui/use-mobile.tsx`. L'alias canonique selon `components.json` est `@/hooks` ; modifier les deux copies ou supprimer celle de `components/ui/`.

## Conventions

- Textes d'interface en français. Les pages existantes mélangent accents et absence d'accents (« corrigee », « Contribuez a l'IA ») ; préférer les accents corrects pour tout nouveau texte.
- Imports absolus via `@/…` (racine du projet).
- Mise en page des pages métier : `min-h-screen bg-background py-12` + conteneur `mx-auto max-w-{2xl,3xl} px-6` + `Card` shadcn. Le `Header` global est monté dans `app/layout.tsx`.
