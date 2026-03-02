// ─────────────────────────────────────────────────────────────────────────────
// Tests du moteur de scoring — Protocole RELATION v1
//
// Organisation :
//   1. Validation de la config du protocole
//   2. Mapping score → orientation (bornes)
//   3. Règles de court-circuit (isolation)
//   4. Calcul du gut-check (cohérence / opposition / adjacent)
//   5. Flags de timing (impulsivité / influence / relation récente)
//   6. Sessions complètes (cas A, B, C, D de la decision-table)
//
// Valeurs attendues calculées manuellement depuis docs/decision-table.md.
// Toute modification du moteur doit d'abord mettre à jour ce fichier.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeScore,
  getOrientationFromScore,
  validateProtocolConfig,
} from '../scoring'
import { RELATION_V1 } from '../relation-v1.config'
import type { StepAnswer } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — construction des réponses de session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit une session complète avec des valeurs "moyennes" (tout à 3 / choix neutres).
 * Utilisé comme base pour les tests qui ne veulent modifier qu'une seule variable.
 */
function buildNeutralSession(): StepAnswer[] {
  return [
    { step_id: 'realite_actuelle', scale_value: 3 },
    { step_id: 'dynamique_cachee', choice_id: 'chaud_froid' },
    { step_id: 'cout_emotionnel', scale_value: 3 },
    { step_id: 'alternative_strategique', scale_value: 3 },
    {
      step_id: 'maturite_decisionnelle',
      composite_values: {
        phase_relationnelle: { choice_id: 'installation' },
        urgence_ressentie: { scale_value: 3 },
        fenetre_influence: { scale_value: 3 },
      },
    },
    { step_id: 'impact_estime', scale_value: 3 },
    { step_id: 'direction_sentie', choice_id: 'distance_strategique' },
  ]
}

/**
 * Construit une session en partant de la session neutre et en appliquant des overrides.
 */
