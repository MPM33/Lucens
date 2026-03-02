// POST /api/sessions/:id/complete — Terminer une session
// ─────────────────────────────────────────────────────────────────────────────
// Flux :
//   1. Charger les 7 réponses depuis l'event log
//   2. Vérifier que toutes les étapes obligatoires sont présentes
//   3. Vérifier le quota une dernière fois (downgrade possible depuis le début)
//   4. Exécuter computeScore (déterministe, synchrone)
//   5. Persister le rapport + débiter le quota
//   6. Démarrer la génération LLM en arrière-plan (streaming vers le client)

import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getSession, getSessionAnswers, completeSession } from '@/lib/db/sessions'
import { canUserStartSession } from '@/lib/db/quotas'
import { computeScore } from '@/protocol/scoring'
import { RELATION_V1 } from '@/protocol/relation-v1.config'

// Étapes obligatoires pour considérer la session comme complète
const REQUIRED_STEPS = [
  'realite_actuelle',
  'dynamique_cachee',
  'cout_emotionnel',
  'alternative_strategique',
  'maturite_decisionnelle',
  'impact_estime',
  // 'direction_sentie' est optionnelle — gut-check non bloquant
]

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  const { id: sessionId } = await params
  const supabase = await createSupabaseServerClient()
  const serviceSupabase = createSupabaseServiceClient()

  // 1. Authentification
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifiée' }, { status: 401 })
  }

  // 2. Vérifier la session
  const session = await getSession(supabase, sessionId, user.id).catch(() => null)
  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }
  if (session.status === 'completed') {
    return NextResponse.json(
      { error: 'already_completed', message: 'Cette session est déjà terminée.' },
      { status: 409 },
    )
  }
  if (session.status === 'abandoned') {
    return NextResponse.json({ error: 'Session abandonnée' }, { status: 409 })
  }

  // 3. Charger les réponses
  const answers = await getSessionAnswers(supabase, sessionId, user.id).catch(() => null)
  if (!answers) {
    return NextResponse.json({ error: 'Erreur chargement réponses' }, { status: 500 })
  }

  // 4. Vérifier que toutes les étapes obligatoires sont présentes
  const answeredStepIds = new Set(answers.map((a) => a.step_id))
  const missingSteps = REQUIRED_STEPS.filter((id) => !answeredStepIds.has(id))
  if (missingSteps.length > 0) {
    return NextResponse.json(
      {
        error: 'incomplete_session',
        missing_steps: missingSteps,
        message: `${missingSteps.length} étape(s) manquante(s) : ${missingSteps.join(', ')}`,
      },
      { status: 422 },
    )
  }

  // 5. Vérifier le quota une dernière fois (protection contre le downgrade mid-session)
  const hasQuota = await canUserStartSession(serviceSupabase, user.id)
  if (!hasQuota) {
    return NextResponse.json(
      { error: 'quota_exceeded', message: 'Quota dépassé.' },
      { status: 403 },
    )
  }

  // 6. Calcul du score (déterministe, synchrone, zéro LLM)
  let scoringResult
  try {
    scoringResult = computeScore(RELATION_V1, answers)
  } catch (err) {
    console.error('[complete] Erreur scoring :', err)
    return NextResponse.json({ error: 'Erreur calcul du score' }, { status: 500 })
  }

  // 7. Persister rapport + débiter quota
  const result = await completeSession(
    supabase,
    serviceSupabase,
    sessionId,
    user.id,
    scoringResult,
  ).catch((err: Error) => {
    console.error('[complete] Erreur persistance :', err.message)
    return null
  })

  if (!result) {
    return NextResponse.json({ error: 'Erreur persistance' }, { status: 500 })
  }

  // 8. Retourner le résultat du scoring immédiatement
  // La prose LLM est générée en arrière-plan (prose_status = 'pending').
  // Le client peut poller GET /api/sessions/:id/report pour suivre l'état.
  return NextResponse.json(
    {
      session_id: sessionId,
      report_id: result.reportId,
      // Résultats déterministes disponibles immédiatement
      scoring: {
        final_score: scoringResult.final_score,
        orientation: scoringResult.orientation,
        sub_scores: scoringResult.sub_scores,
        short_circuit_triggered: scoringResult.short_circuit_triggered,
        coherence_gap: scoringResult.coherence_gap,
        tension_percent: scoringResult.tension_percent,
        timing_flags: scoringResult.timing_flags,
      },
      // Prose LLM en cours de génération
      prose_status: 'pending',
      message: 'Session complétée. Le rapport complet sera disponible dans quelques instants.',
    },
    { status: 200 },
  )
}
