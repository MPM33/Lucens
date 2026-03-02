// ─────────────────────────────────────────────────────────────────────────────
// Types des lignes de base de données
// Miroir fidèle du schéma SQL — à synchroniser avec la migration.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoringResult, TimingFlags, SubScoreKey } from '@/protocol/types'

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'
export type PlanTier = 'free' | 'essential' | 'unlimited'
export type ProseStatus = 'pending' | 'generating' | 'completed' | 'failed'
export type WebhookStatus = 'success' | 'failed'

// ─────────────────────────────────────────────────────────────────────────────

export type SessionRow = {
  id: string
  user_id: string
  protocol_id: string
  protocol_version: string
  status: SessionStatus
  started_at: string
  completed_at: string | null
  created_at: string
}

export type SessionEventRow = {
  id: string
  session_id: string
  user_id: string
  step_id: string
  step_position: number
  scale_value: number | null
  choice_id: string | null
  composite_values: Record<string, { scale_value?: number; choice_id?: string }> | null
  free_text: string | null
  answered_at: string
}

export type ReportRow = {
  id: string
  session_id: string
  user_id: string
  // Scoring
  final_score: number
  raw_score: number
  orientation: string
  sub_scores: Record<SubScoreKey, number>
  short_circuit_triggered: string | null
  raw_orientation: string
  gut_check_adjustment: number
  coherence_gap: number | null
  tension_percent: number | null
  timing_flags: TimingFlags
  // Prose LLM
  step_prose: Record<string, string>
  assembly_prose: string | null
  prose_status: ProseStatus
  generated_at: string | null
  created_at: string
}

export type UserQuotaRow = {
  user_id: string
  plan_tier: PlanTier
  readings_completed: number
  quota_limit: number | null
  quota_period_start: string
  quota_reset_at: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  updated_at: string
}

export type ProcessedWebhookEventRow = {
  stripe_event_id: string
  event_type: string
  processed_at: string
  status: WebhookStatus
  error_message: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mapping : DB row → domaine applicatif
// ─────────────────────────────────────────────────────────────────────────────

import type { StepAnswer } from '@/protocol/types'

/**
 * Convertit une ligne session_events en StepAnswer (format attendu par le moteur de scoring).
 */
export function sessionEventToStepAnswer(row: SessionEventRow): StepAnswer {
  return {
    step_id: row.step_id,
    scale_value: row.scale_value as StepAnswer['scale_value'] ?? undefined,
    choice_id: row.choice_id ?? undefined,
    composite_values: row.composite_values as StepAnswer['composite_values'] ?? undefined,
    free_text: row.free_text ?? undefined,
  }
}

/**
 * Convertit un ScoringResult (moteur) en colonnes pour la table reports.
 */
export function scoringResultToReportColumns(
  result: ScoringResult & { timing_flags: TimingFlags },
) {
  return {
    final_score: result.final_score,
    raw_score: result.raw_score,
    orientation: result.orientation,
    sub_scores: result.sub_scores,
    short_circuit_triggered: result.short_circuit_triggered,
    raw_orientation: result.raw_orientation,
    gut_check_adjustment: result.gut_check_adjustment,
    coherence_gap: result.coherence_gap,
    tension_percent: result.tension_percent,
    timing_flags: result.timing_flags,
  }
}
