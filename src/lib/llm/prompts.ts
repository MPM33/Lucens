// ─────────────────────────────────────────────────────────────────────────────
// Couche LLM — Construction des prompts
// Substitution des variables de template + formatage du contexte d'assemblage
// ─────────────────────────────────────────────────────────────────────────────

import type { StepAnswer } from '@/protocol/types'
import type { ProtocolStep } from '@/protocol/types'
import type { AssemblyContext } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Substitution des variables dans les templates d'étape
// Variables disponibles : {{user_response}}, {{free_text}}, {{step_label}}
// Variables étape 7 uniquement : {{algo_orientation}}, {{tension_percent}}
// ─────────────────────────────────────────────────────────────────────────────

type StepPromptVars = {
  user_response: string
  free_text?: string
  step_label: string
  // Étape 7 uniquement
  algo_orientation?: string
  tension_percent?: number
}

export function buildStepUserPrompt(
  step: ProtocolStep,
  answer: StepAnswer,
  vars: Omit<StepPromptVars, 'user_response' | 'step_label'> & { algo_orientation?: string; tension_percent?: number },
): string {
  const userResponse = formatAnswerForPrompt(step, answer)

  const allVars: StepPromptVars = {
    user_response: userResponse,
    free_text: answer.free_text ?? '',
    step_label: step.label,
    ...vars,
  }

  return substituteVars(step.llm_prompt_template, allVars)
}

/**
 * Formate la réponse utilisatrice en texte lisible pour le LLM.
 */
function formatAnswerForPrompt(step: ProtocolStep, answer: StepAnswer): string {
  if (answer.scale_value !== undefined) {
    return `${answer.scale_value}/5`
  }

  if (answer.choice_id && step.scoring.input_type === 'multiple_choice') {
    const option = step.scoring.options.find((o) => o.id === answer.choice_id)
    return option?.label ?? answer.choice_id
  }

  if (answer.composite_values && step.scoring.input_type === 'composite') {
    const parts: string[] = []
    for (const subInput of step.scoring.sub_inputs) {
      const subAnswer = answer.composite_values[subInput.id]
      if (!subAnswer) continue

      if (subAnswer.scale_value !== undefined) {
        parts.push(`${subInput.label} : ${subAnswer.scale_value}/5`)
      } else if (subAnswer.choice_id && subInput.options) {
        const option = subInput.options.find((o) => o.id === subAnswer.choice_id)
        parts.push(`${subInput.label} : ${option?.label ?? subAnswer.choice_id}`)
      }
    }
    return parts.join(' | ')
  }

  return answer.free_text ?? '(non répondu)'
}

function substituteVars(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    return value !== undefined ? String(value) : `{{${key}}}`
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt d'assemblage du rapport final
// ─────────────────────────────────────────────────────────────────────────────

export function buildAssemblyUserPrompt(ctx: AssemblyContext): string {
  const subScoresFormatted = Object.entries(ctx.sub_scores)
    .map(([k, v]) => `  - ${k}: ${v}/100`)
    .join('\n')

  const stepAnalysesFormatted = ctx.step_interpretations
    .map((s, i) => `ÉTAPE ${i + 1} — ${s.step_label} :\n${s.prose}`)
    .join('\n\n')

  const timingWarnings = Object.entries(ctx.timing_flags)
    .filter(([, v]) => v)
    .map(([k]) => {
      const labels: Record<string, string> = {
        impulsive_risk: '⚠ Risque de décision impulsive détecté (urgence élevée + estime basse)',
        limited_influence: '⚠ Fenêtre d\'influence perçue comme faible',
        early_relationship: '⚠ Relation récente (< 3 mois) — prudence sur les décisions définitives',
      }
      return labels[k] ?? k
    })
    .join('\n')

  const gutCheckSection = ctx.coherence_gap !== null
    ? `TENSION INTERNE : ${ctx.tension_percent}% (écart entre l'intuition de l'utilisatrice et l'orientation calculée)`
    : 'Pas de gut-check disponible (étape 7 non répondue)'

  const shortCircuitSection = ctx.short_circuit_triggered
    ? `Note : le court-circuit "${ctx.short_circuit_triggered}" a été déclenché — l'orientation est ferme.`
    : ''

  const plan7 = ctx.action_plan_7_days.map((a, i) => `${i + 1}. ${a}`).join('\n')
  const plan30 = ctx.action_plan_30_days.map((a, i) => `${i + 1}. ${a}`).join('\n')
  const indicators = ctx.tracking_indicators.map((a, i) => `${i + 1}. ${a}`).join('\n')

  return `
RÉSULTATS DU SCORING ALGORITHMIQUE
───────────────────────────────────
Score final : ${ctx.final_score}/100
Orientation recommandée : ${ctx.orientation_label}
Description de l'orientation : ${ctx.orientation_description}

Sous-scores :
${subScoresFormatted}

${gutCheckSection}
${shortCircuitSection}

${timingWarnings ? `ALERTES TIMING :\n${timingWarnings}\n` : ''}

ANALYSES DES 7 ÉTAPES
──────────────────────
${stepAnalysesFormatted}

PLAN D'ACTION (à intégrer dans le rapport)
───────────────────────────────────────────
7 jours :
${plan7}

30 jours :
${plan30}

Indicateurs de suivi :
${indicators}

───────────────────────────────────────────
Rédige maintenant le rapport final de cette session. Commence directement.
`.trim()
}
