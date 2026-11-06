export type ExampleStatus = "pending" | "validated" | "rejected"
export type ExampleFilter = ExampleStatus | "all"

export interface Example {
  id: string
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
  status: ExampleStatus
  votes_up: number
  votes_down: number
  created_at: string
}

export interface Vote {
  id: string
  example_id: string
  voter_hash: string
  vote: 1 | -1
  created_at: string
}

export interface Stats {
  total: number
  validated: number
  pending: number
  rejected: number
  /** Nombre de lignes dans la table votes. */
  totalVotes: number
  totalVotesUp: number
  totalVotesDown: number
}
