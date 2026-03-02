// ─────────────────────────────────────────────────────────────────────────────
// Couche LLM — Types
// ─────────────────────────────────────────────────────────────────────────────

export type StepInterpretation = {
  step_id: string
  step_label: string
  prose: string
  // Métadonnées de génération (pour monitoring des coûts — décision 13A)
  model: string
  input_tokens: number
  output_tokens: number
  // True si le prompt a été servi depuis le cache Anthropic
  cache_hit: boolean
}

export type AssemblyResult = {
  prose: string
  model: string
  input_tokens: number
  output_tokens: number
}

// Événements SSE émis par la route /report
export type ReportStreamEvent =
  | { type: 'step_prose';     step_id: string; step_label: string; prose: string }
  | { type: 'assembly_start' }
  | { type: 'assembly_chunk'; text: string }
  | { type: 'complete';       report_id: string; assembly_prose: string }
  | { type: 'error';          message: string }

// Contexte complet passé au prompt d'assemblage
export type AssemblyContext = {
  step_interpretations: StepInterpretation[]
  final_score: number
  orientation_id: string
  orientation_label: string
  orientation_description: string
  sub_scores: Record<string, number>
  short_circuit_triggered: string | null
  coherence_gap: number | null
  tension_percent: number | null
  timing_flags: Record<string, boolean>
  action_plan_7_days: string[]
  action_plan_30_days: string[]
  tracking_indicators: string[]
}
