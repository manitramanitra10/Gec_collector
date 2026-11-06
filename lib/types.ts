/**
 * Colonnes de la table mère `base_entity`, héritées par toutes les tables.
 * Suppression logique uniquement : is_delete = true + deleted_at, jamais de DELETE.
 */
export interface BaseEntity {
  is_delete: boolean
  created_at: string
  deleted_at: string | null
}

export type ExampleStatus = "pending" | "validated" | "rejected"
export type ExampleFilter = ExampleStatus | "all"

export interface Example extends BaseEntity {
  id: string
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
  status: ExampleStatus
  votes_up: number
  votes_down: number
}

export interface Vote extends BaseEntity {
  id: string
  example_id: string
  voter_hash: string
  vote: 1 | -1
}

/** Type de code d'accès : page de validation ou téléchargement du corpus. */
export type SecretType = "validate" | "export"

export interface Secret extends BaseEntity {
  type: SecretType
  code: string
  updated_at: string
}

/** Profil minimal de l'utilisateur connecté (Auth0), transmis aux composants client. */
export interface SessionUser {
  name: string | null
  email: string | null
  picture: string | null
}

export interface Stats {
  total: number
  validated: number
  pending: number
  rejected: number
  /** Nombre de lignes actives dans la table votes. */
  totalVotes: number
  totalVotesUp: number
  totalVotesDown: number
}
