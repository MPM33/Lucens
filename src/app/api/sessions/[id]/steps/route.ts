// POST /api/sessions/:id/steps — Sauvegarder la réponse à une étape
// ─────────────────────────────────────────────────────────────────────────────
// Persistance immédiate à chaque étape (décision 6A).
// L'utilisatrice peut reprendre la session si le LLM échoue ou si elle ferme
// le navigateur — les réponses déjà sauvegardées sont conservées.

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { saveStepAnswer, getSession } from '@/lib/db/sessions'
import { RELATION_V1 } from '@/protocol/relation-v1.config'
import type { StepAnswer } from '@/protocol/types'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const { id: sessionId } = await params
  const supabase = await createSupabaseServerClient()

  // 1. Authentification
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifiée' }, { status: 401 })
  }

  // 2. Vérifier que la session existe et appartient à l'utilisatrice
  const session = await getSession(supabase, sessionId, user.id).catch(() => null)
  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }
  if (session.status !== 'in_progress') {
    return NextResponse.json(
      { error: 'session_not_active', message: 'Cette session est déjà terminée.' },
      { status: 409 },
    )
  }

  // 3. Parser et valider le body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const validation = validateStepAnswerBody(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { step_id, step_position, answer } = validation.data

  // 4. Vérifier que step_id est une étape valide du protocole
  const step = RELATION_V1.steps.find((s) => s.id === step_id)
  if (!step) {
    return NextResponse.json({ error: `Étape inconnue : ${step_id}` }, { status: 400 })
  }
  if (step.position !== step_position) {
    return NextResponse.json(
      { error: `Position incorrecte pour l'étape ${step_id}` },
      { status: 400 },
    )
  }

  // 5. Sauvegarder
  const event = await saveStepAnswer(
    supabase,
    sessionId,
    user.id,
    step_position,
    answer,
  ).catch((err: Error) => {
    console.error('[steps] Erreur sauvegarde :', err.message)
    return null
  })

  if (!event) {
    return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
  }

  return NextResponse.json(
    { event_id: event.id, step_id: event.step_id, answered_at: event.answered_at },
    { status: 201 },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation du body
// ─────────────────────────────────────────────────────────────────────────────

type ValidBody = {
  step_id: string
  step_position: number
  answer: StepAnswer
}

function validateStepAnswerBody(
  body: unknown,
): { ok: true; data: ValidBody } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body attendu : objet JSON' }
  }

  const b = body as Record<string, unknown>

  if (typeof b['step_id'] !== 'string' || !b['step_id']) {
    return { ok: false, error: 'step_id requis (string)' }
  }
  if (typeof b['step_position'] !== 'number' || b['step_position'] < 1 || b['step_position'] > 7) {
    return { ok: false, error: 'step_position requis (entier 1–7)' }
  }

  const answer = b['answer']
  if (typeof answer !== 'object' || answer === null) {
    return { ok: false, error: 'answer requis (objet)' }
  }

  const a = answer as Record<string, unknown>

  // Validation basique : au moins un type de réponse doit être fourni
  const hasScale = typeof a['scale_value'] === 'number'
  const hasChoice = typeof a['choice_id'] === 'string'
  const hasComposite = typeof a['composite_values'] === 'object' && a['composite_values'] !== null

  if (!hasScale && !hasChoice && !hasComposite) {
    return {
      ok: false,
      error: 'answer doit contenir scale_value, choice_id, ou composite_values',
    }
  }

  // Validation des bornes de scale
  if (hasScale && (a['scale_value'] as number < 1 || a['scale_value'] as number > 5)) {
    return { ok: false, error: 'scale_value doit être entre 1 et 5' }
  }

  return {
    ok: true,
    data: {
      step_id: b['step_id'] as string,
      step_position: b['step_position'] as number,
      answer: {
        step_id: b['step_id'] as string,
        ...(a['scale_value'] !== null && a['scale_value'] !== undefined
          ? { scale_value: a['scale_value'] as StepAnswer['scale_value'] }
          : {}),
        ...(a['choice_id'] != null
          ? { choice_id: a['choice_id'] as string }
          : {}),
        ...(a['composite_values'] != null
          ? { composite_values: a['composite_values'] as StepAnswer['composite_values'] }
          : {}),
        ...(a['free_text'] != null
          ? { free_text: a['free_text'] as string }
          : {}),
      },
    },
  }
}
