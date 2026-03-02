// ─────────────────────────────────────────────────────────────────────────────
// Lucens – Protocole RELATION
// Types fondamentaux du moteur décisionnel
// ─────────────────────────────────────────────────────────────────────────────

export type SubScoreKey =
  | 'alignement'          // La relation est-elle viable ?
  | 'epuisement'          // Quel coût émotionnel ?
  | 'investissement_percu' // L'autre investit-il réellement ?
  | 'estime'              // Quel impact sur la valeur personnelle ?

export type OrientationId =
  | 'rester_en_conscience'
  | 'se_repositionner'
  | 'distance_strategique'
  | 'partir_et_se_proteger'

// ─────────────────────────────────────────────────────────────────────────────
// Inputs utilisateur
// ─────────────────────────────────────────────────────────────────────────────

export type ScaleValue = 1 | 2 | 3 | 4 | 5

// 'direct'  : scale 1 → sub-score bas,  scale 5 → sub-score haut
// 'inverse' : scale 1 → sub-score haut, scale 5 → sub-score bas
export type ScaleDirection = 'direct' | 'inverse'

export type ScaleContribution = {
  direction: ScaleDirection
  // Facteur de contribution relatif pour ce (step, sub-score).
  // Le poids effectif final = step_weight * contribution_factor.
  // Valeur typique : 1.0 (primaire), 0.5 (secondaire), 0.3 (tertiaire).
  contribution_factor: number
}

export type ChoiceOption = {
  id: string
  label: string
  // Valeurs directes 0–100 par sous-score.
  // Un choix peut ne contribuer qu'à un seul sous-score.
  sub_scores: Partial<Record<SubScoreKey, number>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Config de scoring par étape
// ─────────────────────────────────────────────────────────────────────────────

export type ScaleScoringConfig = {
  input_type: 'scale_1_5'
  contribution: Partial<Record<SubScoreKey, ScaleContribution>>
}

export type ChoiceScoringConfig = {
  input_type: 'multiple_choice'
  options: ChoiceOption[]
}

// Sub-input pour les étapes composites (ex : étape 5 - Timing)
export type ProtocolSubInput = {
  id: string
  label: string
  input_type: 'scale_1_5' | 'multiple_choice'
  options?: ChoiceOption[]
  contribution?: Partial<Record<SubScoreKey, ScaleContribution>>
}

export type CompositeScoringConfig = {
  input_type: 'composite'
  sub_inputs: ProtocolSubInput[]
}

export type StepScoringConfig =
  | ScaleScoringConfig
  | ChoiceScoringConfig
  | CompositeScoringConfig

// ─────────────────────────────────────────────────────────────────────────────
// Étape du protocole
// ─────────────────────────────────────────────────────────────────────────────

export type ProtocolStep = {
  id: string
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7
  label: string
  user_prompt: string
  // Texte d'aide affiché sous le prompt principal
  user_hint?: string
  // L'étape expose un champ texte libre en plus de l'input principal
  has_free_text: boolean
  // Poids de cette étape dans la moyenne de ses sous-scores.
  // Étapes critiques : 1.5 | Étapes importantes : 1.2 | Standard : 1.0 | Contextuel : 0.8
  step_weight: number
  scoring: StepScoringConfig
  // Template de prompt LLM pour l'interprétation de cette étape.
  // Variables disponibles : {{user_response}}, {{free_text}}, {{step_label}}
  llm_prompt_template: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Règles de court-circuit
// Ces règles court-circuitent la moyenne pondérée quand une combinaison
// de sous-scores révèle une situation critique évidente.
// Priorité : la première règle qui matche est appliquée.
// ─────────────────────────────────────────────────────────────────────────────

export type ShortCircuitRule = {
  id: string
  // Description lisible pour les tests et le debugging
  description: string
  check: (subScores: Record<SubScoreKey, number>) => boolean
  forced_orientation: OrientationId
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration du scoring global
// ─────────────────────────────────────────────────────────────────────────────

export type SubScoreWeights = Record<SubScoreKey, number>

export type ScoringConfig = {
  // Poids de chaque sous-score dans le calcul du score final.
  sub_score_weights: SubScoreWeights
  // Règles de court-circuit par ordre de priorité.
  short_circuit_rules: ShortCircuitRule[]
  // Micro-ajustement basé sur la cohérence entre intuition (étape 7) et score algo.
  gut_check_adjustment: {
    coherence_bonus: number  // points ajoutés si parfaite cohérence
    opposition_penalty: number  // points retirés si opposition directe
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientations
// ─────────────────────────────────────────────────────────────────────────────

export type Orientation = {
  id: OrientationId
  label: string
  description: string
  score_range: [number, number]
  // Plans d'action inclus dans le rapport
  action_plan_7_days: string[]
  action_plan_30_days: string[]
  // Indicateurs de suivi pour mesurer l'évolution
  tracking_indicators: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Config complète du protocole
// ─────────────────────────────────────────────────────────────────────────────

export type ProtocolConfig = {
  id: string
  version: string
  name: string
  steps: ProtocolStep[]
  scoring: ScoringConfig
  orientations: Orientation[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Réponses utilisateur par session
// ─────────────────────────────────────────────────────────────────────────────

export type StepAnswer = {
  step_id: string
  scale_value?: ScaleValue
  choice_id?: string
  // Pour les étapes composites : clé = sub_input.id
  composite_values?: Record<string, {
    scale_value?: ScaleValue
    choice_id?: string
  }>
  free_text?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Résultat de scoring
// ─────────────────────────────────────────────────────────────────────────────

// Drapeaux contextuels calculés sur l'étape 5 (maturité décisionnelle)
export type TimingFlags = {
  impulsive_risk: boolean      // urgence ressentie élevée (>= 4/5)
  limited_influence: boolean   // fenêtre d'influence perçue faible (<= 2/5)
  early_relationship: boolean  // relation de moins de 3 mois
}

// Distance ordinale entre l'intuition utilisatrice et la recommandation algo.
// 0 = cohérence parfaite | 3 = opposition totale
export type CoherenceGap = 0 | 1 | 2 | 3

export type ScoringResult = {
  sub_scores: Record<SubScoreKey, number>
  // Score brut avant ajustement gut-check (0–100)
  raw_score: number
  // ID de la règle de court-circuit déclenchée, null sinon
  short_circuit_triggered: string | null
  // Orientation déterminée par le score avant gut-check
  raw_orientation: OrientationId
  // Valeur du micro-ajustement appliqué (-5 à +5)
  gut_check_adjustment: number
  // Score final après ajustement (0–100, clampé)
  final_score: number
  // Orientation finale
  orientation: OrientationId
  // Distance entre l'intuition et l'algo (null si étape 7 non répondue)
  coherence_gap: CoherenceGap | null
  // Pourcentage de tension interne (0% = cohérence totale, 100% = opposition totale)
  tension_percent: number | null
}
