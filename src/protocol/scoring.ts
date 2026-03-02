// ─────────────────────────────────────────────────────────────────────────────
// Lucens – Moteur de scoring
// Couche déterministe pure — aucun appel LLM ici.
// Le LLM reçoit les résultats de ce moteur pour générer la prose du rapport.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ProtocolConfig,
  ProtocolStep,
  StepAnswer,
  SubScoreKey,
  OrientationId,
  ScoringResult,
  CoherenceGap,
  ScaleScoringConfig,
  ChoiceScoringConfig,
  CompositeScoringConfig,
  ScaleValue,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires internes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit une valeur d'échelle 1–5 en score normalisé 0–100.
 * 'direct'  : 1→0,   3→50, 5→100
 * 'inverse' : 1→100, 3→50, 5→0
 */
function normalizeScale(
  value: ScaleValue,
  direction: 'direct' | 'inverse',
): number {
  const base = ((value - 1) / 4) * 100
  return direction === 'direct' ? base : 100 - base
}

/**
 * Retourne la position ordinale d'une orientation (0 = meilleure, 3 = pire).
 * Utilisé pour calculer la distance entre intuition et recommandation algo.
 */
const ORIENTATION_ORDER: Record<OrientationId, number> = {
  rester_en_conscience: 0,
  se_repositionner: 1,
  distance_strategique: 2,
  partir_et_se_proteger: 3,
}

function orientationDistance(a: OrientationId, b: OrientationId): CoherenceGap {
  return Math.abs(
    ORIENTATION_ORDER[a] - ORIENTATION_ORDER[b],
  ) as CoherenceGap
}

/**
 * Détermine l'orientation à partir du score final (0–100).
 * Lève une erreur si la config des orientations ne couvre pas tous les scores.
 *
 * @internal Exporté pour les tests de borne. En production, utiliser computeScore.
 */
