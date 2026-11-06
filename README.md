# GEC Collector

Plateforme web de collecte participative de paires de phrases « incorrecte / corrigée » destinées à constituer un corpus d'entraînement pour la correction grammaticale automatique (GEC, *Grammatical Error Correction*).

Les contributeurs soumettent des exemples de façon anonyme, des relecteurs les valident ou les rejettent, et le corpus validé est exportable en JSON ou CSV.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration de Supabase](#configuration-de-supabase)
- [Scripts](#scripts)
- [Structure du projet](#structure-du-projet)
- [Parcours utilisateur](#parcours-utilisateur)
- [Modèle de données](#modèle-de-données)
- [Formats d'export](#formats-dexport)
- [Codes d'accès](#codes-daccès)
- [Thème et design](#thème-et-design)
- [Limites connues](#limites-connues)
- [Déploiement](#déploiement)

## Fonctionnalités

- **Soumission** d'une paire de phrases (incorrecte / corrigée) avec tags et source optionnels, sans compte utilisateur.
- **Validation communautaire** : vote positif ou négatif sur les exemples en attente, un vote par navigateur et par exemple.
- **Export** du corpus en JSON ou CSV, filtrable par statut, avec tableau de statistiques (totaux, validés, en attente, rejetés, votes).
- Interface en français, responsive, avec thème teal/corail et animation de confettis après soumission.

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Langage | TypeScript 5 |
| Base de données | Supabase (Postgres, Row Level Security) via `@supabase/ssr` |
| Styles | Tailwind CSS v4, variables CSS `oklch` |
| Composants | shadcn/ui (style `new-york`), Radix UI, `lucide-react` |
| Formulaires | react-hook-form + zod (disponibles, non utilisés par les pages actuelles) |
| Analytics | `@vercel/analytics` |

Le projet a été initialement généré avec [v0.app](https://v0.app) puis retravaillé.

## Prérequis

- Node.js 20 ou supérieur
- Yarn (le lockfile de référence est `yarn.lock` ; `pnpm-lock.yaml` est un fichier vide)
- Un projet Supabase

## Installation

```bash
git clone <url-du-depot>
cd Gec_collector
yarn install
cp .env.example .env.local
```

Renseignez ensuite les deux variables dans `.env.local` :

```
NEXT_PUBLIC_SUPABASE_URL=https://<votre-projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon publique>
```

Ces valeurs se trouvent dans le tableau de bord Supabase, menu *Project Settings → API*. Elles sont préfixées `NEXT_PUBLIC_` car elles sont utilisées dans le navigateur.

Lancez enfin le serveur de développement :

```bash
yarn dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

## Configuration de Supabase

Le schéma n'est pas géré par un outil de migration. Exécutez une fois le contenu de [scripts/001_create_tables.sql](scripts/001_create_tables.sql) dans l'éditeur SQL de votre projet Supabase. Le script :

1. crée les tables `examples` et `votes` ;
2. active le Row Level Security sur les deux tables ;
3. ajoute des policies publiques : lecture, insertion et mise à jour sur `examples`, lecture et insertion sur `votes` ;
4. crée les index sur `examples.status`, `examples.created_at` et `votes.example_id`.

Aucune suppression n'est autorisée par les policies.

## Scripts

| Commande | Description |
|---|---|
| `yarn dev` | Serveur de développement avec rechargement à chaud |
| `yarn build` | Build de production |
| `yarn start` | Sert le build de production |
| `yarn lint` | Déclaré mais non fonctionnel : aucune configuration ESLint n'est présente |
| `npx tsc --noEmit` | Vérification des types (le build ignore les erreurs TypeScript, voir [Limites connues](#limites-connues)) |

Il n'y a pas de suite de tests.

## Structure du projet

```
app/
  layout.tsx          Layout racine : métadonnées, police Geist, Header, Analytics
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
  supabase/client.ts  Client Supabase navigateur
  supabase/server.ts  Client Supabase serveur (non utilisé)
  types.ts            Types Example et Vote
  utils.ts            Helper cn() (clsx + tailwind-merge)
scripts/
  001_create_tables.sql  Schéma de la base
public/               Icônes et images
```

## Parcours utilisateur

```
Accueil (/)
   ├─► Soumettre (/submit) ──► insert examples (status = pending) ──► Merci (/thanks)
   ├─► Valider (/review)   ──► code requis ──► vote ──► update examples.status
   └─► Exporter (/export)  ──► statistiques ──► code requis ──► téléchargement JSON/CSV
```

### Soumission

Les champs « Phrase incorrecte » et « Phrase corrigée » sont obligatoires. Les tags sont saisis séparés par des virgules et stockés en tableau. La source est libre (URL ou référence). L'exemple est créé avec le statut `pending`.

### Validation

- La page charge les 20 exemples `pending` les plus récents.
- Chaque navigateur reçoit un identifiant anonyme (`crypto.randomUUID()`) stocké dans `localStorage` sous la clé `voter_hash`. Il sert à empêcher un double vote sur un même exemple grâce à la contrainte d'unicité `(example_id, voter_hash)`.
- **Seuils actuels** : un seul vote positif fait passer l'exemple à `validated`, un seul vote négatif à `rejected`. L'exemple disparaît alors de la file.
- Les compteurs `votes_up` / `votes_down` et le statut sont mis à jour par l'application (lecture puis écriture), pas par un trigger SQL.

### Export

- Les statistiques (total, par statut, nombre de votes) sont calculées par des requêtes `count` séparées.
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

Ils sont donc visibles par quiconque inspecte le bundle JavaScript. Il s'agit d'un simple garde-fou contre les accès accidentels, pas d'une authentification. Pour les modifier, changez la valeur des constantes.

## Thème et design

- Tailwind CSS v4 sans fichier `tailwind.config` : les couleurs sont des variables CSS `oklch` déclarées dans [app/globals.css](app/globals.css) et exposées à Tailwind via `@theme inline`.
- Palette : primaire teal, accent corail, token supplémentaire `--success` (vert) utilisable en `bg-success`, `text-success`, etc.
- Un thème sombre est défini sous la classe `.dark`, mais aucun basculement n'est câblé (le `ThemeProvider` n'est pas monté dans le layout).
- Police Geist et Geist Mono chargées via `next/font/google`.
- Ajout de composants shadcn/ui : `npx shadcn@latest add <nom>` (configuration dans `components.json`).

## Limites connues

- **Logique métier côté client.** Toutes les écritures passent par la clé anonyme Supabase depuis le navigateur. Les policies RLS sont entièrement publiques (lecture, insertion, mise à jour) : n'importe quel client peut modifier `status` ou les compteurs sans passer par l'interface.
- **Votes concurrents.** Les compteurs sont mis à jour par lecture puis écriture ; deux votes simultanés sur le même exemple peuvent se perdre. Un trigger SQL ou une fonction RPC serait plus robuste.
- **Anonymat du votant.** L'identifiant est stocké en `localStorage` ; vider le stockage ou changer de navigateur permet de revoter.
- **Seuil de validation très bas.** Un seul vote suffit à valider ou rejeter.
- **Erreurs TypeScript ignorées au build** (`typescript.ignoreBuildErrors: true` dans `next.config.mjs`).
- **Lint non configuré.** Le script `lint` échoue faute de configuration ESLint.
- **Fichiers dupliqués ou obsolètes** : `hooks/use-toast.ts` et `components/ui/use-toast.ts` sont identiques, de même que `hooks/use-mobile.ts` et `components/ui/use-mobile.tsx` ; `styles/globals.css` est une copie non importée de l'ancien thème.
- **Script `start:dev`** utilise une syntaxe POSIX (`NODE_ENV=development`) qui ne fonctionne pas sous PowerShell ou cmd.

## Déploiement

L'application est conçue pour Vercel (`@vercel/analytics` est intégré). Déclarez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans les variables d'environnement du projet Vercel, puis déployez la branche `main`. La branche de travail est `develop`.
