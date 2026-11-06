/**
 * Colonnes de la table mère `base_entity`, héritées par toutes les tables.
 * Suppression logique uniquement : is_delete = true + deleted_at, jamais de DELETE.
 */
export interface BaseEntity {
  is_delete: boolean
  created_at: string
  deleted_at: string | null
  /** users.id de l'auteur de la ligne, null pour les données antérieures aux comptes. */
  created_by: string | null
  /** users.id de l'auteur de la suppression logique. */
  deleted_by: string | null
}

/** Compte utilisateur, une ligne par identité Auth0. */
export interface User extends BaseEntity {
  id: string
  auth0_sub: string
  email: string | null
  display_name: string | null
  picture_url: string | null
  first_name: string | null
  last_name: string | null
  last_seen_at: string | null
}

/**
 * Cycle de vie d'un exemple :
 * to_correct (importé, à relire) → pending (soumis ou corrigé, à valider) → validated | rejected.
 */
export type ExampleStatus = "to_correct" | "pending" | "validated" | "rejected"
export type ExampleFilter = ExampleStatus | "all"
export type ExampleOrigin = "manual" | "synthetic" | "web"

export interface Example extends BaseEntity {
  id: string
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
  status: ExampleStatus
  votes_up: number
  votes_down: number
  origin: ExampleOrigin
  batch_id: string | null
  /** Nom du lot, joint depuis `batches`, null pour une saisie directe. */
  batch_name: string | null
  external_id: string | null
  /** Codes de `error_types` cochés. */
  error_types: string[]
  corrected_by: string | null
  corrected_at: string | null
  locked_by: string | null
  locked_at: string | null
  /** Nom affichable de l'auteur (`created_by`), joint depuis `users`. */
  created_by_name: string | null
  /** Nom affichable du correcteur (`corrected_by`), joint depuis `users`. */
  corrected_by_name: string | null
}

/** Lot d'import, avec le nombre d'exemples actifs par statut. */
export interface Batch extends BaseEntity {
  id: string
  name: string
  origin: Exclude<ExampleOrigin, "manual">
  note: string | null
  counts: Record<ExampleStatus, number>
}

/** Type d'erreur du référentiel (case à cocher). */
export interface ErrorType extends BaseEntity {
  code: string
  label: string
  sort_order: number
}

export interface Vote extends BaseEntity {
  id: string
  example_id: string
  /** Identifiant navigateur des votes antérieurs aux comptes ; null depuis. */
  voter_hash: string | null
  vote: 1 | -1
}

/** Type de code d'accès : page de validation, téléchargement du corpus, route de suivi. */
export type SecretType = "validate" | "export" | "supervision"

export interface Secret extends BaseEntity {
  type: SecretType
  code: string
  updated_at: string
}

/** Ligne du journal d'activité ; `created_by` est l'utilisateur qui a agi. */
export interface ActivityLog extends BaseEntity {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  before: unknown
  after: unknown
  details: unknown
}

/** Profil renvoyé par Auth0 dans la session (côté serveur uniquement). */
export interface Auth0Profile {
  sub: string
  email: string | null
  name: string | null
  picture: string | null
}

/** Profil minimal de l'utilisateur connecté, transmis aux composants client. */
export interface SessionUser {
  name: string | null
  email: string | null
  picture: string | null
}

/** Ligne d'activité récente affichée sur le tableau de bord, enrichie de l'exemple ou du lot concerné. */
export interface DashboardActivity {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string | null
  details: unknown
  /** Phrase incorrecte de l'exemple concerné, si l'action porte sur un exemple. */
  example_text: string | null
  example_status: ExampleStatus | null
  batch_name: string | null
}

/** Données du tableau de bord personnel. */
export interface UserDashboard {
  /** Ce que l'utilisateur a fait (comptes tirés du journal). */
  actions: {
    submitted: number
    corrected: number
    rejectedAtCorrection: number
    skipped: number
    votes: number
    votesUp: number
    votesDown: number
    imports: number
  }
  /** Ce que sont devenues ses contributions (soumises ou corrigées), par statut. */
  outcomes: Record<ExampleStatus, number>
  /** Ce qui reste à faire, pour tout le monde. */
  todo: { toCorrect: number; toVote: number }
  /** Journal de l'utilisateur, paginé. */
  recent: { items: DashboardActivity[]; total: number; page: number; pageSize: number; pageCount: number }
}

/** Export JSON complet de l'activité d'un utilisateur (bouton « Télécharger l'activité »). */
export interface UserActivityExport {
  generated_at: string
  user: { id: string; name: string; email: string | null; created_at: string; last_seen_at: string | null }
  summary: UserDashboard["actions"] & { contributions: UserDashboard["outcomes"] }
  contributions: Array<{
    id: string
    role: "submitted" | "corrected"
    status: ExampleStatus
    origin: ExampleOrigin
    batch: string | null
    external_id: string | null
    incorrect_text: string
    correct_text: string
    error_types: string[]
    tags: string[]
    votes_up: number
    votes_down: number
    created_at: string
    corrected_at: string | null
  }>
  activity: Array<{
    created_at: string
    action: string
    entity_type: string
    entity_id: string | null
    before: unknown
    after: unknown
    details: unknown
  }>
}

/** Ligne du tableau « par utilisateur » de la route de suivi. */
export interface UserProgress {
  id: string
  name: string
  email: string | null
  picture_url: string | null
  last_seen_at: string | null
  last_activity_at: string | null
  submitted: number
  corrected: number
  skipped: number
  rejectedAtCorrection: number
  votesUp: number
  votesDown: number
  contributions: { validated: number; pending: number; rejected: number }
}

export interface SupervisionOverview {
  usersCount: number
  stats: Stats
  batches: Batch[]
  users: UserProgress[]
}

export interface Stats {
  total: number
  toCorrect: number
  validated: number
  pending: number
  rejected: number
  /** Nombre de lignes actives dans la table votes. */
  totalVotes: number
  totalVotesUp: number
  totalVotesDown: number
}
