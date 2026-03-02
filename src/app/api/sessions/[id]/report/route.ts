// GET /api/sessions/:id/report — Récupérer ou générer le rapport
// ─────────────────────────────────────────────────────────────────────────────
// Cycle de vie du rapport :
//   pending    → déclenche la génération LLM + stream SSE vers le client
//   generating → 202 (génération déjà en cours, client doit attendre)
//   completed  → retourne le rapport complet en JSON
//   failed     → retourne le scoring sans prose + flag d'erreur
//
// Anti race condition :
//   La transition pending → generating se fait via un UPDATE conditionnel.
//   Si deux requêtes concurrent, seule la première démarre la génération.
//
// Streaming SSE :
//   Content-Type: text/event-stream
//   Événements : step_prose | assembly_start | assembly_chunk | complete | error

import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getSession, getReport, getSessionAnswers } from '@/lib/db/sessions'
import { generateReportStream } from '@/lib/llm/report-generator'
import { RELATION_V1 } from '@/protocol/relation-v1.config'
import { computeScore } from '@/protocol/scoring'
import type { ReportStreamEvent } from '@/lib/llm/types'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
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
  if (session.status !== 'completed') {
    return NextResponse.json(
      { error: 'session_not_completed', message: 'La session n\'est pas encore terminée.' },
      { status: 422 },
    )
  }

  // 3. Charger le rapport existant
  const report = await getReport(supabase, sessionId, user.id).catch(() => null)
  if (!report) {
    return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
  }

  // 4. Rapport déjà généré → répondre directement en JSON
  if (report.prose_status === 'completed') {
    return NextResponse.json(formatCompleteReport(report), { status: 200 })
  }

  // 5. Génération déjà en cours → 202
  if (report.prose_status === 'generating') {
    return NextResponse.json(
      { status: 'generating', message: 'Rapport en cours de génération. Réessayez dans quelques secondes.' },
      { status: 202 },
    )
  }

  // 6. Génération échouée → retourner le scoring sans prose
  if (report.prose_status === 'failed') {
    return NextResponse.json(
      {
        ...formatCompleteReport(report),
        prose_status: 'failed',
        assembly_prose: null,
        error: 'La génération du rapport a échoué. Les données de scoring restent disponibles.',
      },
      { status: 200 },
    )
  }

  // 7. prose_status === 'pending' → démarrer la génération et streamer
  // Transition atomique pending → generating (anti-concurrent)
  const { data: claimed, error: claimError } = await serviceSupabase
    .from('reports')
    .update({ prose_status: 'generating' })
    .eq('id', report.id)
    .eq('prose_status', 'pending') // condition d'atomicité
    .select('id')
    .maybeSingle()

  if (claimError || !claimed) {
    // Un autre process a commencé la génération entre-temps → 202
    return NextResponse.json(
      { status: 'generating', message: 'Rapport en cours de génération.' },
      { status: 202 },
    )
  }

  // 8. Charger les réponses pour reconstruire le scoring
  const answers = await getSessionAnswers(supabase, sessionId, user.id).catch(() => null)
  if (!answers) {
    return NextResponse.json({ error: 'Erreur chargement réponses' }, { status: 500 })
  }

  // Recalculer le scoring (déterministe, instantané)
  const scoringResult = computeScore(RELATION_V1, answers)

  // 9. Streamer la génération via SSE
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const eventGen = generateReportStream(
          RELATION_V1,
          answers,
          scoringResult,
          report.id,
          serviceSupabase,
        )

        for await (const event of eventGen) {
          const sseChunk = formatSSEEvent(event)
          controller.enqueue(encoder.encode(sseChunk))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        console.error('[report/route] Erreur stream :', message)
        const errorEvent = formatSSEEvent({ type: 'error', message })
        controller.enqueue(encoder.encode(errorEvent))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Désactiver le buffering Nginx
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────

function formatSSEEvent(event: ReportStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function formatCompleteReport(report: Record<string, unknown>) {
  return {
    report_id: report['id'],
    session_id: report['session_id'],
    scoring: {
      final_score:             report['final_score'],
      orientation:             report['orientation'],
      sub_scores:              report['sub_scores'],
      short_circuit_triggered: report['short_circuit_triggered'],
      raw_orientation:         report['raw_orientation'],
      gut_check_adjustment:    report['gut_check_adjustment'],
      coherence_gap:           report['coherence_gap'],
      tension_percent:         report['tension_percent'],
      timing_flags:            report['timing_flags'],
    },
    prose: {
      status:        report['prose_status'],
      step_prose:    report['step_prose'],
      assembly:      report['assembly_prose'],
      generated_at:  report['generated_at'],
    },
    created_at: report['created_at'],
  }
}
