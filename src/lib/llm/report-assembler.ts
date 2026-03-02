// ─────────────────────────────────────────────────────────────────────────────
// Assemblage du rapport final (Sonnet + streaming)
//
// Décision 13A : modèle Sonnet pour le rapport visible par l'utilisatrice
// Décision 15A : streaming vers le client (ReadableStream via SSE)
// ─────────────────────────────────────────────────────────────────────────────

import type { ProtocolConfig } from '@/protocol/types'
import type { FullScoringResult } from '@/protocol/scoring'
import type { StepInterpretation, AssemblyResult, AssemblyContext } from './types'
import {
  getAnthropicClient,
  LLM_MODELS,
  MAX_TOKENS,
  ASSEMBLY_SYSTEM_PROMPT_STATIC,
} from './client'
import { buildAssemblyUserPrompt } from './prompts'

/**
 * Construit le contexte d'assemblage à partir des résultats de session.
 */
function buildAssemblyContext(
  config: ProtocolConfig,
  scoringResult: FullScoringResult,
  stepInterpretations: StepInterpretation[],
): AssemblyContext {
  const orientation = config.orientations.find((o) => o.id === scoringResult.orientation)
  if (!orientation) throw new Error(`Orientation inconnue : ${scoringResult.orientation}`)

  return {
    step_interpretations: stepInterpretations,
    final_score: scoringResult.final_score,
    orientation_id: scoringResult.orientation,
    orientation_label: orientation.label,
    orientation_description: orientation.description,
    sub_scores: scoringResult.sub_scores,
    short_circuit_triggered: scoringResult.short_circuit_triggered,
    coherence_gap: scoringResult.coherence_gap,
    tension_percent: scoringResult.tension_percent,
    timing_flags: {
      impulsive_risk: scoringResult.timing_flags.impulsive_risk,
      limited_influence: scoringResult.timing_flags.limited_influence,
      early_relationship: scoringResult.timing_flags.early_relationship,
    },
    action_plan_7_days: orientation.action_plan_7_days,
    action_plan_30_days: orientation.action_plan_30_days,
    tracking_indicators: orientation.tracking_indicators,
  }
}

/**
 * Génère le rapport assemblé avec streaming.
 * Retourne un AsyncGenerator qui yield des chunks de texte au fur et à mesure.
 * L'appelant est responsable de collecter les chunks et de persister le résultat.
 */
export async function* assembleReportStream(
  config: ProtocolConfig,
  scoringResult: FullScoringResult,
  stepInterpretations: StepInterpretation[],
): AsyncGenerator<string, AssemblyResult, unknown> {
  const anthropic = getAnthropicClient()
  const ctx = buildAssemblyContext(config, scoringResult, stepInterpretations)
  const userPrompt = buildAssemblyUserPrompt(ctx)

  const stream = anthropic.messages.stream({
    model: LLM_MODELS.assembly,
    max_tokens: MAX_TOKENS.assembly,
    system: [
      {
        type: 'text',
        text: ASSEMBLY_SYSTEM_PROMPT_STATIC,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  let fullProse = ''

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      const chunk = event.delta.text
      fullProse += chunk
      yield chunk
    }
  }

  const finalMessage = await stream.finalMessage()

  return {
    prose: fullProse,
    model: LLM_MODELS.assembly,
    input_tokens: finalMessage.usage.input_tokens,
    output_tokens: finalMessage.usage.output_tokens,
  }
}

/**
 * Version non-streaming pour les contextes où le streaming n'est pas possible
 * (ex : jobs de fond, retries).
 */
export async function assembleReport(
  config: ProtocolConfig,
  scoringResult: FullScoringResult,
  stepInterpretations: StepInterpretation[],
): Promise<AssemblyResult> {
  const anthropic = getAnthropicClient()
  const ctx = buildAssemblyContext(config, scoringResult, stepInterpretations)
  const userPrompt = buildAssemblyUserPrompt(ctx)

  const response = await anthropic.messages.create({
    model: LLM_MODELS.assembly,
    max_tokens: MAX_TOKENS.assembly,
    system: [
      {
        type: 'text',
        text: ASSEMBLY_SYSTEM_PROMPT_STATIC,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const prose = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  return {
    prose,
    model: LLM_MODELS.assembly,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }
}
