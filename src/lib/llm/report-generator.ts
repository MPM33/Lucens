// ─────────────────────────────────────────────────────────────────────────────
// Orchestrateur de génération de rapport
//
// Flux :
//   1. Interprétations des étapes en parallèle (Haiku — décision 15A)
//   2. Assemblage du rapport final (Sonnet, streaming ou non)
//   3. Persistance en base
//
// Peut être utilisé en mode streaming (route API) ou en mode batch (retry).
// ─────────────────────────────────────────────────────────────────────────────

import type { ProtocolConfig } from '@/protocol/types'
import type { StepAnswer } from '@/protocol/types'
import type { FullScoringResult } from '@/protocol/scoring'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportStreamEvent, StepInterpretation } from './types'
import { interpretAllSteps } from './step-interpreter'
import { assembleReportStream, assembleReport } from './report-assembler'
import { updateReportProse, markProseAsFailed } from '@/lib/db/sessions'

// ─────────────────────────────────────────────────────────────────────────────
// Mode streaming (route GET /report)
// Yield des événements SSE au fur et à mesure de la génération.
// ─────────────────────────────────────────────────────────────────────────────

export async function* generateReportStream(
  config: ProtocolConfig,
  answers: StepAnswer[],
  scoringResult: FullScoringResult,
  reportId: string,
  serviceSupabase: SupabaseClient,
): AsyncGenerator<ReportStreamEvent> {
  // 1. Étapes en parallèle — émettre chaque analyse dès qu'elle est prête
  let stepInterpretations: StepInterpretation[] = []
  try {
    // Promise.allSettled pour la résistance aux pannes d'une étape individuelle
    const stepPromises = config.steps
      .filter((s) => s.step_weight > 0 || s.id === 'direction_sentie')
      .filter((s) => answers.some((a) => a.step_id === s.id))
      .map(async (step) => {
        const answer = answers.find((a) => a.step_id === step.id)!
        const { interpretStep } = await import('./step-interpreter')
        const interp = await interpretStep(step, answer, scoringResult, config)

        // Émettre l'événement dès que l'étape est prête
        return interp
      })

    // Attendre toutes les étapes (décision 15A : Promise.all parallèle)
    const results = await Promise.allSettled(stepPromises)

    for (const result of results) {
      if (result.status === 'fulfilled') {
        stepInterpretations.push(result.value)
        yield {
          type: 'step_prose',
          step_id: result.value.step_id,
          step_label: result.value.step_label,
          prose: result.value.prose,
        }
      }
    }

    // Trier par position du protocole
    stepInterpretations.sort((a, b) => {
      const posA = config.steps.find((s) => s.id === a.step_id)?.position ?? 99
      const posB = config.steps.find((s) => s.id === b.step_id)?.position ?? 99
      return posA - posB
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[report-generator] Erreur étapes parallèles :', message)
    yield { type: 'error', message: 'Erreur génération des analyses par étape.' }
  }

  // 2. Assemblage en streaming
  yield { type: 'assembly_start' }

  let fullAssemblyProse = ''
  try {
    const assemblyGen = assembleReportStream(config, scoringResult, stepInterpretations)

    for await (const chunk of assemblyGen) {
      fullAssemblyProse += chunk
      yield { type: 'assembly_chunk', text: chunk }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[report-generator] Erreur assemblage :', message)
    await markProseAsFailed(serviceSupabase, reportId, message)
    yield { type: 'error', message: 'Erreur génération du rapport final.' }
    return
  }

  // 3. Persister le rapport complet
  const stepProse: Record<string, string> = {}
  for (const interp of stepInterpretations) {
    stepProse[interp.step_id] = interp.prose
  }

  try {
    await updateReportProse(serviceSupabase, reportId, stepProse, fullAssemblyProse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[report-generator] Erreur persistance prose :', message)
    // Ne pas faire échouer le stream — l'utilisatrice a vu le rapport même si la persist échoue
  }

  yield { type: 'complete', report_id: reportId, assembly_prose: fullAssemblyProse }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode batch (retry, jobs de fond)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateReportBatch(
  config: ProtocolConfig,
  answers: StepAnswer[],
  scoringResult: FullScoringResult,
  reportId: string,
  serviceSupabase: SupabaseClient,
): Promise<void> {
  try {
    // 1. Étapes en parallèle
    const stepInterpretations = await interpretAllSteps(config, answers, scoringResult)

    // 2. Assemblage (non-streaming)
    const assembly = await assembleReport(config, scoringResult, stepInterpretations)

    // 3. Persistance
    const stepProse: Record<string, string> = {}
    for (const interp of stepInterpretations) {
      stepProse[interp.step_id] = interp.prose
    }

    await updateReportProse(serviceSupabase, reportId, stepProse, assembly.prose)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markProseAsFailed(serviceSupabase, reportId, message)
    throw err
  }
}