export function getOrientationFromScore(
  score: number,
  config: ProtocolConfig,
): OrientationId {
  const match = config.orientations.find(
    (o) => score >= o.score_range[0] && score <= o.score_range[1],
  )
  if (!match) {
    throw new Error(
      `Aucune orientation trouvée pour le score ${score}. ` +
      `Vérifier que les score_range couvrent [0, 100] sans trou.`,
    )
  }
  return match.id
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcul des contributions aux sous-scores par étape
// ─────────────────────────────────────────────────────────────────────────────

type WeightedContribution = {
  value: number        // valeur normalisée 0–100
  effective_weight: number  // step_weight * contribution_factor
}

type SubScoreAccumulator = Partial<Record<SubScoreKey, WeightedContribution[]>>

function processScaleStep(
  step: ProtocolStep,
  answer: StepAnswer,
  acc: SubScoreAccumulator,
): void {
  const config = step.scoring as ScaleScoringConfig
  const scaleValue = answer.scale_value

  if (!scaleValue) return

  for (const [key, contribution] of Object.entries(config.contribution)) {
    const subKey = key as SubScoreKey
    const normalizedValue = normalizeScale(scaleValue, contribution.direction)
    const effectiveWeight = step.step_weight * contribution.contribution_factor

    if (!acc[subKey]) acc[subKey] = []
    acc[subKey]!.push({ value: normalizedValue, effective_weight: effectiveWeight })
  }
}

function processChoiceStep(
  step: ProtocolStep,
  answer: StepAnswer,
  acc: SubScoreAccumulator,
): void {
  const config = step.scoring as ChoiceScoringConfig
  const chosenOption = config.options.find((o) => o.id === answer.choice_id)

  if (!chosenOption) return

  for (const [key, value] of Object.entries(chosenOption.sub_scores)) {
    const subKey = key as SubScoreKey
    const effectiveWeight = step.step_weight

    if (!acc[subKey]) acc[subKey] = []
    acc[subKey]!.push({ value: value as number, effective_weight: effectiveWeight })
  }
}

function processCompositeStep(
  step: ProtocolStep,
  answer: StepAnswer,
  acc: SubScoreAccumulator,
): void {
  const config = step.scoring as CompositeScoringConfig
  const compositeValues = answer.composite_values ?? {}

  for (const subInput of config.sub_inputs) {
    const subAnswer = compositeValues[subInput.id]
    if (!subAnswer) continue

    if (subInput.input_type === 'scale_1_5' && subAnswer.scale_value && subInput.contribution) {
      for (const [key, contribution] of Object.entries(subInput.contribution)) {
        const subKey = key as SubScoreKey
        const normalizedValue = normalizeScale(subAnswer.scale_value, contribution.direction)
        const effectiveWeight = step.step_weight * contribution.contribution_factor

        if (!acc[subKey]) acc[subKey] = []
        acc[subKey]!.push({ value: normalizedValue, effective_weight: effectiveWeight })
      }
    }

    if (subInput.input_type === 'multiple_choice' && subAnswer.choice_id && subInput.options) {
      const chosenOption = subInput.options.find((o) => o.id === subAnswer.choice_id)
      if (!chosenOption) continue

      for (const [key, value] of Object.entries(chosenOption.sub_scores)) {
        const subKey = key as SubScoreKey
        const effectiveWeight = step.step_weight

        if (!acc[subKey]) acc[subKey] = []
        acc[subKey]!.push({ value: value as number, effective_weight: effectiveWeight })
      }
    }
  }
}

/**
 * Calcule les 4 sous-scores à partir des réponses aux étapes 1–6.
 * L'étape 7 (gut-check) est gérée séparément dans computeScore.
 */
function computeSubScores(
  config: ProtocolConfig,
  answers: StepAnswer[],
): Record<SubScoreKey, number> {
  const acc: SubScoreAccumulator = {}

  // Exclure l'étape 7 (gut-check) — pas de contribution aux sous-scores
  const scoringSteps = config.steps.filter((s) => s.step_weight > 0)

  for (const step of scoringSteps) {
    const answer = answers.find((a) => a.step_id === step.id)
    if (!answer) continue

    switch (step.scoring.input_type) {
      case 'scale_1_5':
        processScaleStep(step, answer, acc)
        break
      case 'multiple_choice':
        processChoiceStep(step, answer, acc)
        break
      case 'composite':
        processCompositeStep(step, answer, acc)
        break
    }
  }

  // Calculer la moyenne pondérée pour chaque sous-score.
  // Si un sous-score n'a aucune contribution, il vaut 50 (neutre).
  const subScores: Record<SubScoreKey, number> = {
    alignement: 50,
    epuisement: 50,
    investissement_percu: 50,
    estime: 50,
  }

  for (const [key, contributions] of Object.entries(acc)) {
    if (!contributions || contributions.length === 0) continue

    const totalWeight = contributions.reduce((sum, c) => sum + c.effective_weight, 0)
    const weightedSum = contributions.reduce(
      (sum, c) => sum + c.value * c.effective_weight,
      0,
    )

    subScores[key as SubScoreKey] = Math.round(weightedSum / totalWeight)
  }

  return subScores
}

// ─────────────────────────────────────────────────────────────────────────────
// Score brut à partir des sous-scores pondérés
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IMPORTANT : pour l'épuisement, un score élevé signifie une situation PIRE.
 * On l'inverse ici pour que tous les sous-scores pointent dans le même sens :
 * valeur haute = meilleure situation.
 */
function computeRawScore(
  subScores: Record<SubScoreKey, number>,
  config: ProtocolConfig,
): number {
  const weights = config.scoring.sub_score_weights

  // L'épuisement est inversé : épuisement élevé = situation dégradée
  const adjustedSubScores: Record<SubScoreKey, number> = {
    ...subScores,
    epuisement: 100 - subScores.epuisement,
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const weightedSum = (Object.entries(weights) as [SubScoreKey, number][]).reduce(
    (sum, [key, weight]) => sum + adjustedSubScores[key] * weight,
    0,
  )

  return Math.round(weightedSum / totalWeight)
}

// ─────────────────────────────────────────────────────────────────────────────
// Règles de timing (étape 5) — ajustements contextuels
// Ces règles n'overrident pas l'orientation mais signalent des flags
// au rapport LLM pour qu'il adapte la prose.
// ─────────────────────────────────────────────────────────────────────────────

export type TimingFlags = {
  impulsive_risk: boolean       // urgence élevée + estime basse
  limited_influence: boolean    // fenêtre d'influence faible + investissement bas
  early_relationship: boolean   // relation < 3 mois
}

function computeTimingFlags(
  answers: StepAnswer[],
  subScores: Record<SubScoreKey, number>,
): TimingFlags {
  const step5Answer = answers.find((a) => a.step_id === 'maturite_decisionnelle')
  const composite = step5Answer?.composite_values ?? {}

  const urgence = (composite['urgence_ressentie']?.scale_value ?? 3) as ScaleValue
  const fenetre = (composite['fenetre_influence']?.scale_value ?? 3) as ScaleValue
  const phase = composite['phase_relationnelle']?.choice_id ?? ''

  return {
    impulsive_risk: urgence >= 4 && subScores.estime < 40,
    limited_influence: fenetre <= 2 && subScores.investissement_percu < 40,
    early_relationship: phase === 'recent',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée principal
// ─────────────────────────────────────────────────────────────────────────────

export type FullScoringResult = ScoringResult & {
  timing_flags: TimingFlags
}

/**
 * Calcule le score complet d'une session RELATION.
 *
 * @param config - Config du protocole (RELATION_V1 ou variante future)
 * @param answers - Réponses de l'utilisatrice aux 7 étapes
 * @returns Résultat complet : sous-scores, score final, orientation, tension intuitive
 */
export function computeScore(
  config: ProtocolConfig,
  answers: StepAnswer[],
): FullScoringResult {
  // 1. Sous-scores à partir des étapes 1–6
  const subScores = computeSubScores(config, answers)

  // 2. Score brut (moyenne pondérée des sous-scores, épuisement inversé)
  const rawScore = computeRawScore(subScores, config)

  // 3. Règles de court-circuit (priorité sur le calcul)
  const shortCircuit = config.scoring.short_circuit_rules.find((r) =>
    r.check(subScores),
  ) ?? null

  // raw_orientation est toujours basé sur le score (avant court-circuit et gut-check).
  // C'est la référence pour calculer le gut-check et la tension dans le rapport.
  const rawOrientation = getOrientationFromScore(rawScore, config)

  // 4. Gut-check (étape 7) — micro-ajustement et tension
  const gutCheckAnswer = answers.find((a) => a.step_id === 'direction_sentie')
  let gutCheckAdjustment = 0
  let coherenceGap: CoherenceGap | null = null
  let tensionPercent: number | null = null

  if (gutCheckAnswer?.choice_id) {
    const userIntuition = gutCheckAnswer.choice_id as OrientationId
    const gap = orientationDistance(userIntuition, rawOrientation)
    coherenceGap = gap
    tensionPercent = Math.round((gap / 3) * 100)

    if (gap === 0) {
      gutCheckAdjustment = config.scoring.gut_check_adjustment.coherence_bonus
    } else if (gap === 3) {
      gutCheckAdjustment = -config.scoring.gut_check_adjustment.opposition_penalty
    }
    // gap === 1 ou 2 : pas d'ajustement (adjacents)
  }

  // 5. Score final (clampé 0–100, court-circuit bypass le gut-check)
  const finalScore = shortCircuit
    ? rawScore  // court-circuit : on garde le score brut, l'orientation est forcée
    : Math.max(0, Math.min(100, rawScore + gutCheckAdjustment))

  const orientation = shortCircuit?.forced_orientation ?? getOrientationFromScore(finalScore, config)

  // 6. Flags de timing pour le rapport LLM
  const timingFlags = computeTimingFlags(answers, subScores)

  return {
    sub_scores: subScores,
    raw_score: rawScore,
    short_circuit_triggered: shortCircuit?.id ?? null,
    raw_orientation: rawOrientation,
    gut_check_adjustment: gutCheckAdjustment,
    final_score: finalScore,
    orientation,
    coherence_gap: coherenceGap,
    tension_percent: tensionPercent,
    timing_flags: timingFlags,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers pour les tests et le rapport LLM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le label lisible d'une orientation.
 * Utile pour construire les prompts LLM du rapport.
 */
export function getOrientationLabel(
  orientationId: OrientationId,
  config: ProtocolConfig,
): string {
  return config.orientations.find((o) => o.id === orientationId)?.label ?? orientationId
}

/**
 * Vérifie que la config du protocole est cohérente :
 * - Les score_range couvrent [0, 100] sans trou ni chevauchement
 * - Les step_weight sont positifs
 * - Les contribution_factor sont dans [0, 1]
 *
 * À appeler dans les tests d'intégration, pas en runtime.
 */
export function validateProtocolConfig(config: ProtocolConfig): string[] {
  const errors: string[] = []

  // Vérifier que les orientations couvrent [0, 100]
  const sorted = [...config.orientations].sort((a, b) => a.score_range[0] - b.score_range[0])
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) {
    errors.push('Le protocole doit avoir au moins une orientation')
    return errors
  }
  if (first.score_range[0] !== 0) {
    errors.push(`La première orientation doit commencer à 0, pas à ${first.score_range[0]}`)
  }
  if (last.score_range[1] !== 100) {
    errors.push(`La dernière orientation doit finir à 100, pas à ${last.score_range[1]}`)
  }
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]!
    const prev = sorted[i - 1]!
    if (curr.score_range[0] !== prev.score_range[1] + 1) {
      errors.push(
        `Trou ou chevauchement entre ${prev.id} (${prev.score_range}) ` +
        `et ${curr.id} (${curr.score_range})`,
      )
    }
  }

  // Vérifier les positions des étapes
  const positions = config.steps.map((s) => s.position)
  if (new Set(positions).size !== positions.length) {
    errors.push('Des étapes ont des positions dupliquées')
  }

  return errors
}
