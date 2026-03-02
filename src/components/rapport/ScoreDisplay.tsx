import type { OrientationId } from '@/protocol/types'
import { OrientationBadge } from './OrientationBadge'

const SUB_SCORE_LABELS: Record<string, string> = {
  alignement:             'Alignement',
  epuisement:             'Épuisement',
  investissement_percu:   'Investissement perçu',
  estime:                 'Estime de soi',
}

type ScoringData = {
  final_score: number
  orientation: OrientationId
  sub_scores: Record<string, number>
  short_circuit_triggered: string | null
  gut_check_adjustment: number
  coherence_gap: number | null
  tension_percent: number | null
  timing_flags?: {
    impulsive_risk: boolean
    limited_influence: boolean
    early_relationship: boolean
  } | null
}

export function ScoreDisplay({ scoring }: { scoring: ScoringData }) {
  const flags = scoring.timing_flags ?? null

  return (
    <div className="space-y-6">
      {/* Orientation + score global */}
      <div className="text-center space-y-4 py-2">
        <OrientationBadge orientation={scoring.orientation} />
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-6xl font-heading font-bold text-navy tabular-nums">
            {scoring.final_score}
          </span>
          <span className="text-2xl text-gray-300 font-light">/100</span>
        </div>
        {scoring.gut_check_adjustment !== 0 && (
          <p className="text-xs text-gray-400 font-body">
            Ajustement intuition :{' '}
            <span className={scoring.gut_check_adjustment > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
              {scoring.gut_check_adjustment > 0 ? '+' : ''}{scoring.gut_check_adjustment} pts
            </span>
          </p>
        )}
        {scoring.short_circuit_triggered && (
          <p className="text-xs text-gold-hover bg-gold-light border border-gold/30 rounded-full px-3 py-1 inline-block font-body font-medium">
            Règle de priorité activée
          </p>
        )}
      </div>

      {/* Sous-scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(scoring.sub_scores).map(([key, value]) => (
          <div key={key} className="bg-neutral rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-2 font-heading uppercase tracking-wider">
              {SUB_SCORE_LABELS[key] ?? key}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all"
                  style={{ width: `${Math.round(value)}%` }}
                />
              </div>
              <span className="text-sm font-heading font-bold text-navy w-7 text-right tabular-nums">
                {Math.round(value)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Signaux contextuels */}
      {flags && (flags.impulsive_risk || flags.limited_influence || flags.early_relationship) && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-heading font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Signaux contextuels
          </p>
          {flags.impulsive_risk && (
            <p className="text-sm text-amber-800 font-body">
              ⚡ Risque de décision impulsive — prenez le temps de laisser décanter.
            </p>
          )}
          {flags.limited_influence && (
            <p className="text-sm text-amber-800 font-body">
              🔒 Fenêtre d'influence limitée — votre levier d'action est réduit.
            </p>
          )}
          {flags.early_relationship && (
            <p className="text-sm text-amber-800 font-body">
              🌿 Relation récente — les données sont encore incomplètes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