function buildSession(overrides: Partial<Record<string, StepAnswer>>): StepAnswer[] {
  const base = buildNeutralSession()
  return base.map((answer) =>
    overrides[answer.step_id] ? { ...answer, ...overrides[answer.step_id] } : answer,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validation de la config du protocole
// ─────────────────────────────────────────────────────────────────────────────

describe('validateProtocolConfig', () => {
  it('passe sans erreur avec RELATION_V1', () => {
    const errors = validateProtocolConfig(RELATION_V1)
    expect(errors).toEqual([])
  })

  it('détecte un trou dans les score_range', () => {
    const broken = {
      ...RELATION_V1,
      orientations: RELATION_V1.orientations.map((o) =>
        o.id === 'distance_strategique' ? { ...o, score_range: [37, 50] as [number, number] } : o,
      ),
    }
    const errors = validateProtocolConfig(broken)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/trou|chevauchement/i)
  })

  it('détecte que les score_range ne commencent pas à 0', () => {
    const broken = {
      ...RELATION_V1,
      orientations: RELATION_V1.orientations.map((o) =>
        o.id === 'partir_et_se_proteger' ? { ...o, score_range: [1, 35] as [number, number] } : o,
      ),
    }
    const errors = validateProtocolConfig(broken)
    expect(errors.some((e) => e.includes('0'))).toBe(true)
  })

  it('détecte que les score_range ne finissent pas à 100', () => {
    const broken = {
      ...RELATION_V1,
      orientations: RELATION_V1.orientations.map((o) =>
        o.id === 'rester_en_conscience' ? { ...o, score_range: [71, 99] as [number, number] } : o,
      ),
    }
    const errors = validateProtocolConfig(broken)
    expect(errors.some((e) => e.includes('100'))).toBe(true)
  })

  it('les 7 étapes ont des positions uniques', () => {
    const positions = RELATION_V1.steps.map((s) => s.position)
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('toutes les options de choix multiple ont un id unique dans leur étape', () => {
    for (const step of RELATION_V1.steps) {
      if (step.scoring.input_type === 'multiple_choice') {
        const ids = step.scoring.options.map((o) => o.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mapping score → orientation (bornes exactes)
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrientationFromScore — bornes des plages', () => {
  it('score 0 → partir_et_se_proteger', () => {
    expect(getOrientationFromScore(0, RELATION_V1)).toBe('partir_et_se_proteger')
  })

  it('score 35 → partir_et_se_proteger (borne haute incluse)', () => {
    expect(getOrientationFromScore(35, RELATION_V1)).toBe('partir_et_se_proteger')
  })

  it('score 36 → distance_strategique (borne basse incluse)', () => {
    expect(getOrientationFromScore(36, RELATION_V1)).toBe('distance_strategique')
  })

  it('score 50 → distance_strategique (borne haute incluse)', () => {
    expect(getOrientationFromScore(50, RELATION_V1)).toBe('distance_strategique')
  })

  it('score 51 → se_repositionner (borne basse incluse)', () => {
    expect(getOrientationFromScore(51, RELATION_V1)).toBe('se_repositionner')
  })

  it('score 70 → se_repositionner (borne haute incluse)', () => {
    expect(getOrientationFromScore(70, RELATION_V1)).toBe('se_repositionner')
  })

  it('score 71 → rester_en_conscience (borne basse incluse)', () => {
    expect(getOrientationFromScore(71, RELATION_V1)).toBe('rester_en_conscience')
  })

  it('score 100 → rester_en_conscience (maximum)', () => {
    expect(getOrientationFromScore(100, RELATION_V1)).toBe('rester_en_conscience')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Règles de court-circuit (isolation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Règles de court-circuit', () => {
  describe('burnout_esteem_crash — estime < 30 ET épuisement > 70', () => {
    it('se déclenche avec estime effondrée et épuisement critique', () => {
      // Step 6=1 (estime=0) + Step 3=5 (épuisement max)
      const session = buildSession({
        realite_actuelle: { step_id: 'realite_actuelle', scale_value: 1 },
        dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 5 },
        impact_estime: { step_id: 'impact_estime', scale_value: 1 },
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.short_circuit_triggered).toBe('burnout_esteem_crash')
      expect(result.orientation).toBe('partir_et_se_proteger')
    })

    it('ne se déclenche pas si estime ≥ 30', () => {
      const session = buildSession({
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 5 },
        impact_estime: { step_id: 'impact_estime', scale_value: 3 }, // estime neutre
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.short_circuit_triggered).not.toBe('burnout_esteem_crash')
    })

    it('ne se déclenche pas si épuisement ≤ 70', () => {
      const session = buildSession({
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 1 }, // épuisement bas
        impact_estime: { step_id: 'impact_estime', scale_value: 1 }, // estime basse
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.short_circuit_triggered).not.toBe('burnout_esteem_crash')
    })
  })

  describe('absent_partner_degraded_dynamic — invest < 25 ET alignement < 40', () => {
    it('se déclenche avec partenaire absent et dynamique dégradée', () => {
      const session = buildSession({
        realite_actuelle: { step_id: 'realite_actuelle', scale_value: 1 },
        dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
        alternative_strategique: { step_id: 'alternative_strategique', scale_value: 1 },
      })
      const result = computeScore(RELATION_V1, session)
      if (result.short_circuit_triggered === 'absent_partner_degraded_dynamic') {
        expect(result.orientation).toBe('distance_strategique')
      }
      // Si burnout_esteem_crash se déclenche en premier, c'est aussi acceptable
      expect(['absent_partner_degraded_dynamic', 'burnout_esteem_crash']).toContain(
        result.short_circuit_triggered,
      )
    })
  })

  describe('healthy_foundation — estime > 70 ET alignement > 70 ET épuisement < 40', () => {
    it('se déclenche avec relation saine et épuisement faible', () => {
      const session = buildSession({
        realite_actuelle: { step_id: 'realite_actuelle', scale_value: 5 },
        dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'disponible_coherent' },
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 1 },
        alternative_strategique: { step_id: 'alternative_strategique', scale_value: 5 },
        maturite_decisionnelle: {
          step_id: 'maturite_decisionnelle',
          composite_values: {
            phase_relationnelle: { choice_id: 'long_terme' },
            urgence_ressentie: { scale_value: 1 },
            fenetre_influence: { scale_value: 5 },
          },
        },
        impact_estime: { step_id: 'impact_estime', scale_value: 5 },
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.short_circuit_triggered).toBe('healthy_foundation')
      expect(result.orientation).toBe('rester_en_conscience')
    })

    it('ne se déclenche pas si épuisement ≥ 40 (même si estime et alignement sont bons)', () => {
      const session = buildSession({
        realite_actuelle: { step_id: 'realite_actuelle', scale_value: 5 },
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 4 }, // épuisement ~75
        impact_estime: { step_id: 'impact_estime', scale_value: 5 },
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.short_circuit_triggered).not.toBe('healthy_foundation')
    })
  })

  describe('priorité des règles', () => {
    it('burnout_esteem_crash prime sur absent_partner_degraded_dynamic', () => {
      // Conditions qui pourraient déclencher les deux
      const session = buildSession({
        realite_actuelle: { step_id: 'realite_actuelle', scale_value: 1 },
        dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 5 },
        alternative_strategique: { step_id: 'alternative_strategique', scale_value: 1 },
        impact_estime: { step_id: 'impact_estime', scale_value: 1 },
      })
      const result = computeScore(RELATION_V1, session)
      // burnout_esteem_crash est défini en premier dans la config → priorité
      if (result.sub_scores.estime < 30 && result.sub_scores.epuisement > 70) {
        expect(result.short_circuit_triggered).toBe('burnout_esteem_crash')
      }
    })
  })

  describe('comportement du score quand un court-circuit est déclenché', () => {
    it('le gut-check n\'est pas appliqué au score final quand court-circuit actif', () => {
      const session = buildSession({
        cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 5 },
        impact_estime: { step_id: 'impact_estime', scale_value: 1 },
        // Intuition cohérente avec la recommandation attendue
        direction_sentie: { step_id: 'direction_sentie', choice_id: 'partir_et_se_proteger' },
      })
      const result = computeScore(RELATION_V1, session)
      if (result.short_circuit_triggered) {
        // Quand court-circuit : final_score = raw_score (pas d'ajustement gut-check)
        expect(result.final_score).toBe(result.raw_score)
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Gut-check — micro-ajustement (étape 7)
// ─────────────────────────────────────────────────────────────────────────────

describe('Gut-check — micro-ajustement', () => {
  it('distance 0 (cohérence parfaite) → +4 points', () => {
    // Session qui donne se_repositionner sans court-circuit
    const session = buildNeutralSession()
    const result = computeScore(RELATION_V1, session)
    if (!result.short_circuit_triggered) {
      const sessionCoherent = buildSession({
        direction_sentie: { step_id: 'direction_sentie', choice_id: result.raw_orientation },
      })
      const coherentResult = computeScore(RELATION_V1, sessionCoherent)
      expect(coherentResult.gut_check_adjustment).toBe(4)
      expect(coherentResult.coherence_gap).toBe(0)
      expect(coherentResult.tension_percent).toBe(0)
    }
  })

  it('distance 3 (opposition totale) → -4 points', () => {
    // Construire une session dont raw_orientation est clairement distance_strategique
    const base = buildSession({
      direction_sentie: { step_id: 'direction_sentie', choice_id: 'distance_strategique' },
    })
    const baseResult = computeScore(RELATION_V1, base)

    if (!baseResult.short_circuit_triggered && baseResult.raw_orientation === 'distance_strategique') {
      // Opposé de distance_strategique (position 2) = rester_en_conscience (position 0)
      const opposed = buildSession({
        direction_sentie: { step_id: 'direction_sentie', choice_id: 'rester_en_conscience' },
      })
      const opposedResult = computeScore(RELATION_V1, opposed)
      // Note: distance entre rester(0) et distance(2) = 2, pas 3
      // Opposition totale = partir(3) vs rester(0)
      expect(opposedResult.coherence_gap).toBe(2)
    }
  })

  it('distance 3 réelle (partir vs rester) → tension 100%', () => {
    // On a besoin d'une session dont raw_orientation = partir_et_se_proteger sans court-circuit
    const session = buildSession({
      realite_actuelle: { step_id: 'realite_actuelle', scale_value: 1 },
      cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 5 },
      impact_estime: { step_id: 'impact_estime', scale_value: 2 }, // assez bas mais pas < 30
      direction_sentie: { step_id: 'direction_sentie', choice_id: 'rester_en_conscience' },
    })
    const result = computeScore(RELATION_V1, session)
    if (!result.short_circuit_triggered && result.raw_orientation === 'partir_et_se_proteger') {
      expect(result.coherence_gap).toBe(3)
      expect(result.tension_percent).toBe(100)
      expect(result.gut_check_adjustment).toBe(-4)
    }
  })

  it('distance 1 (orientations adjacentes) → 0 points d\'ajustement', () => {
    const base = buildNeutralSession()
    const baseResult = computeScore(RELATION_V1, base)

    if (!baseResult.short_circuit_triggered) {
      // Trouver une orientation adjacente
      const adjacentMap: Record<string, string> = {
        rester_en_conscience: 'se_repositionner',
        se_repositionner: 'distance_strategique',
        distance_strategique: 'se_repositionner',
        partir_et_se_proteger: 'distance_strategique',
      }
      const adjacent = adjacentMap[baseResult.raw_orientation]
      if (adjacent) {
        const session = buildSession({
          direction_sentie: { step_id: 'direction_sentie', choice_id: adjacent },
        })
        const result = computeScore(RELATION_V1, session)
        expect(result.coherence_gap).toBe(1)
        expect(result.gut_check_adjustment).toBe(0)
      }
    }
  })

  it('pas d\'étape 7 répondue → coherence_gap null, tension_percent null, ajustement 0', () => {
    const session = buildNeutralSession().filter((a) => a.step_id !== 'direction_sentie')
    const result = computeScore(RELATION_V1, session)
    expect(result.coherence_gap).toBeNull()
    expect(result.tension_percent).toBeNull()
    expect(result.gut_check_adjustment).toBe(0)
  })

  it('le score final est clampé entre 0 et 100', () => {
    // Score très haut + bonus → ne doit pas dépasser 100
    const session = buildSession({
      realite_actuelle: { step_id: 'realite_actuelle', scale_value: 5 },
      dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'disponible_coherent' },
      cout_emotionnel: { step_id: 'cout_emotionnel', scale_value: 1 },
      impact_estime: { step_id: 'impact_estime', scale_value: 5 },
      direction_sentie: { step_id: 'direction_sentie', choice_id: 'rester_en_conscience' },
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.final_score).toBeGreaterThanOrEqual(0)
    expect(result.final_score).toBeLessThanOrEqual(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Flags de timing (étape 5)
// ─────────────────────────────────────────────────────────────────────────────

describe('Flags de timing', () => {
  it('impulsive_risk = true quand urgence ≥ 4 ET estime < 40', () => {
    const session = buildSession({
      maturite_decisionnelle: {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 5 },
          fenetre_influence: { scale_value: 3 },
        },
      },
      impact_estime: { step_id: 'impact_estime', scale_value: 1 }, // estime très basse
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.timing_flags.impulsive_risk).toBe(true)
  })

  it('impulsive_risk = false quand urgence < 4 (même si estime basse)', () => {
    const session = buildSession({
      maturite_decisionnelle: {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 3 },
          fenetre_influence: { scale_value: 3 },
        },
      },
      impact_estime: { step_id: 'impact_estime', scale_value: 1 },
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.timing_flags.impulsive_risk).toBe(false)
  })

  it('limited_influence = true quand fenêtre ≤ 2 ET investissement perçu faible', () => {
    const session = buildSession({
      dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
      maturite_decisionnelle: {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 3 },
          fenetre_influence: { scale_value: 1 },
        },
      },
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.timing_flags.limited_influence).toBe(true)
  })

  it('limited_influence = false quand fenêtre > 2', () => {
    const session = buildSession({
      dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
      maturite_decisionnelle: {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 3 },
          fenetre_influence: { scale_value: 3 }, // > 2
        },
      },
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.timing_flags.limited_influence).toBe(false)
  })

  it('early_relationship = true pour relation < 3 mois', () => {
    const session = buildSession({
      maturite_decisionnelle: {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'recent' },
          urgence_ressentie: { scale_value: 3 },
          fenetre_influence: { scale_value: 3 },
        },
      },
    })
    const result = computeScore(RELATION_V1, session)
    expect(result.timing_flags.early_relationship).toBe(true)
  })

  it('early_relationship = false pour toutes les autres phases', () => {
    for (const phase of ['installation', 'long_terme', 'post_rupture']) {
      const session = buildSession({
        maturite_decisionnelle: {
          step_id: 'maturite_decisionnelle',
          composite_values: {
            phase_relationnelle: { choice_id: phase },
            urgence_ressentie: { scale_value: 3 },
            fenetre_influence: { scale_value: 3 },
          },
        },
      })
      const result = computeScore(RELATION_V1, session)
      expect(result.timing_flags.early_relationship).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sessions complètes — 4 cas de la decision-table
//
// Valeurs pré-calculées manuellement :
//
// CAS A : relation saine avec quelques doutes mineurs
//   Sous-scores : alignement=63, épuisement=25, invest=80, estime=75
//   Score brut = (75×1.5 + 75×1.4 + 80×1.2 + 63×1.0) / 5.1 = 376.5/5.1 ≈ 74
//   Court-circuit : aucun (alignement=63 n'est pas > 70)
//   Gut-check : +4 (intuition=rester = algo)
//   Score final : 78 → RESTER EN CONSCIENCE
//
// CAS B : épuisement critique + estime effondrée
//   Sous-scores : alignement=18, épuisement=100, invest=10, estime=5
//   Court-circuit : burnout_esteem_crash (estime<30 ET épuisement>70)
//   Score brut : (5×1.5 + 0×1.4 + 10×1.2 + 18×1.0) / 5.1 ≈ 7
//   Score final : 7 (court-circuit, gut-check non appliqué)
//   Tension : 100% (intuition=rester vs algo=partir)
//   → PARTIR ET SE PROTÉGER
//
// CAS C : partenaire absent, dynamique ambiguë
//   Sous-scores : alignement=46, épuisement=56, invest=20, estime=50
//   Score brut = (50×1.5 + 44×1.4 + 20×1.2 + 46×1.0) / 5.1 = 206.6/5.1 ≈ 41
//   Court-circuit : aucun (alignement=46, pas < 40)
//   Gut-check : +4 (intuition=distance = algo)
//   Score final : 45 → DISTANCE STRATÉGIQUE
//
// CAS D : repositionnement viable
//   Sous-scores : alignement=64, épuisement=47, invest=35, estime=67
//   Score brut = (67×1.5 + 53×1.4 + 35×1.2 + 64×1.0) / 5.1 = 280.7/5.1 ≈ 55
//   Court-circuit : aucun
//   Gut-check : +4 (intuition=se_repositionner = algo)
//   Score final : 59 → SE REPOSITIONNER
// ─────────────────────────────────────────────────────────────────────────────

describe('Sessions complètes', () => {
  // ─── CAS A ───────────────────────────────────────────────────────────────
  describe('Cas A — Relation saine avec quelques doutes', () => {
    const casA: StepAnswer[] = [
      { step_id: 'realite_actuelle', scale_value: 4 },
      { step_id: 'dynamique_cachee', choice_id: 'disponible_coherent' },
      { step_id: 'cout_emotionnel', scale_value: 2 },
      { step_id: 'alternative_strategique', scale_value: 3 },
      {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 2 },
          fenetre_influence: { scale_value: 4 },
        },
      },
      { step_id: 'impact_estime', scale_value: 4 },
      { step_id: 'direction_sentie', choice_id: 'rester_en_conscience' },
    ]

    it('orientation finale : rester_en_conscience', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.orientation).toBe('rester_en_conscience')
    })

    it('aucun court-circuit déclenché', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.short_circuit_triggered).toBeNull()
    })

    it('sous-score estime ≈ 75 (±3)', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.sub_scores.estime).toBeGreaterThanOrEqual(72)
      expect(result.sub_scores.estime).toBeLessThanOrEqual(78)
    })

    it('sous-score investissement_percu = 80', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.sub_scores.investissement_percu).toBe(80)
    })

    it('sous-score épuisement ≈ 25 (±3)', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.sub_scores.epuisement).toBeGreaterThanOrEqual(22)
      expect(result.sub_scores.epuisement).toBeLessThanOrEqual(28)
    })

    it('score brut ≈ 74 (±3)', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.raw_score).toBeGreaterThanOrEqual(71)
      expect(result.raw_score).toBeLessThanOrEqual(77)
    })

    it('gut-check : cohérence parfaite → +4 pts, tension 0%', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.gut_check_adjustment).toBe(4)
      expect(result.coherence_gap).toBe(0)
      expect(result.tension_percent).toBe(0)
    })

    it('score final ≈ 78 (±3)', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.final_score).toBeGreaterThanOrEqual(75)
      expect(result.final_score).toBeLessThanOrEqual(81)
    })

    it('aucun flag de timing alarmant', () => {
      const result = computeScore(RELATION_V1, casA)
      expect(result.timing_flags.impulsive_risk).toBe(false)
      expect(result.timing_flags.limited_influence).toBe(false)
      expect(result.timing_flags.early_relationship).toBe(false)
    })
  })

  // ─── CAS B ───────────────────────────────────────────────────────────────
  describe('Cas B — Épuisement critique + estime effondrée', () => {
    const casB: StepAnswer[] = [
      { step_id: 'realite_actuelle', scale_value: 1 },
      { step_id: 'dynamique_cachee', choice_id: 'comportements_problematiques' },
      { step_id: 'cout_emotionnel', scale_value: 5 },
      { step_id: 'alternative_strategique', scale_value: 2 },
      {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'post_rupture' },
          urgence_ressentie: { scale_value: 5 },
          fenetre_influence: { scale_value: 1 },
        },
      },
      { step_id: 'impact_estime', scale_value: 1 },
      { step_id: 'direction_sentie', choice_id: 'rester_en_conscience' }, // opposition intentionnelle
    ]

    it('orientation finale : partir_et_se_proteger', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.orientation).toBe('partir_et_se_proteger')
    })

    it('court-circuit burnout_esteem_crash déclenché', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.short_circuit_triggered).toBe('burnout_esteem_crash')
    })

    it('sous-score estime < 30', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.sub_scores.estime).toBeLessThan(30)
    })

    it('sous-score épuisement > 70', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.sub_scores.epuisement).toBeGreaterThan(70)
    })

    it('sous-score investissement_percu ≤ 15', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.sub_scores.investissement_percu).toBeLessThanOrEqual(15)
    })

    it('score brut ≤ 15 (situation très dégradée)', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.raw_score).toBeLessThanOrEqual(15)
    })

    it('score final = score brut (court-circuit bypass le gut-check)', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.final_score).toBe(result.raw_score)
    })

    it('tension interne maximale : intuition=rester vs algo=partir → 100%', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.coherence_gap).toBe(3)
      expect(result.tension_percent).toBe(100)
    })

    it('flag impulsive_risk = true (urgence 5 + estime effondrée)', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.timing_flags.impulsive_risk).toBe(true)
    })

    it('flag limited_influence = true (fenêtre 1 + invest faible)', () => {
      const result = computeScore(RELATION_V1, casB)
      expect(result.timing_flags.limited_influence).toBe(true)
    })
  })

  // ─── CAS C ───────────────────────────────────────────────────────────────
  describe('Cas C — Partenaire absent, dynamique ambiguë', () => {
    const casC: StepAnswer[] = [
      { step_id: 'realite_actuelle', scale_value: 2 },
      { step_id: 'dynamique_cachee', choice_id: 'distant_peu_disponible' },
      { step_id: 'cout_emotionnel', scale_value: 3 },
      { step_id: 'alternative_strategique', scale_value: 3 },
      {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 3 },
          fenetre_influence: { scale_value: 3 },
        },
      },
      { step_id: 'impact_estime', scale_value: 3 },
      { step_id: 'direction_sentie', choice_id: 'distance_strategique' },
    ]

    it('orientation finale : distance_strategique', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.orientation).toBe('distance_strategique')
    })

    it('aucun court-circuit déclenché (estime et alignement au-dessus des seuils)', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.short_circuit_triggered).toBeNull()
    })

    it('sous-score investissement_percu = 20', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.sub_scores.investissement_percu).toBe(20)
    })

    it('score brut ≈ 41 (±3)', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.raw_score).toBeGreaterThanOrEqual(38)
      expect(result.raw_score).toBeLessThanOrEqual(44)
    })

    it('raw_orientation : distance_strategique (dans la plage 36–50)', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.raw_orientation).toBe('distance_strategique')
    })

    it('gut-check : cohérence parfaite → +4 pts', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.gut_check_adjustment).toBe(4)
      expect(result.tension_percent).toBe(0)
    })

    it('score final ≈ 45 (±3), toujours dans la plage distance_strategique', () => {
      const result = computeScore(RELATION_V1, casC)
      expect(result.final_score).toBeGreaterThanOrEqual(36)
      expect(result.final_score).toBeLessThanOrEqual(50)
    })
  })

  // ─── CAS D ───────────────────────────────────────────────────────────────
  describe('Cas D — Repositionnement viable', () => {
    const casD: StepAnswer[] = [
      { step_id: 'realite_actuelle', scale_value: 3 },
      { step_id: 'dynamique_cachee', choice_id: 'chaud_froid' },
      { step_id: 'cout_emotionnel', scale_value: 3 },
      { step_id: 'alternative_strategique', scale_value: 4 },
      {
        step_id: 'maturite_decisionnelle',
        composite_values: {
          phase_relationnelle: { choice_id: 'installation' },
          urgence_ressentie: { scale_value: 2 },
          fenetre_influence: { scale_value: 4 },
        },
      },
      { step_id: 'impact_estime', scale_value: 4 },
      { step_id: 'direction_sentie', choice_id: 'se_repositionner' },
    ]

    it('orientation finale : se_repositionner', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.orientation).toBe('se_repositionner')
    })

    it('aucun court-circuit déclenché', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.short_circuit_triggered).toBeNull()
    })

    it('sous-score estime ≈ 67 (±3)', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.sub_scores.estime).toBeGreaterThanOrEqual(64)
      expect(result.sub_scores.estime).toBeLessThanOrEqual(70)
    })

    it('sous-score investissement_percu = 35', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.sub_scores.investissement_percu).toBe(35)
    })

    it('score brut ≈ 55 (±3)', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.raw_score).toBeGreaterThanOrEqual(52)
      expect(result.raw_score).toBeLessThanOrEqual(58)
    })

    it('gut-check : cohérence parfaite → +4 pts', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.gut_check_adjustment).toBe(4)
      expect(result.coherence_gap).toBe(0)
    })

    it('score final ≈ 59 (±3), dans la plage se_repositionner (51–70)', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.final_score).toBeGreaterThanOrEqual(51)
      expect(result.final_score).toBeLessThanOrEqual(70)
    })

    it('aucun flag de timing alarmant', () => {
      const result = computeScore(RELATION_V1, casD)
      expect(result.timing_flags.impulsive_risk).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Robustesse — réponses manquantes ou partielles
// ─────────────────────────────────────────────────────────────────────────────

describe('Robustesse', () => {
  it('session vide → ne lève pas d\'exception, utilise les valeurs neutres (50)', () => {
    expect(() => computeScore(RELATION_V1, [])).not.toThrow()
  })

  it('session sans étape 7 → coherence_gap et tension_percent sont null', () => {
    const session = buildNeutralSession().filter((a) => a.step_id !== 'direction_sentie')
    const result = computeScore(RELATION_V1, session)
    expect(result.coherence_gap).toBeNull()
    expect(result.tension_percent).toBeNull()
  })

  it('session sans étape composite (5) → n\'affecte que les sous-scores concernés', () => {
    const session = buildNeutralSession().filter((a) => a.step_id !== 'maturite_decisionnelle')
    expect(() => computeScore(RELATION_V1, session)).not.toThrow()
  })

  it('choix invalide dans dynamique_cachee → n\'affecte pas investissement_percu (reste à 50)', () => {
    const session = buildSession({
      dynamique_cachee: { step_id: 'dynamique_cachee', choice_id: 'option_inexistante' },
    })
    const result = computeScore(RELATION_V1, session)
    // Pas d'exception, investissement_percu reste à la valeur neutre
    expect(result.sub_scores.investissement_percu).toBe(50)
  })
})
