// ─────────────────────────────────────────────────────────────────────────────
// Interprétation LLM d'une étape du protocole
//
// Décision 13A :
//   - Modèle léger (Haiku) pour les étapes intermédiaires
//   - Prompt caching sur le system prompt statique
//   - max_tokens plafonné à 350
//
// Décision 15A :
//   - Ces appels sont conçus pour tourner en Promise.all (parallèle)
// ─────────────────────────────────────────────────────────────────────────────

import type { StepAnswer } from '@/protocol/types'
import type { ProtocolStep, ProtocolConfig } from '@/protocol/types'
import type { FullScoringResult } from '@/protocol/scoring'
import type { StepInterpretation } from './types'
import { getAnthropicClient, LLM_MODELS, MAX_TOKENS, STEP_SYSTEM_PROMPT_STATIC } from './client'
import { buildStepUserPrompt } from './prompts'

/**
 * Interprète une étape du protocole via le LLM (Haiku).
 * Utilise le prompt caching sur la partie statique du system prompt.
 * À appeler en parallèle pour toutes les étapes (Promise.all).
 */
export async function interpretStep(
  step: ProtocolStep,
  answer: StepAnswer,
  scoringResult: FullScoringResult,
  config: ProtocolConfig,
): Promise<StepInterpretation> {
  const anthropic = getAnthropicClient()

  // Contexte supplémentaire pour l'étape 7 (gut-check)
  const extraVars: Record<string, string | number | undefined> = {}
  if (step.id === 'direction_sentie') {
    const orientation = config.orientations.find(
      (o) => o.id === scoringResult.orientation,
    )
    extraVars['algo_orientation'] = orientation?.label ?? scoringResult.orientation
    extraVars['tension_percent'] = scoringResult.tension_percent ?? 0
  }

  const userPrompt = buildStepUserPrompt(step, answer, extraVars)

  const response = await anthropic.messages.create({
    model: LLM_MODELS.steps,
    max_tokens: MAX_TOKENS.step,
    system: [
      {
        type: 'text',
        text: STEP_SYSTEM_PROMPT_STATIC,
        // Prompt caching : ce bloc identique dans toutes les requêtes d'étape
        // est mis en cache après la première utilisation (décision 13A)
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

  const prose = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Métadonnées pour monitoring des coûts
  const cacheReadTokens = (response.usage as Record<string, number>)['cache_read_input_tokens'] ?? 0

  return {
    step_id: step.id,
    step_label: step.label,
    prose,
    model: LLM_MODELS.steps,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_hit: cacheReadTokens > 0,
  }
}

/**
 * Interprète toutes les étapes en parallèle (Promise.all — décision 15A).
 * L'étape 7 (direction_sentie) est optionnelle et n'est interprétée que
 * si l'utilisatrice a répondu.
 */
export async function interpretAllSteps(
  config: ProtocolConfig,
  answers: StepAnswer[],
  scoringResult: FullScoringResult,
): Promise<StepInterpretation[]> {
  // Préparer les paires (step, answer) — ignorer les étapes sans réponse
  const pairs = config.steps
    .filter((step) => step.step_weight > 0 || step.id === 'direction_sentie')
    .map((step) => ({
      step,
      answer: answers.find((a) => a.step_id === step.id),
    }))
    .filter((pair): pair is { step: ProtocolStep; answer: StepAnswer } => pair.answer !== undefined)

  // Lancer toutes les interprétations en parallèle
  const results = await Promise.allSettled(
    pairs.map(({ step, answer }) => interpretStep(step, answer, scoringResult, config)),
  )

  // Collecter les succès, logger les échecs (ne pas bloquer le rapport)
  const interpretations: StepInterpretation[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!
    if (result.status === 'fulfilled') {
      interpretations.push(result.value)
    } else {
      const step = pairs[i]!.step
      console.error(`[llm] Échec interprétation étape ${step.id} :`, result.reason)
      // Fallback : prose vide plutôt qu'un rapport cassé
      interpretations.push({
        step_id: step.id,
        step_label: step.label,
        prose: '',
        model: LLM_MODELS.steps,
        input_tokens: 0,
        output_tokens: 0,
        cache_hit: false,
      })
    }
  }

  // Trier par position pour garantir l'ordre dans le rapport
  return interpretations.sort((a, b) => {
    const posA = config.steps.find((s) => s.id === a.step_id)?.position ?? 99
    const posB = config.steps.find((s) => s.id === b.step_id)?.position ?? 99
    return posA - posB
  })
}
