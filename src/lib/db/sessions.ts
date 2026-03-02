// ─────────────────────────────────────────────────────────────────────────────
// Couche de persistance — Sessions
// Toutes les opérations sur sessions et session_events passent par ici.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StepAnswer } from '@/protocol/types'
import type { SessionRow, SessionEventRow } from './types'
import { sessionEventToStepAnswer, scoringResultToReportColumns } from './types'
import type { FullScoringResult } from '@/protocol/scoring'

// ─────────────────────────────────────────────────────────────────────────────
// Création de session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée une nouvelle session pour l'utilisatrice.
 * Ne débite pas le quota — uniquement à la complétion (décision 6A).
 */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  protocolId = 'relation_v1',
  protocolVersion = '1.0.0',
): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      protocol_id: protocolId,
      protocol_version: protocolVersion,
      status: 'in_progress',
    })
    .select()
    .single()

  if (error) throw new Error(`Erreur création session : ${error.message}`)
  return data as SessionRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistance progressive des étapes (décision 6A)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sauvegarde la réponse à une étape dans l'event log.
 * Si l'étape a déjà été répondue (upsert), la réponse est mise à jour.
 * Cela permet la correction et la reprise de session.
 */
export async function saveStepAnswer(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  stepPosition: number,
  answer: StepAnswer,
): Promise<SessionEventRow> {
  const { data, error } = await supabase
    .from('session_events')
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        step_id: answer.step_id,
        step_position: stepPosition,
        scale_value: answer.scale_value ?? null,
        choice_id: answer.choice_id ?? null,
        composite_values: answer.composite_values ?? null,
        free_text: answer.free_text ?? null,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,step_id' },
    )
    .select()
    .single()

  if (error) throw new Error(`Erreur sauvegarde étape : ${error.message}`)
  return data as SessionEventRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture des réponses d'une session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge toutes les réponses d'une session, triées par position.
 * Vérifie que la session appartient bien à l'utilisatrice.
 */
export async function getSessionAnswers(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<StepAnswer[]> {
  const { data, error } = await supabase
    .from('session_events')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('step_position', { ascending: true })

  if (error) throw new Error(`Erreur lecture session : ${error.message}`)

  return (data as SessionEventRow[]).map(sessionEventToStepAnswer)
}

/**
 * Charge une session et vérifie qu'elle appartient à l'utilisatrice.
 * Lève une erreur si introuvable ou appartenant à quelqu'un d'autre.
 */
export async function getSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Session introuvable')
  return data as SessionRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Complétion de session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marque une session comme complétée et crée l'entrée de rapport initiale.
 * Le quota est débité ici via la fonction service (contourne le RLS).
 *
 * @param serviceSupabase - Client avec service_role_key (contourne RLS pour quota)
 * @param scoringResult   - Résultat du moteur de scoring
 */
export async function completeSession(
  supabase: SupabaseClient,
  serviceSupabase: SupabaseClient,
  sessionId: string,
  userId: string,
  scoringResult: FullScoringResult,
): Promise<{ reportId: string }> {
  const now = new Date().toISOString()

  // 1. Marquer la session comme complétée
  const { error: sessionError } = await supabase
    .from('sessions')
    .update({ status: 'completed', completed_at: now })
    .eq('id', sessionId)
    .eq('user_id', userId)

  if (sessionError) throw new Error(`Erreur complétion session : ${sessionError.message}`)

  // 2. Créer l'entrée de rapport (prose_status = 'pending' initialement)
  const reportColumns = scoringResultToReportColumns(scoringResult)
  const { data: reportData, error: reportError } = await supabase
    .from('reports')
    .insert({
      session_id: sessionId,
      user_id: userId,
      ...reportColumns,
      step_prose: {},
      assembly_prose: null,
      prose_status: 'pending',
    })
    .select('id')
    .single()

  if (reportError) throw new Error(`Erreur création rapport : ${reportError.message}`)

  // 3. Débiter le quota (via service client — contourne RLS)
  const { error: quotaError } = await serviceSupabase.rpc('increment_quota', {
    p_user_id: userId,
  })

  if (quotaError) {
    // Ne pas faire échouer toute la complétion si le quota échoue
    // Log l'erreur mais laisse la session marquée comme complétée
    console.error(`[quota] Erreur incrément quota pour ${userId} :`, quotaError.message)
  }

  return { reportId: (reportData as { id: string }).id }
}

/**
 * Met à jour la prose LLM d'un rapport (appelé après la génération LLM).
 * Utilisé par le service de génération de rapport.
 */
export async function updateReportProse(
  serviceSupabase: SupabaseClient,
  reportId: string,
  stepProse: Record<string, string>,
  assemblyProse: string,
): Promise<void> {
  const { error } = await serviceSupabase
    .from('reports')
    .update({
      step_prose: stepProse,
      assembly_prose: assemblyProse,
      prose_status: 'completed',
      generated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (error) throw new Error(`Erreur mise à jour prose : ${error.message}`)
}

/**
 * Marque la génération de prose comme échouée.
 * L'utilisatrice peut voir le rapport structurel même sans la prose.
 */
export async function markProseAsFailed(
  serviceSupabase: SupabaseClient,
  reportId: string,
  errorMessage: string,
): Promise<void> {
  await serviceSupabase
    .from('reports')
    .update({
      prose_status: 'failed',
      assembly_prose: null,
    })
    .eq('id', reportId)

  console.error(`[report] Prose LLM échouée pour rapport ${reportId} : ${errorMessage}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du rapport
// ─────────────────────────────────────────────────────────────────────────────

export async function getReport(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Rapport introuvable')
  return data
}

/**
 * Liste les sessions complétées d'une utilisatrice (pour l'historique).
 */
export async function getUserSessionHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      protocol_id,
      status,
      started_at,
      completed_at,
      reports (
        final_score,
        orientation,
        prose_status
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Erreur historique : ${error.message}`)
  return data
}
